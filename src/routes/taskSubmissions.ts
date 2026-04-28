import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { taskService } from '../services/taskService';

const router = Router();
router.use(verifyFirebaseToken);

const submitTaskSchema = z.object({
  taskId: z.string(),
  groupId: z.string(),
  lessonId: z.string(),
  code: z.string(),
  notes: z.string().default(''),
  fileUrls: z.array(z.string()).default([]),
});

const reviewSubmissionSchema = z.object({
  status: z.enum(['reviewed', 'needs_revision']),
  teacherFeedback: z.string().default(''),
  coinsAwarded: z.number().default(10),
});

// Submit a task (student)
router.post('/', validateBody(submitTaskSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const submission = await taskService.submitTask({
        ...req.body,
        studentId: req.user!.uid,
      });
      res.status(201).json({ data: submission, message: 'Task submitted successfully' });
    } catch (error) { next(error); }
  }
);

// Get a submission
router.get('/:submissionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submission = await taskService.getSubmission(req.params.submissionId);
    res.json({ data: submission });
  } catch (error) { next(error); }
});

// Review a submission (teacher)
router.put('/:submissionId/review', requireRole('admin', 'teacher'), validateBody(reviewSubmissionSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      await taskService.reviewSubmission(req.params.submissionId, req.body, req.user!.uid);
      res.json({ message: 'Submission reviewed' });
    } catch (error) { next(error); }
  }
);

// Get student's submissions
router.get('/student/:studentId', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    // Students can only see their own
    if (req.user!.role === 'student' && req.params.studentId !== req.user!.uid) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    const submissions = await taskService.getSubmissionsForStudent(req.params.studentId);
    res.json({ data: submissions });
  } catch (error) { next(error); }
});

// Bulk review
router.post('/bulk-review', requireRole('admin', 'teacher'),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      await taskService.bulkReview(req.body.submissionIds, req.body.defaultCoins || 10, req.user!.uid);
      res.json({ message: 'Submissions reviewed' });
    } catch (error) { next(error); }
  }
);

export default router;
