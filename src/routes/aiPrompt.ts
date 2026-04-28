import { Router, Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../models/types';
import { aiPromptService } from '../services/aiPromptService';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(verifyFirebaseToken, requireRole('admin', 'teacher'));

const generatePromptSchema = z.object({
  groupId: z.string(),
  lessonLogId: z.string(),
  nextLessonId: z.string(),
  additionalContext: z.string().optional(),
  includeStudentObservations: z.boolean().optional().default(true),
});

// Generate prompt text
router.post('/generate', validateBody(generatePromptSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const prompt = await aiPromptService.generatePrompt(req.body, req.user!.uid);
      res.status(201).json({ data: prompt });
    } catch (error) { next(error); }
  }
);

// Generate with AI
router.post('/generate-with-ai/:promptId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const aiResponse = await aiPromptService.generateWithAI(req.params.promptId);
      res.json({ data: { response: aiResponse } });
    } catch (error) { next(error); }
  }
);

// Update usage notes
router.put('/:promptId/notes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await aiPromptService.updateNotes(req.params.promptId, req.body.usageNotes);
      res.json({ message: 'Notes updated' });
    } catch (error) { next(error); }
  }
);

export default router;
