import { auth, db } from '../config/firebase';
import { CreateUserDTO, User, UserRole } from '../models/types';
import { AppError } from '../utils/appError';
import { now } from '../utils/firestoreHelpers';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  /**
   * Create a new user (admin creates teacher, teacher creates student)
   */
  async createUser(dto: CreateUserDTO, createdByRole: UserRole): Promise<User> {
    // Validate role hierarchy
    if (createdByRole === 'teacher' && dto.role !== 'student') {
      throw AppError.forbidden('Teachers can only create student accounts');
    }
    if (createdByRole === 'student') {
      throw AppError.forbidden('Students cannot create accounts');
    }

    // Check if email already exists
    try {
      await auth.getUserByEmail(dto.email);
      throw AppError.conflict('EMAIL_EXISTS', `An account with email ${dto.email} already exists`);
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      // auth/user-not-found is expected — means email is available
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Validate group assignment for students
    if (dto.role === 'student') {
      if (!dto.groupId) {
        throw AppError.badRequest('GROUP_REQUIRED', 'Students must be assigned to a group');
      }
      const groupDoc = await db.collection('groups').doc(dto.groupId).get();
      if (!groupDoc.exists) {
        throw AppError.notFound('Group', dto.groupId);
      }
    }

    // Create Firebase Auth user
    const firebaseUser = await auth.createUser({
      email: dto.email,
      password: dto.temporaryPassword,
      displayName: dto.displayName,
    });

    // Set custom claims
    await auth.setCustomUserClaims(firebaseUser.uid, {
      role: dto.role,
      groupId: dto.groupId || null,
    });

    const timestamp = now();

    // Create Firestore user document
    const user: Omit<User, 'id'> = {
      email: dto.email,
      displayName: dto.displayName,
      role: dto.role,
      groupId: dto.groupId || null,
      avatarUrl: null,
      isActive: true,
      mustChangePassword: true,
      language: dto.language || 'en',
      createdAt: timestamp,
      lastLoginAt: timestamp,
    };

    await db.collection('users').doc(firebaseUser.uid).set(user);

    // If student, add to group's studentIds array
    if (dto.role === 'student' && dto.groupId) {
      await db.collection('groups').doc(dto.groupId).update({
        studentIds: admin_firestore_FieldValue_arrayUnion(firebaseUser.uid),
      });

      // Create coin account for student
      await db.collection('coins').doc(firebaseUser.uid).set({
        studentId: firebaseUser.uid,
        groupId: dto.groupId,
        totalCoins: 0,
        weeklyCoins: 0,
        monthlyCoins: 0,
        allTimeCoins: 0,
        transactions: [],
      });
    }

    return { id: firebaseUser.uid, ...user };
  }

  /**
   * Change password on first login
   */
  async changePassword(uid: string, newPassword: string): Promise<void> {
    await auth.updateUser(uid, { password: newPassword });
    await db.collection('users').doc(uid).update({
      mustChangePassword: false,
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(uid: string): Promise<User | null> {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as User;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const snapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as User;
  }

  /**
   * Update user profile
   */
  async updateProfile(uid: string, data: { displayName?: string; avatarUrl?: string; language?: string }): Promise<void> {
    const updateData: Record<string, any> = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.language !== undefined) updateData.language = data.language;

    await db.collection('users').doc(uid).update(updateData);

    if (data.displayName) {
      await auth.updateUser(uid, { displayName: data.displayName });
    }
  }

  /**
   * Deactivate a user (soft delete)
   */
  async deactivateUser(uid: string): Promise<void> {
    await db.collection('users').doc(uid).update({ isActive: false });
    await auth.updateUser(uid, { disabled: true });
  }

  /**
   * Reactivate a user
   */
  async reactivateUser(uid: string): Promise<void> {
    await db.collection('users').doc(uid).update({ isActive: true });
    await auth.updateUser(uid, { disabled: false });
  }

  /**
   * Reset a user's password
   */
  async resetPassword(uid: string, newPassword: string): Promise<void> {
    await auth.updateUser(uid, { password: newPassword });
    await db.collection('users').doc(uid).update({ mustChangePassword: true });
  }

  /**
   * Hard delete a user
   */
  async deleteUser(uid: string): Promise<void> {
    await auth.deleteUser(uid);
  }
}

// Helper - need to import FieldValue separately
import { FieldValue } from 'firebase-admin/firestore';
function admin_firestore_FieldValue_arrayUnion(value: string) {
  return FieldValue.arrayUnion(value);
}

export const authService = new AuthService();
