import { db } from '../config/firebase';
import { AppError } from '../utils/appError';
import { docsToObjects } from '../utils/firestoreHelpers';

export class StudentService {
  /**
   * Get all lessons for the student's group
   */
  async getLessons(studentId: string): Promise<any[]> {
    const groupsRef = await db.collection('groups').where('studentIds', 'array-contains', studentId).get();
    if (groupsRef.empty) {
      return [];
    }
    const groupId = groupsRef.docs[0].id;

    const lessonsRef = await db.collection('lessons').where('groupId', '==', groupId).get();
    const lessons = this.dedupeByLessonNumber(docsToObjects<any>(lessonsRef));

    const monthIds = [...new Set(lessons.map(l => l.monthId).filter(Boolean))];
    const monthToDomain: Record<string, string> = {};
    
    if (monthIds.length > 0) {
      const monthDocs = await Promise.all(
        monthIds.map(id => db.collection('curriculum').doc(id).get())
      );
      
      monthDocs.forEach(doc => {
        if (doc.exists) {
          monthToDomain[doc.id] = doc.data()?.domain || 'General';
        }
      });
    }

    return lessons.map(l => ({
      ...l,
      domain: l.monthId ? (monthToDomain[l.monthId] || 'General Program') : 'General Program'
    }));
  }

  /**
   * Get all tasks for the student's group
   */
  async getTasks(studentId: string): Promise<any[]> {
    const groupsRef = await db.collection('groups').where('studentIds', 'array-contains', studentId).get();
    if (groupsRef.empty) {
      return [];
    }
    const groupId = groupsRef.docs[0].id;

    const tasksRef = await db.collection('tasks').where('groupId', '==', groupId).get();
    const tasks = docsToObjects<any>(tasksRef);
    if (tasks.length === 0) return tasks;

    const lessonIds = [...new Set(tasks.map(t => t.lessonId).filter(Boolean))];
    const lessonDocs = await Promise.all(
      lessonIds.map(id => db.collection('lessons').doc(id).get())
    );
    const lessonById = new Map<string, any>();
    lessonDocs.forEach(doc => {
      if (doc.exists) lessonById.set(doc.id, doc.data());
    });

    const submissionsRef = await db.collection('task_submissions')
      .where('studentId', '==', studentId)
      .where('groupId', '==', groupId)
      .get();
    const submittedTaskIds = new Set(submissionsRef.docs.map(doc => doc.data().taskId));

    const dedupedByKey = new Map<string, any>();
    for (const task of tasks) {
      const key = this.taskDedupKey(task, lessonById);
      const existing = dedupedByKey.get(key);
      if (!existing) {
        dedupedByKey.set(key, task);
        continue;
      }

      if (this.taskScore(task, submittedTaskIds) > this.taskScore(existing, submittedTaskIds)) {
        dedupedByKey.set(key, task);
      }
    }

    return Array.from(dedupedByKey.values());
  }
  /**
   * Get all active quizzes for the student's group, along with their submission status
   */
  async getActiveQuizzes(studentId: string): Promise<any[]> {
    const groupsRef = await db.collection('groups').where('studentIds', 'array-contains', studentId).get();
    if (groupsRef.empty) {
      return [];
    }
    const groupId = groupsRef.docs[0].id;

    const quizzesRef = await db.collection('quizzes')
      .where('groupId', '==', groupId)
      .where('isActive', '==', true)
      .get();
      
    const quizzes = docsToObjects(quizzesRef);

    const responsesRef = await db.collection('quiz_responses')
      .where('studentId', '==', studentId)
      .get();
      
    const submittedQuizIds = new Set(responsesRef.docs.map(doc => doc.data().quizId));

    return quizzes.map(q => ({
      ...q,
      hasSubmitted: submittedQuizIds.has(q.id)
    }));
  }

  private dedupeByLessonNumber(lessons: any[]): any[] {
    const byNumber = new Map<number, any>();

    for (const lesson of lessons) {
      const lessonNumber = Number(lesson.lessonNumber);
      if (!Number.isFinite(lessonNumber)) continue;

      const existing = byNumber.get(lessonNumber);
      if (!existing) {
        byNumber.set(lessonNumber, lesson);
        continue;
      }

      if (this.lessonScore(lesson) > this.lessonScore(existing)) {
        byNumber.set(lessonNumber, lesson);
      }
    }

    return Array.from(byNumber.values());
  }

  private lessonScore(lesson: any): number {
    let score = 0;
    if (lesson.status === 'completed') score += 10;
    if (lesson.status === 'in_progress') score += 5;
    if (lesson.studentPdfUrl) score += 2;
    if (lesson.completedDate) score += 1;
    if (lesson.scheduledDate) score += 1;
    return score;
  }

  private taskDedupKey(task: any, lessonById: Map<string, any>): string {
    const lesson = lessonById.get(task.lessonId);
    if (lesson && Number.isFinite(Number(lesson.lessonNumber))) {
      return `${lesson.monthId || 'none'}:${lesson.lessonNumber}`;
    }

    return `title:${String(task.title || '').trim().toLowerCase()}`;
  }

  private taskScore(task: any, submittedTaskIds: Set<string>): number {
    let score = 0;
    if (submittedTaskIds.has(task.id)) score += 20;
    if (task.pdfUrl) score += 2;
    if (task.dueDate) score += 1;
    return score;
  }
}

export const studentService = new StudentService();
