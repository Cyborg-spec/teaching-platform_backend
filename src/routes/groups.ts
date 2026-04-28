import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole, requireGroupAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { groupService } from '../services/groupService';
import { lessonService } from '../services/lessonService';
import { quizService } from '../services/quizService';
import { taskService } from '../services/taskService';
import { coinService } from '../services/coinService';
import { aiPromptService } from '../services/aiPromptService';
import { catchupService } from '../services/catchupService';

const router = Router();
router.use(verifyFirebaseToken);

// ============= GROUPS =============

router.get('/', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    let groups = [];
    if (req.user!.role === 'teacher') {
      groups = await groupService.getByTeacher(req.user!.uid);
    } else if (req.user!.role === 'admin') {
      groups = await groupService.getAll();
    } else if (req.user!.role === 'student') {
      if (req.user!.groupId) {
        groups = [await groupService.getById(req.user!.groupId)];
      }
    }
    res.json({ data: groups });
  } catch (error) { next(error); }
});

router.get('/:groupId', requireGroupAccess, async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    // Teachers can only see their own groups
    if (req.user!.role === 'teacher') {
      const hasAccess = await groupService.verifyTeacherAccess(req.user!.uid, req.params.groupId);
      if (!hasAccess) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your group' } });
    }
    const group = await groupService.getById(req.params.groupId);
    res.json({ data: group });
  } catch (error) { next(error); }
});

router.get('/:groupId/students', requireGroupAccess, async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const students = await groupService.getStudents(req.params.groupId);
    res.json({ data: students });
  } catch (error) { next(error); }
});

// ============= LESSONS =============

router.get('/:groupId/lessons', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lessons = await lessonService.getLessonsForGroup(req.params.groupId);
    res.json({ data: lessons });
  } catch (error) { next(error); }
});

// ============= LESSON LOGS =============

router.get('/:groupId/lesson-logs', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await lessonService.getLogsForGroup(req.params.groupId);
    res.json({ data: logs });
  } catch (error) { next(error); }
});

// ============= QUIZZES =============

router.get('/:groupId/quizzes', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quizzes = await quizService.getForGroup(req.params.groupId);
    res.json({ data: quizzes });
  } catch (error) { next(error); }
});

// ============= TASKS =============

router.get('/:groupId/tasks', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = await taskService.getTasksForGroup(req.params.groupId);
    res.json({ data: tasks });
  } catch (error) { next(error); }
});

// ============= SUBMISSIONS =============

router.get('/:groupId/submissions', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, studentId, lessonId } = req.query;
    const submissions = await taskService.getSubmissionsForGroup(req.params.groupId, {
      status: status as string,
      studentId: studentId as string,
      lessonId: lessonId as string,
    });
    res.json({ data: submissions });
  } catch (error) { next(error); }
});

// ============= SCOREBOARD =============

router.get('/:groupId/scoreboard', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = (req.query.type as string) || 'allTime';
    const scoreboard = await coinService.getScoreboard(req.params.groupId, type as any);
    res.json({ data: scoreboard });
  } catch (error) { next(error); }
});

// ============= STORE REQUESTS =============

router.get('/:groupId/store-requests', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await coinService.getStoreRequests(req.params.groupId);
    res.json({ data: requests });
  } catch (error) { next(error); }
});

// ============= CATCH-UP =============

router.get('/:groupId/catchup-queue', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queue = await catchupService.getQueue(req.params.groupId);
    const lessonQueue = await lessonService.getCatchupQueue(req.params.groupId);
    res.json({ data: { meetings: queue, flaggedStudents: lessonQueue } });
  } catch (error) { next(error); }
});

// ============= AI PROMPTS =============

router.get('/:groupId/ai-prompts', requireRole('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prompts = await aiPromptService.getHistory(req.params.groupId);
    res.json({ data: prompts });
  } catch (error) { next(error); }
});

// ============= PROGRESS =============

router.get('/:groupId/progress', requireGroupAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [lessons, logs, scoreboard] = await Promise.all([
      lessonService.getLessonsForGroup(req.params.groupId),
      lessonService.getLogsForGroup(req.params.groupId),
      coinService.getScoreboard(req.params.groupId),
    ]);

    const completedLessons = lessons.filter(l => l.status === 'completed').length;
    const totalLessons = lessons.length;

    res.json({
      data: {
        completedLessons,
        totalLessons,
        progressPercentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
        recentLogs: logs.slice(0, 5),
        scoreboard: scoreboard.slice(0, 10),
      },
    });
  } catch (error) { next(error); }
});

export default router;
