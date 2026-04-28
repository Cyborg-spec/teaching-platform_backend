import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { lessonService } from '../services/lessonService';

const router = Router();
router.use(verifyFirebaseToken);

// Get a lesson
router.get('/:lessonId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lesson = await lessonService.getLesson(req.params.lessonId);
    res.json({ data: lesson });
  } catch (error) { next(error); }
});

// Update lesson status
router.put('/:lessonId/status', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    await lessonService.updateStatus(req.params.lessonId, status);
    res.json({ message: 'Lesson status updated' });
  } catch (error) { next(error); }
});

// Schedule a lesson
router.put('/:lessonId/schedule', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.body;
    await lessonService.schedule(req.params.lessonId, new Date(date));
    res.json({ message: 'Lesson scheduled' });
  } catch (error) { next(error); }
});

export default router;
