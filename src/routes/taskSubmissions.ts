import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { taskService } from '../services/taskService';
import { uploadService } from '../services/uploadService';
import { db } from '../config/firebase';

const router = Router();
router.use(verifyFirebaseToken);

const allowedSubmissionExtensions = new Set([
  'txt', 'md', 'pdf', 'png', 'jpg', 'jpeg', 'webp',
  'py', 'js', 'ts', 'java', 'cs', 'cpp', 'c', 'zip',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
]);

const submissionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ext || !allowedSubmissionExtensions.has(ext)) {
      cb(new Error('Unsupported file type'));
      return;
    }
    cb(null, true);
  },
});

const submitTaskSchema = z.object({
  taskId: z.string(),
  code: z.string(),
  notes: z.string().default(''),
  fileUrls: z.array(z.string()).default([]),
});

const reviewSubmissionSchema = z.object({
  status: z.enum(['reviewed', 'needs_revision']),
  teacherFeedback: z.string().default(''),
  coinsAwarded: z.number().default(10),
});

// Upload a single homework attachment and return its URL
router.post(
  '/upload-file',
  requireRole('student'),
  submissionUpload.single('file'),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file provided' } });
        return;
      }

      const taskId = String(req.body?.taskId || '').trim();
      if (!taskId) {
        res.status(400).json({ error: { code: 'MISSING_TASK_ID', message: 'taskId is required' } });
        return;
      }

      const task = await taskService.getTask(taskId);
      const groupDoc = await db.collection('groups').doc(task.groupId).get();
      const studentIds: string[] = (groupDoc.data()?.studentIds || []) as string[];
      if (!groupDoc.exists || !studentIds.includes(req.user!.uid)) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot upload files for this task' } });
        return;
      }

      const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destinationPath = `submissions/${req.user!.uid}/${safeTaskId}/${Date.now()}_${safeFileName}`;

      const url = await uploadService.uploadFile(req.file.buffer, destinationPath, req.file.mimetype);
      res.status(201).json({
        data: {
          url,
          path: destinationPath,
          fileName: req.file.originalname,
          size: req.file.size,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Submit a task (student)
router.post('/', requireRole('student'), validateBody(submitTaskSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.getTask(req.body.taskId);
      const groupDoc = await db.collection('groups').doc(task.groupId).get();
      const studentIds: string[] = (groupDoc.data()?.studentIds || []) as string[];
      if (!groupDoc.exists || !studentIds.includes(req.user!.uid)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot submit this task' } });
      }

      const submission = await taskService.submitTask({
        taskId: req.body.taskId,
        code: req.body.code,
        notes: req.body.notes,
        fileUrls: req.body.fileUrls,
        studentId: req.user!.uid,
        groupId: task.groupId,
        lessonId: task.lessonId,
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
