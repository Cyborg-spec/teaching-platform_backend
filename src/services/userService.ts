import { db } from '../config/firebase';
import { User, UserRole } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';
import { authService } from './authService';

export class UserService {
  private collection = db.collection('users');

  /**
   * Get all users with optional filters
   */
  async getAll(filters?: {
    role?: UserRole;
    groupId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<User[]> {
    let query: FirebaseFirestore.Query = this.collection;

    if (filters?.role) {
      query = query.where('role', '==', filters.role);
    }
    if (filters?.groupId) {
      query = query.where('groupId', '==', filters.groupId);
    }
    if (filters?.isActive !== undefined) {
      query = query.where('isActive', '==', filters.isActive);
    }

    query = query.orderBy('createdAt', 'desc');
    const snapshot = await query.get();
    let users = docsToObjects<User>(snapshot);
    users.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    // Client-side text search (Firestore doesn't support full text search)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower)
      );
    }

    return users;
  }

  /**
   * Get a single user by ID
   */
  async getById(userId: string): Promise<User> {
    const doc = await this.collection.doc(userId).get();
    if (!doc.exists) throw AppError.notFound('User', userId);
    return { id: doc.id, ...doc.data() } as User;
  }

  /**
   * Update user (admin operation)
   */
  async update(
    userId: string,
    data: Partial<Pick<User, 'displayName' | 'role' | 'groupId' | 'isActive'>>
  ): Promise<void> {
    const userDoc = await this.collection.doc(userId).get();
    if (!userDoc.exists) throw AppError.notFound('User', userId);

    const currentUser = userDoc.data() as User;
    const updateData: Record<string, any> = {};

    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
      // Also toggle Firebase Auth disabled state
      const { auth } = require('../config/firebase');
      await auth.updateUser(userId, { disabled: !data.isActive });
    }
    if (data.role !== undefined) {
      updateData.role = data.role;
      // Update custom claims
      const { auth } = require('../config/firebase');
      await auth.setCustomUserClaims(userId, {
        role: data.role,
        groupId: data.groupId ?? currentUser.groupId,
      });
    }
    if (data.groupId !== undefined && data.groupId !== currentUser.groupId) {
      updateData.groupId = data.groupId;
      // Update custom claims
      const { auth } = require('../config/firebase');
      await auth.setCustomUserClaims(userId, {
        role: data.role ?? currentUser.role,
        groupId: data.groupId,
      });

      // Update group studentIds
      const { FieldValue } = require('firebase-admin/firestore');
      if (currentUser.groupId) {
        await db.collection('groups').doc(currentUser.groupId).update({
          studentIds: FieldValue.arrayRemove(userId)
        });
      }
      if (data.groupId) {
        await db.collection('groups').doc(data.groupId).update({
          studentIds: FieldValue.arrayUnion(userId)
        });
      }
    }

    await this.collection.doc(userId).update(updateData);
  }

  /**
   * Soft delete (deactivate) a user
   */
  async deactivate(userId: string): Promise<void> {
    await authService.deactivateUser(userId);
  }

  /**
   * Reactivate a user
   */
  async reactivate(userId: string): Promise<void> {
    await authService.reactivateUser(userId);
  }

  /**
   * Hard delete a user
   */
  async delete(userId: string): Promise<void> {
    const userDoc = await this.collection.doc(userId).get();
    if (userDoc.exists) {
      const user = userDoc.data() as User;
      if (user.groupId) {
        const { FieldValue } = require('firebase-admin/firestore');
        await db.collection('groups').doc(user.groupId).update({
          studentIds: FieldValue.arrayRemove(userId)
        });
      }
    }

    await authService.deleteUser(userId);
    await this.collection.doc(userId).delete();
  }

  /**
   * Bulk deactivate users
   */
  async bulkDeactivate(userIds: string[]): Promise<void> {
    const batch = db.batch();
    for (const uid of userIds) {
      batch.update(this.collection.doc(uid), { isActive: false });
    }
    await batch.commit();

    // Also disable in Firebase Auth
    const { auth } = require('../config/firebase');
    for (const uid of userIds) {
      await auth.updateUser(uid, { disabled: true });
    }
  }

  /**
   * Bulk move users to a different group
   */
  async bulkMoveToGroup(userIds: string[], newGroupId: string): Promise<void> {
    const groupDoc = await db.collection('groups').doc(newGroupId).get();
    if (!groupDoc.exists) throw AppError.notFound('Group', newGroupId);

    const batch = db.batch();
    const { FieldValue } = require('firebase-admin/firestore');
    for (const uid of userIds) {
      batch.update(this.collection.doc(uid), { groupId: newGroupId });
      // Remove from old group and add to new group
      const userDoc = await this.collection.doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        if (userData.groupId && userData.groupId !== newGroupId) {
          batch.update(db.collection('groups').doc(userData.groupId), {
            studentIds: FieldValue.arrayRemove(uid)
          });
        }
      }
      batch.update(db.collection('groups').doc(newGroupId), {
        studentIds: FieldValue.arrayUnion(uid)
      });
    }
    await batch.commit();

    // Update custom claims
    const { auth } = require('../config/firebase');
    for (const uid of userIds) {
      const userDoc = await this.collection.doc(uid).get();
      const userData = userDoc.data()!;
      await auth.setCustomUserClaims(uid, {
        role: userData.role,
        groupId: newGroupId,
      });
    }
  }

  /**
   * Get counts by role
   */
  async getCounts(): Promise<{ admin: number; teacher: number; student: number; total: number }> {
    const snapshot = await this.collection.where('isActive', '==', true).get();
    const counts = { admin: 0, teacher: 0, student: 0, total: 0 };

    snapshot.docs.forEach((doc) => {
      const role = doc.data().role as UserRole;
      counts[role]++;
      counts.total++;
    });

    return counts;
  }
}

export const userService = new UserService();
