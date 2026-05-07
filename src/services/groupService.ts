import { db } from '../config/firebase';
import { Group, CreateGroupDTO, CoinStoreItem } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';
import { FieldValue } from 'firebase-admin/firestore';

export class GroupService {
  private collection = db.collection('groups');

  /**
   * Get all groups
   */
  async getAll(filters?: { isActive?: boolean; teacherId?: string }): Promise<Group[]> {
    let query: FirebaseFirestore.Query = this.collection;

    if (filters?.isActive !== undefined) {
      query = query.where('isActive', '==', filters.isActive);
    }
    if (filters?.teacherId) {
      query = query.where('teacherId', '==', filters.teacherId);
    }

    query = query.orderBy('createdAt', 'desc');
    const snapshot = await query.get();
    return docsToObjects<Group>(snapshot);
  }

  /**
   * Get a single group
   */
  async getById(groupId: string): Promise<Group> {
    const doc = await this.collection.doc(groupId).get();
    if (!doc.exists) throw AppError.notFound('Group', groupId);
    return { id: doc.id, ...doc.data() } as Group;
  }

  /**
   * Create a new group
   */
  async create(dto: CreateGroupDTO): Promise<Group> {
    // Verify teacher exists and is actually a teacher
    const teacherDoc = await db.collection('users').doc(dto.teacherId).get();
    if (!teacherDoc.exists) throw AppError.notFound('Teacher', dto.teacherId);
    if (teacherDoc.data()?.role !== 'teacher' && teacherDoc.data()?.role !== 'admin') {
      throw AppError.badRequest('INVALID_TEACHER', 'The specified user is not a teacher');
    }

    const defaultStoreItems: CoinStoreItem[] = [
      {
        id: 'skip_task',
        name: 'Skip a Task',
        description: 'Skip one homework task',
        cost: 100,
        category: 'privilege',
        isAvailable: true,
        unlocksAtMonth: 0,
        icon: '⏭️',
      },
      {
        id: 'extra_hint',
        name: 'Extra Hint',
        description: 'Get an extra hint during a lesson',
        cost: 30,
        category: 'privilege',
        isAvailable: true,
        unlocksAtMonth: 0,
        icon: '💡',
      },
      {
        id: 'choose_theme',
        name: 'Choose Blooket Theme',
        description: 'Pick the Blooket theme for next lesson',
        cost: 50,
        category: 'privilege',
        isAvailable: true,
        unlocksAtMonth: 0,
        icon: '🎨',
      },
      {
        id: 'teacher_challenge',
        name: 'Challenge the Teacher',
        description: 'Challenge the teacher to solve a coding puzzle',
        cost: 150,
        category: 'privilege',
        isAvailable: true,
        unlocksAtMonth: 2,
        icon: '🏆',
      },
      {
        id: 'custom_avatar',
        name: 'Custom Avatar',
        description: 'Get a custom-designed avatar',
        cost: 75,
        category: 'digital',
        isAvailable: true,
        unlocksAtMonth: 1,
        icon: '🎭',
      },
    ];

    const timestamp = now();
    const groupData: Omit<Group, 'id'> = {
      name: dto.name,
      teacherId: dto.teacherId,
      studentIds: dto.studentIds || [],
      monthIndex: 0,
      createdAt: timestamp,
      isActive: true,
      coinStoreItems: defaultStoreItems,
    };

    const docRef = await this.collection.add(groupData);
    return { id: docRef.id, ...groupData };
  }

  /**
   * Update a group
   */
  async update(
    groupId: string,
    data: Partial<Pick<Group, 'name' | 'teacherId' | 'monthIndex' | 'isActive' | 'coinStoreItems'>>
  ): Promise<void> {
    const doc = await this.collection.doc(groupId).get();
    if (!doc.exists) throw AppError.notFound('Group', groupId);

    if (data.teacherId) {
      const teacherDoc = await db.collection('users').doc(data.teacherId).get();
      if (!teacherDoc.exists) throw AppError.notFound('Teacher', data.teacherId);
      const role = teacherDoc.data()?.role;
      if (role !== 'teacher' && role !== 'admin') {
        throw AppError.badRequest('INVALID_TEACHER', 'The specified user is not a teacher');
      }
    }

    await this.collection.doc(groupId).update(data);
  }

  /**
   * Add a student to a group
   */
  async addStudent(groupId: string, studentId: string): Promise<void> {
    const groupDoc = await this.collection.doc(groupId).get();
    if (!groupDoc.exists) throw AppError.notFound('Group', groupId);

    await this.collection.doc(groupId).update({
      studentIds: FieldValue.arrayUnion(studentId),
    });

    // Update student's groupId
    await db.collection('users').doc(studentId).update({ groupId });
  }

  /**
   * Remove a student from a group
   */
  async removeStudent(groupId: string, studentId: string): Promise<void> {
    await this.collection.doc(groupId).update({
      studentIds: FieldValue.arrayRemove(studentId),
    });

    await db.collection('users').doc(studentId).update({ groupId: null });
  }

  /**
   * Archive a group (soft delete)
   */
  async archive(groupId: string): Promise<void> {
    await this.collection.doc(groupId).update({ isActive: false });
  }

  /**
   * Get groups for a teacher
   */
  async getByTeacher(teacherId: string): Promise<Group[]> {
    const snapshot = await this.collection
      .where('teacherId', '==', teacherId)
      .where('isActive', '==', true)
      .get();
    return docsToObjects<Group>(snapshot);
  }

  /**
   * Verify teacher owns a group
   */
  async verifyTeacherAccess(teacherId: string, groupId: string): Promise<boolean> {
    const doc = await this.collection.doc(groupId).get();
    if (!doc.exists) return false;
    return doc.data()?.teacherId === teacherId;
  }

  /**
   * Get students in a group
   */
  async getStudents(groupId: string): Promise<any[]> {
    const group = await this.getById(groupId);
    if (group.studentIds.length === 0) return [];

    const students = [];
    const missingIds = [];
    for (const studentId of group.studentIds) {
      const userDoc = await db.collection('users').doc(studentId).get();
      if (userDoc.exists) {
        const coinDoc = await db.collection('coins').doc(studentId).get();
        students.push({
          ...userDoc.data(),
          id: userDoc.id,
          coins: coinDoc.exists ? coinDoc.data() : { totalCoins: 0 },
        });
      } else {
        missingIds.push(studentId);
      }
    }

    if (missingIds.length > 0) {
      await this.collection.doc(groupId).update({
        studentIds: FieldValue.arrayRemove(...missingIds)
      });
    }

    return students;
  }
}

export const groupService = new GroupService();
