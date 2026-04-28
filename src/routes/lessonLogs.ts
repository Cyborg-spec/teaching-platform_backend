import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { lessonService } from '../services/lessonService';
import { coinService } from '../services/coinService';

const router = Router();
router.use(verifyFirebaseToken);

const createLogSchema = z.object({
  lessonId: z.string(),
  groupId: z.string(),
  date: z.string(),
  attendees: z.array(z.string()),
  absentees: z.array(z.string()),
  paceRating: z.number().min(1).max(3),
  energyRating: z.number().min(1).max(3),
  conceptsFullyUnderstood: z.array(z.string()).optional().default([]),
  conceptsPartiallyUnderstood: z.array(z.string()).optional().default([]),
  conceptsNotUnderstood: z.array(z.string()).optional().default([]),
  topicsCovered: z.array(z.string()).optional().default([]),
  topicsSkipped: z.array(z.string()).optional().default([]),
  bufferUsed: z.boolean(),
  energyResetUsed: z.boolean(),
  energyResetType: z.string().nullable().optional(),
  studentNotes: z.array(z.object({
    studentId: z.string(),
    understanding: z.enum(['strong', 'adequate', 'struggling']),
    engagement: z.enum(['high', 'medium', 'low']),
    note: z.string(),
  })).optional().default([]),
  generalNotes: z.string().optional().default(''),
  nextLessonAdjustments: z.string().optional().default(''),
  quizResults: z.array(z.object({
    studentId: z.string(),
    questionId: z.string(),
    wasCorrect: z.boolean(),
  })).optional().default([]),
  catchupNeeded: z.array(z.string()).optional().default([]),
  isDraft: z.boolean().optional().default(false),
});

// Create a lesson log
router.post(
  '/',
  requireRole('admin', 'teacher'),
  validateBody(createLogSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const logData = {
        ...req.body,
        teacherId: req.user!.uid,
        date: new Date(req.body.date),
      };

      const log = await lessonService.createLog(logData);

      // Award attendance coins to attendees
      if (!req.body.isDraft) {
        const settingsDoc = await (await import('../config/firebase')).db.collection('settings').doc('platform').get();
        const attendanceCoins = settingsDoc.exists ? settingsDoc.data()?.coinDefaults?.lessonAttendance ?? 5 : 5;

        for (const studentId of req.body.attendees) {
          await coinService.awardCoins(
            studentId,
            req.body.groupId,
            attendanceCoins,
            'Lesson attendance',
            'attendance',
            log.id,
            'system'
          );
        }
      }

      res.status(201).json({ data: log, message: 'Lesson log created' });
    } catch (error) { next(error); }
  }
);

// Update a lesson log
router.put('/:logId', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await lessonService.updateLog(req.params.logId, req.body);
    res.json({ message: 'Lesson log updated' });
  } catch (error) { next(error); }
});

// Get a lesson log
router.get('/:logId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await lessonService.getLog(req.params.logId);
    res.json({ data: log });
  } catch (error) { next(error); }
});

export default router;
