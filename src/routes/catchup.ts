import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { catchupService } from '../services/catchupService';

const router = Router();
router.use(verifyFirebaseToken);

const createMeetingSchema = z.object({
  studentId: z.string(),
  groupId: z.string(),
  scheduledAt: z.string(),
  topicsCovered: z.array(z.string()).default([]),
});

const completeMeetingSchema = z.object({
  notes: z.string(),
  analogiesUsed: z.array(z.string()).default([]),
  outcome: z.string(),
  coinsAwarded: z.number().optional(),
});

// Create a catch-up meeting
router.post('/', requireRole('admin', 'teacher'), validateBody(createMeetingSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const meeting = await catchupService.create({
        ...req.body,
        teacherId: req.user!.uid,
        scheduledAt: new Date(req.body.scheduledAt),
      });
      res.status(201).json({ data: meeting });
    } catch (error) { next(error); }
  }
);

// Complete a meeting
router.put('/:meetingId/complete', requireRole('admin', 'teacher'), validateBody(completeMeetingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await catchupService.complete(req.params.meetingId, req.body);
      res.json({ message: 'Meeting completed' });
    } catch (error) { next(error); }
  }
);

// Cancel a meeting
router.put('/:meetingId/cancel', requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await catchupService.cancel(req.params.meetingId);
      res.json({ message: 'Meeting cancelled' });
    } catch (error) { next(error); }
  }
);

// Get student catch-up history
router.get('/student/:studentId', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const history = await catchupService.getStudentHistory(req.params.studentId);
    res.json({ data: history });
  } catch (error) { next(error); }
});

export default router;
