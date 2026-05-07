import { db } from '../config/firebase';
import { Curriculum, Lesson } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now, batchWrite } from '../utils/firestoreHelpers';

export class CurriculumService {
  private collection = db.collection('curriculum');

  /**
   * Import curriculum from JSON
   */
  async importCurriculum(data: any, createdBy: string): Promise<Curriculum> {
    // Check for duplicate month number within the exact same domain
    const existing = await this.collection
      .where('monthNumber', '==', data.monthNumber)
      .where('domain', '==', data.domain)
      .get();

    if (!existing.empty) {
      throw AppError.conflict(
        'CURRICULUM_EXISTS',
        `A curriculum for month ${data.monthNumber} ("${data.domain}") already exists.`
      );
    }

    const timestamp = now();
    const curriculumData: Omit<Curriculum, 'id'> = {
      monthNumber: data.monthNumber,
      title: data.title,
      description: data.description || '',
      domain: data.domain,
      lessonCount: data.lessonCount || data.lessons?.length || 0,
      lessons: (data.lessons || []).map((lesson: any, index: number) => ({
        id: `lesson_${data.monthNumber}_${index + 1}`,
        lessonNumber: lesson.lessonNumber || index + 1,
        title: lesson.title,
        teacherPdfUrl: lesson.teacherPdfUrl || null,
        studentPdfUrl: lesson.studentPdfUrl || null,
        homeworkPdfUrl: lesson.homeworkPdfUrl || null,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
    };

    const docRef = await this.collection.add(curriculumData);
    return { id: docRef.id, ...curriculumData };
  }

  /**
   * Overwrite an existing curriculum month
   */
  async overwriteCurriculum(monthNumber: number, data: any, createdBy: string): Promise<Curriculum> {
    const existing = await this.collection
      .where('monthNumber', '==', monthNumber)
      .where('domain', '==', data.domain)
      .get();

    if (!existing.empty) {
      // Delete the existing one
      await this.collection.doc(existing.docs[0].id).delete();
    }

    return this.importCurriculum(data, createdBy);
  }

  /**
   * Get all curriculum months
   */
  async getAll(): Promise<Curriculum[]> {
    const snapshot = await this.collection
      .orderBy('monthNumber', 'asc')
      .get();
    return docsToObjects<Curriculum>(snapshot);
  }

  /**
   * Get a single curriculum month
   */
  async getById(monthId: string): Promise<Curriculum> {
    const doc = await this.collection.doc(monthId).get();
    if (!doc.exists) throw AppError.notFound('Curriculum', monthId);
    return { id: doc.id, ...doc.data() } as Curriculum;
  }

  /**
   * Update a curriculum month
   */
  async update(monthId: string, data: Partial<Curriculum>): Promise<void> {
    const doc = await this.collection.doc(monthId).get();
    if (!doc.exists) throw AppError.notFound('Curriculum', monthId);

    await this.collection.doc(monthId).update({
      ...data,
      updatedAt: now(),
    });
  }

  /**
   * Delete a curriculum month and its associated lessons/tasks
   */
  async delete(monthId: string): Promise<void> {
    const doc = await this.collection.doc(monthId).get();
    if (!doc.exists) throw AppError.notFound('Curriculum', monthId);

    // Also delete any lesson documents created from this curriculum
    const lessonsSnap = await db.collection('lessons').where('monthId', '==', monthId).get();
    const tasksToDelete: string[] = [];

    // Collect task IDs linked to these lessons
    for (const lessonDoc of lessonsSnap.docs) {
      const tasksSnap = await db.collection('tasks').where('lessonId', '==', lessonDoc.id).get();
      tasksSnap.docs.forEach(t => tasksToDelete.push(t.id));
    }

    // Batch delete: tasks, lessons, then curriculum
    const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    tasksToDelete.forEach(taskId => {
      operations.push((batch) => batch.delete(db.collection('tasks').doc(taskId)));
    });

    lessonsSnap.docs.forEach(lessonDoc => {
      operations.push((batch) => batch.delete(lessonDoc.ref));
    });

    operations.push((batch) => batch.delete(this.collection.doc(monthId)));

    await batchWrite(operations);
  }

  /**
   * Get lessons for a specific month
   */
  async getLessons(monthId: string): Promise<Lesson[]> {
    const curriculum = await this.getById(monthId);
    return curriculum.lessons;
  }

  /**
   * Get a specific lesson from a curriculum
   */
  async getLesson(monthId: string, lessonNumber: number): Promise<Lesson> {
    const curriculum = await this.getById(monthId);
    const lesson = curriculum.lessons.find((l) => l.lessonNumber === lessonNumber);
    if (!lesson) {
      throw AppError.notFound('Lesson', `${monthId}/lesson_${lessonNumber}`);
    }
    return lesson;
  }

  /**
   * Create lesson documents for a group from curriculum
   */
  async createLessonsForGroup(monthId: string, groupId: string): Promise<void> {
    const curriculum = await this.getById(monthId);
    const lessonsCollection = db.collection('lessons');
    const tasksCollection = db.collection('tasks');

    // Load already assigned lessons for this group + month so assignment can be idempotent.
    const existingLessonsSnap = await lessonsCollection
      .where('groupId', '==', groupId)
      .where('monthId', '==', monthId)
      .get();

    const existingByLessonNumber = new Map<number, any[]>();
    existingLessonsSnap.docs.forEach((doc) => {
      const lessonNumber = Number(doc.data().lessonNumber);
      if (!Number.isFinite(lessonNumber)) return;
      const current = existingByLessonNumber.get(lessonNumber) || [];
      current.push(doc);
      existingByLessonNumber.set(lessonNumber, current);
    });

    for (const lesson of curriculum.lessons) {
      const existingCandidates = existingByLessonNumber.get(lesson.lessonNumber) || [];
      const existingLessonDoc = this.pickPreferredLessonDoc(existingCandidates);

      if (existingLessonDoc) {
        // Keep progress fields (status/schedule/completion) and refresh curriculum-linked fields.
        await existingLessonDoc.ref.set(
          {
            monthId,
            groupId,
            lessonNumber: lesson.lessonNumber,
            title: lesson.title,
            teacherPdfUrl: lesson.teacherPdfUrl || null,
            studentPdfUrl: lesson.studentPdfUrl || null,
            homeworkPdfUrl: lesson.homeworkPdfUrl || null,
          },
          { merge: true }
        );

        const existingTaskSnap = await tasksCollection
          .where('lessonId', '==', existingLessonDoc.id)
          .limit(1)
          .get();

        if (existingTaskSnap.empty) {
          await tasksCollection.add({
            lessonId: existingLessonDoc.id,
            groupId,
            title: `Homework: ${lesson.title}`,
            pdfUrl: lesson.homeworkPdfUrl || null,
            dueDate: null,
            isFinishAtHome: true,
          });
        } else {
          await existingTaskSnap.docs[0].ref.set(
            {
              groupId,
              title: `Homework: ${lesson.title}`,
              pdfUrl: lesson.homeworkPdfUrl || null,
              isFinishAtHome: true,
            },
            { merge: true }
          );
        }
      } else {
        // First-time assignment for this lesson number.
        const lessonRef = lessonsCollection.doc();
        await lessonRef.set({
          monthId,
          groupId,
          lessonNumber: lesson.lessonNumber,
          title: lesson.title,
          teacherPdfUrl: lesson.teacherPdfUrl || null,
          studentPdfUrl: lesson.studentPdfUrl || null,
          homeworkPdfUrl: lesson.homeworkPdfUrl || null,
          status: 'planned',
          scheduledDate: null,
          completedDate: null,
        });

        await tasksCollection.add({
          lessonId: lessonRef.id,
          groupId,
          title: `Homework: ${lesson.title}`,
          pdfUrl: lesson.homeworkPdfUrl || null,
          dueDate: null,
          isFinishAtHome: true,
        });
      }
    }
  }

  private pickPreferredLessonDoc(docs: any[]): any | null {
    if (docs.length === 0) return null;

    const score = (doc: any) => {
      const data = doc.data ? doc.data() : {};
      let value = 0;
      if (data.status === 'completed') value += 10;
      if (data.status === 'in_progress') value += 5;
      if (data.completedDate) value += 2;
      if (data.scheduledDate) value += 1;
      return value;
    };

    return docs.sort((a, b) => score(b) - score(a))[0];
  }

  /**
   * Validate import data structure
   */
  validateImportData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.monthNumber || typeof data.monthNumber !== 'number') {
      errors.push('monthNumber is required and must be a number');
    }
    if (!data.title || typeof data.title !== 'string') {
      errors.push('title is required and must be a string');
    }
    if (!data.domain || typeof data.domain !== 'string') {
      errors.push('domain is required');
    }
    if (!Array.isArray(data.lessons)) {
      errors.push('lessons must be an array');
    } else {
      data.lessons.forEach((lesson: any, index: number) => {
        if (!lesson.title) errors.push(`Lesson ${index + 1}: title is required`);
      });
    }

    return { valid: errors.length === 0, errors };
  }
}

export const curriculumService = new CurriculumService();
