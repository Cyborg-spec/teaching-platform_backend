import { db } from '../config/firebase';
import { CatchupMeeting } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';
import { coinService } from './coinService';

export class CatchupService {
  private collection = db.collection('catchup_meetings');

  /**
   * Create a catch-up meeting
   */
  async create(data: {
    studentId: string;
    groupId: string;
    teacherId: string;
    scheduledAt: Date;
    topicsCovered: string[];
  }): Promise<CatchupMeeting> {
    const meetingData: Omit<CatchupMeeting, 'id'> = {
      studentId: data.studentId,
      groupId: data.groupId,
      teacherId: data.teacherId,
      scheduledAt: now(),
      completedAt: null,
      topicsCovered: data.topicsCovered,
      notes: '',
      analogiesUsed: [],
      coinsAwarded: 15,
      status: 'scheduled',
      outcome: '',
    };

    const docRef = await this.collection.add(meetingData);
    return { id: docRef.id, ...meetingData } as CatchupMeeting;
  }

  /**
   * Complete a meeting
   */
  async complete(meetingId: string, data: {
    notes: string;
    analogiesUsed: string[];
    outcome: string;
    coinsAwarded?: number;
  }): Promise<void> {
    const doc = await this.collection.doc(meetingId).get();
    if (!doc.exists) throw AppError.notFound('CatchupMeeting', meetingId);

    const meeting = doc.data() as CatchupMeeting;
    const coins = data.coinsAwarded ?? 15;

    await this.collection.doc(meetingId).update({
      completedAt: now(),
      notes: data.notes,
      analogiesUsed: data.analogiesUsed,
      outcome: data.outcome,
      coinsAwarded: coins,
      status: 'completed',
    });

    // Award coins to student
    if (coins > 0) {
      await coinService.awardCoins(
        meeting.studentId,
        meeting.groupId,
        coins,
        'Catch-up meeting attended',
        'catchup',
        meetingId,
        meeting.teacherId
      );
    }
  }

  /**
   * Cancel a meeting
   */
  async cancel(meetingId: string): Promise<void> {
    await this.collection.doc(meetingId).update({ status: 'cancelled' });
  }

  /**
   * Get catch-up queue for a group
   */
  async getQueue(groupId: string): Promise<CatchupMeeting[]> {
    const snapshot = await this.collection
      .where('groupId', '==', groupId)
      .where('status', '==', 'scheduled')
      .orderBy('scheduledAt', 'asc')
      .get();
    return docsToObjects<CatchupMeeting>(snapshot);
  }

  /**
   * Get history for a student
   */
  async getStudentHistory(studentId: string): Promise<CatchupMeeting[]> {
    const snapshot = await this.collection
      .where('studentId', '==', studentId)
      .orderBy('scheduledAt', 'desc')
      .get();
    return docsToObjects<CatchupMeeting>(snapshot);
  }
}

export const catchupService = new CatchupService();
