import { Router, Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../models/types';
import { AppError } from '../utils/appError';
import { studentService } from '../services/studentService';

const router = Router();
router.use(verifyFirebaseToken);
router.use(requireRole('student'));

router.get('/lessons', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.uid;
    if (!studentId) throw AppError.unauthorized('No user');

    const lessons = await studentService.getLessons(studentId);
    res.json({ data: lessons });
  } catch (error) { next(error); }
});

router.get('/tasks', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.uid;
    if (!studentId) throw AppError.unauthorized('No user');

    const tasks = await studentService.getTasks(studentId);
    res.json({ data: tasks });
  } catch (error) { next(error); }
});
router.get('/quizzes', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.uid;
    if (!studentId) throw AppError.unauthorized('No user');

    const quizzes = await studentService.getActiveQuizzes(studentId);
    res.json({ data: quizzes });
  } catch (error) { next(error); }
});
export default router;
