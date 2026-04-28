import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { quizService } from '../services/quizService';

const router = Router();
router.use(verifyFirebaseToken);

const createQuizSchema = z.object({
  lessonId: z.string(),
  groupId: z.string(),
  title: z.string().min(1),
  questions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(['multiple_choice', 'true_false', 'short_answer']),
    options: z.array(z.string()),
    correctAnswer: z.string(),
    points: z.number().default(1),
    explanation: z.string().nullable().optional(),
  })),
  isActive: z.boolean().default(false),
  showOneAtATime: z.boolean().default(false),
  timeLimitMinutes: z.number().nullable().optional(),
  coinsPerCorrect: z.number().default(5),
  perfectScoreBonus: z.number().default(20),
});

const submitAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    selectedAnswer: z.string(),
  })),
  timeSpent: z.number(),
});

// Create a quiz
router.post('/', requireRole('admin', 'teacher'), validateBody(createQuizSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const quiz = await quizService.create({ ...req.body, createdBy: req.user!.uid });
      res.status(201).json({ data: quiz });
    } catch (error) { next(error); }
  }
);

// Update a quiz
router.put('/:quizId', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await quizService.update(req.params.quizId, req.body);
    res.json({ message: 'Quiz updated' });
  } catch (error) { next(error); }
});

// Get a quiz
router.get('/:quizId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quiz = await quizService.getById(req.params.quizId);
    res.json({ data: quiz });
  } catch (error) { next(error); }
});

// Open a quiz
router.post('/:quizId/open', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await quizService.open(req.params.quizId);
    res.json({ message: 'Quiz opened' });
  } catch (error) { next(error); }
});

// Close a quiz
router.post('/:quizId/close', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await quizService.close(req.params.quizId);
    res.json({ message: 'Quiz closed' });
  } catch (error) { next(error); }
});

// Submit quiz answers (student)
router.post('/:quizId/submit', validateBody(submitAnswersSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const response = await quizService.submitAnswers(
        req.params.quizId,
        req.user!.uid,
        req.user!.groupId!,
        req.body.answers,
        req.body.timeSpent
      );
      res.status(201).json({ data: response });
    } catch (error) { next(error); }
  }
);

// Get quiz results (teacher)
router.get('/:quizId/results', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await quizService.getResults(req.params.quizId);
    res.json({ data: results });
  } catch (error) { next(error); }
});

// Get my quiz result (student)
router.get('/:quizId/my-result', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const result = await quizService.getStudentResult(req.params.quizId, req.user!.uid);
    res.json({ data: result });
  } catch (error) { next(error); }
});

export default router;
