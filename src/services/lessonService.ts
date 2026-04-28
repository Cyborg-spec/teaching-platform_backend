import { db } from '../config/firebase';
import { LessonDocument, LessonLog, StudentNote } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';

export class LessonService {
  private lessonsCollection = db.collection('lessons');
  private logsCollection = db.collection('lesson_logs');

  // ============= LESSONS =============

  /**
   * Get lessons for a group
   */
  async getLessonsForGroup(groupId: string): Promise<LessonDocument[]> {
    const snapshot = await this.lessonsCollection
      .where('groupId', '==', groupId)
      .orderBy('lessonNumber', 'asc')
      .get();
    return docsToObjects<LessonDocument>(snapshot);
  }

  /**
   * Get a single lesson
   */
  async getLesson(lessonId: string): Promise<LessonDocument> {
    const doc = await this.lessonsCollection.doc(lessonId).get();
    if (!doc.exists) throw AppError.notFound('Lesson', lessonId);
    return { id: doc.id, ...doc.data() } as LessonDocument;
  }

  /**
   * Update lesson status
   */
  async updateStatus(lessonId: string, status: LessonDocument['status']): Promise<void> {
    const updates: Record<string, any> = { status };
    if (status === 'completed') {
      updates.completedDate = now();
    }
    await this.lessonsCollection.doc(lessonId).update(updates);
  }

  /**
   * Schedule a lesson
   */
  async schedule(lessonId: string, date: Date): Promise<void> {
    await this.lessonsCollection.doc(lessonId).update({
      scheduledDate: date,
      status: 'planned',
    });
  }

  // ============= LESSON LOGS =============

  /**
   * Create a lesson log
   */
  async createLog(data: Omit<LessonLog, 'id' | 'createdAt'>): Promise<LessonLog> {
    const logData = {
      ...data,
      createdAt: now(),
    };

    const docRef = await this.logsCollection.add(logData);

    // Mark lesson as completed
    await this.updateStatus(data.lessonId, 'completed');

    return { id: docRef.id, ...logData } as LessonLog;
  }

  /**
   * Update a lesson log (draft saves)
   */
  async updateLog(logId: string, data: Partial<LessonLog>): Promise<void> {
    const doc = await this.logsCollection.doc(logId).get();
    if (!doc.exists) throw AppError.notFound('LessonLog', logId);
    await this.logsCollection.doc(logId).update(data);
  }

  /**
   * Get a single lesson log
   */
  async getLog(logId: string): Promise<LessonLog> {
    const doc = await this.logsCollection.doc(logId).get();
    if (!doc.exists) throw AppError.notFound('LessonLog', logId);
    return { id: doc.id, ...doc.data() } as LessonLog;
  }

  /**
   * Get all logs for a group
   */
  async getLogsForGroup(groupId: string, filters?: {
    monthId?: string;
    lessonNumber?: number;
  }): Promise<LessonLog[]> {
    let query: FirebaseFirestore.Query = this.logsCollection
      .where('groupId', '==', groupId);

    const snapshot = await query.orderBy('date', 'desc').get();
    return docsToObjects<LessonLog>(snapshot);
  }

  /**
   * Get most recent log for a group
   */
  async getMostRecentLog(groupId: string): Promise<LessonLog | null> {
    const snapshot = await this.logsCollection
      .where('groupId', '==', groupId)
      .orderBy('date', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as LessonLog;
  }

  /**
   * Get students needing catch-up from recent logs
   */
  async getCatchupQueue(groupId: string): Promise<{
    studentId: string;
    consecutiveFlagged: number;
    reasons: string[];
  }[]> {
    const logs = await this.getLogsForGroup(groupId);

    // Count consecutive catch-up flags per student
    const catchupMap = new Map<string, { count: number; reasons: string[] }>();

    for (const log of logs) {
      for (const studentId of log.catchupNeeded || []) {
        const existing = catchupMap.get(studentId) || { count: 0, reasons: [] };
        existing.count++;
        const studentNote = log.studentNotes?.find((n) => n.studentId === studentId);
        if (studentNote?.note) existing.reasons.push(studentNote.note);
        catchupMap.set(studentId, existing);
      }
    }

    return Array.from(catchupMap.entries()).map(([studentId, data]) => ({
      studentId,
      consecutiveFlagged: data.count,
      reasons: data.reasons,
    }));
  }
}

export const lessonService = new LessonService();
