import { db } from '../config/firebase';
import { TaskSubmission } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';
import { coinService } from './coinService';
import { notificationService } from './notificationService';

export class TaskService {
  private tasksCollection = db.collection('tasks');
  private submissionsCollection = db.collection('task_submissions');

  // ============= TASKS =============

  /**
   * Get tasks for a group
   */
  async getTasksForGroup(groupId: string): Promise<any[]> {
    const snapshot = await this.tasksCollection
      .where('groupId', '==', groupId)
      .orderBy('dueDate', 'asc')
      .get();
    return docsToObjects<any>(snapshot);
  }

  /**
   * Create a task from lesson data
   */
  async createTask(data: {
    lessonId: string;
    groupId: string;
    title: string;
    description: string;
    minimumVersion: string;
    extensionVersion: string;
    dueDate?: Date;
    isFinishAtHome: boolean;
  }): Promise<any> {
    const taskData = {
      ...data,
      dueDate: data.dueDate || null,
      createdAt: now(),
    };

    const docRef = await this.tasksCollection.add(taskData);
    return { id: docRef.id, ...taskData };
  }

  // ============= SUBMISSIONS =============

  /**
   * Submit a task (student)
   */
  async submitTask(data: {
    taskId: string;
    studentId: string;
    groupId: string;
    lessonId: string;
    code: string;
    notes: string;
    fileUrls: string[];
  }): Promise<TaskSubmission> {
    // Check for existing submission (allow resubmission if not reviewed)
    const existing = await this.submissionsCollection
      .where('taskId', '==', data.taskId)
      .where('studentId', '==', data.studentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingData = existing.docs[0].data();
      if (existingData.status === 'reviewed') {
        throw AppError.conflict('ALREADY_REVIEWED', 'This task has already been reviewed. Contact your teacher.');
      }
      // Update existing submission
      await this.submissionsCollection.doc(existing.docs[0].id).update({
        code: data.code,
        notes: data.notes,
        fileUrls: data.fileUrls,
        status: 'submitted',
        submittedAt: now(),
      });
      return { id: existing.docs[0].id, ...existingData, ...data, status: 'submitted' } as TaskSubmission;
    }

    const submissionData: Omit<TaskSubmission, 'id'> = {
      taskId: data.taskId,
      studentId: data.studentId,
      groupId: data.groupId,
      lessonId: data.lessonId,
      code: data.code,
      notes: data.notes,
      fileUrls: data.fileUrls,
      status: 'submitted',
      teacherFeedback: null,
      coinsAwarded: 0,
      submittedAt: now(),
      reviewedAt: null,
    };

    const docRef = await this.submissionsCollection.add(submissionData);

    // Notify teacher
    const groupDoc = await db.collection('groups').doc(data.groupId).get();
    if (groupDoc.exists) {
      const teacherId = groupDoc.data()?.teacherId;
      const userDoc = await db.collection('users').doc(data.studentId).get();
      const studentName = userDoc.data()?.displayName || 'A student';
      const taskDoc = await this.tasksCollection.doc(data.taskId).get();
      const taskTitle = taskDoc.data()?.title || 'a task';
      await notificationService.notifyNewSubmission(teacherId, studentName, taskTitle);
    }

    return { id: docRef.id, ...submissionData } as TaskSubmission;
  }

  /**
   * Get submissions for a group
   */
  async getSubmissionsForGroup(
    groupId: string,
    filters?: { status?: string; studentId?: string; lessonId?: string }
  ): Promise<TaskSubmission[]> {
    let query: FirebaseFirestore.Query = this.submissionsCollection
      .where('groupId', '==', groupId);

    if (filters?.status) query = query.where('status', '==', filters.status);
    if (filters?.studentId) query = query.where('studentId', '==', filters.studentId);
    if (filters?.lessonId) query = query.where('lessonId', '==', filters.lessonId);

    const snapshot = await query.orderBy('submittedAt', 'desc').get();
    return docsToObjects<TaskSubmission>(snapshot);
  }

  /**
   * Get submissions for a student
   */
  async getSubmissionsForStudent(studentId: string): Promise<TaskSubmission[]> {
    const snapshot = await this.submissionsCollection
      .where('studentId', '==', studentId)
      .orderBy('submittedAt', 'desc')
      .get();
    return docsToObjects<TaskSubmission>(snapshot);
  }

  /**
   * Get a single submission
   */
  async getSubmission(submissionId: string): Promise<TaskSubmission> {
    const doc = await this.submissionsCollection.doc(submissionId).get();
    if (!doc.exists) throw AppError.notFound('TaskSubmission', submissionId);
    return { id: doc.id, ...doc.data() } as TaskSubmission;
  }

  /**
   * Review a submission (teacher)
   */
  async reviewSubmission(
    submissionId: string,
    data: {
      status: 'reviewed' | 'needs_revision';
      teacherFeedback: string;
      coinsAwarded: number;
    },
    teacherId: string
  ): Promise<void> {
    const submission = await this.getSubmission(submissionId);

    await this.submissionsCollection.doc(submissionId).update({
      status: data.status,
      teacherFeedback: data.teacherFeedback,
      coinsAwarded: data.coinsAwarded,
      reviewedAt: now(),
    });

    // Award coins if reviewed (not needs_revision)
    if (data.status === 'reviewed' && data.coinsAwarded > 0) {
      await coinService.awardCoins(
        submission.studentId,
        submission.groupId,
        data.coinsAwarded,
        `Task reviewed: ${submission.taskId}`,
        'task',
        submissionId,
        teacherId
      );
    }

    // Notify student
    const taskDoc = await this.tasksCollection.doc(submission.taskId).get();
    const taskTitle = taskDoc.data()?.title || 'your task';
    await notificationService.notifyTaskReviewed(
      submission.studentId,
      taskTitle,
      data.status === 'reviewed' ? 'reviewed' : 'needs revision'
    );
  }

  /**
   * Bulk review submissions
   */
  async bulkReview(
    submissionIds: string[],
    defaultCoins: number,
    teacherId: string
  ): Promise<void> {
    for (const submissionId of submissionIds) {
      await this.reviewSubmission(
        submissionId,
        { status: 'reviewed', teacherFeedback: '', coinsAwarded: defaultCoins },
        teacherId
      );
    }
  }
}

export const taskService = new TaskService();
