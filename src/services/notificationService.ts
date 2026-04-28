import { db } from '../config/firebase';
import { Notification } from '../models/types';
import { now } from '../utils/firestoreHelpers';
import { v4 as uuidv4 } from 'uuid';

export class NotificationService {
  private collection = db.collection('notifications');

  /**
   * Create a notification
   */
  async create(data: {
    userId: string;
    type: Notification['type'];
    title: string;
    message: string;
    actionUrl?: string;
  }): Promise<void> {
    const notification: Omit<Notification, 'id'> = {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      read: false,
      actionUrl: data.actionUrl || null,
      createdAt: now(),
    };

    await this.collection.add(notification);
  }

  /**
   * Get notifications for a user
   */
  async getForUser(userId: string, limit: number = 20): Promise<Notification[]> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Notification));
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('read', '==', false)
      .count()
      .get();

    return snapshot.data().count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.collection.doc(notificationId).update({ read: true });
  }

  /**
   * Mark all as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });
    await batch.commit();
  }

  /**
   * Notify teacher about new submission
   */
  async notifyNewSubmission(teacherId: string, studentName: string, taskTitle: string): Promise<void> {
    await this.create({
      userId: teacherId,
      type: 'new_submission',
      title: 'New Task Submission',
      message: `${studentName} submitted "${taskTitle}"`,
      actionUrl: '/teacher/submissions',
    });
  }

  /**
   * Notify student about task review
   */
  async notifyTaskReviewed(studentId: string, taskTitle: string, status: string): Promise<void> {
    await this.create({
      userId: studentId,
      type: 'task_reviewed',
      title: 'Task Reviewed',
      message: `Your submission for "${taskTitle}" has been ${status}`,
      actionUrl: '/student/tasks',
    });
  }

  /**
   * Notify students about new quiz
   */
  async notifyQuizAvailable(studentIds: string[], quizTitle: string, groupId: string): Promise<void> {
    for (const studentId of studentIds) {
      await this.create({
        userId: studentId,
        type: 'quiz_available',
        title: 'New Quiz Available',
        message: `"${quizTitle}" is now open. Good luck!`,
        actionUrl: '/student/quizzes',
      });
    }
  }
}

export const notificationService = new NotificationService();
