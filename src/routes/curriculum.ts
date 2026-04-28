import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { curriculumService } from '../services/curriculumService';
import { uploadService } from '../services/uploadService';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../models/types';

const router = Router();

router.use(verifyFirebaseToken);

// Multer config — store files in memory for forwarding to Firebase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Upload a single PDF and return the public URL
router.post(
  '/upload-pdf',
  requireRole('admin', 'teacher'),
  upload.single('file'),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No PDF file provided' } });
        return;
      }

      const { domain, monthNumber, lessonNumber, type } = req.body;

      if (!domain || !monthNumber || !lessonNumber || !type) {
        res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'domain, monthNumber, lessonNumber, and type are required' } });
        return;
      }

      const safeDomain = domain.replace(/\s+/g, '_');
      const path = `curriculums/${safeDomain}/month_${monthNumber}/lesson_${lessonNumber}/${type}.pdf`;
      const url = await uploadService.uploadFile(req.file.buffer, path, req.file.mimetype);

      res.json({ data: { url, path } });
    } catch (error) {
      next(error);
    }
  }
);

// Import curriculum
router.post(
  '/import',
  requireRole('admin', 'teacher'),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      // Validate import data
      const validation = curriculumService.validateImportData(req.body);
      if (!validation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid curriculum data', details: { errors: validation.errors } },
        });
        return;
      }

      const curriculum = await curriculumService.importCurriculum(req.body, req.user!.uid);
      res.status(201).json({ data: curriculum, message: 'Curriculum imported successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Overwrite existing curriculum month
router.put(
  '/import/:monthNumber',
  requireRole('admin', 'teacher'),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const monthNumber = parseInt(req.params.monthNumber);
      const curriculum = await curriculumService.overwriteCurriculum(monthNumber, req.body, req.user!.uid);
      res.json({ data: curriculum, message: 'Curriculum overwritten successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Validate import data (preview without importing)
router.post(
  '/validate',
  requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = curriculumService.validateImportData(req.body);
      res.json({ data: validation });
    } catch (error) {
      next(error);
    }
  }
);

// Get all curriculum months
router.get('/months', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const months = await curriculumService.getAll();
    res.json({ data: months });
  } catch (error) {
    next(error);
  }
});

// Get a single month
router.get('/months/:monthId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = await curriculumService.getById(req.params.monthId);
    res.json({ data: month });
  } catch (error) {
    next(error);
  }
});

// Update a month
router.put(
  '/months/:monthId',
  requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await curriculumService.update(req.params.monthId, req.body);
      res.json({ message: 'Curriculum updated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Delete a month (and its associated lessons/tasks)
router.delete(
  '/months/:monthId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await curriculumService.delete(req.params.monthId);
      res.json({ message: 'Curriculum deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Get lessons for a month
router.get('/months/:monthId/lessons', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lessons = await curriculumService.getLessons(req.params.monthId);
    res.json({ data: lessons });
  } catch (error) {
    next(error);
  }
});

// Create lesson documents for a group from curriculum
router.post(
  '/months/:monthId/assign/:groupId',
  requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await curriculumService.createLessonsForGroup(req.params.monthId, req.params.groupId);
      res.json({ message: 'Lessons created for group successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
