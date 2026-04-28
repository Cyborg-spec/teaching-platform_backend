import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../models/types';
import { coinService } from '../services/coinService';
import { notificationService } from '../services/notificationService';

const router = Router();
router.use(verifyFirebaseToken);

const awardCoinsSchema = z.object({
  studentId: z.string(),
  groupId: z.string(),
  amount: z.number(),
  reason: z.string(),
  sourceType: z.enum(['task', 'quiz', 'attendance', 'blooket', 'helpfulness', 'catchup', 'purchase', 'admin', 'other']).default('other'),
  sourceId: z.string().nullable().optional(),
});

const redeemSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  cost: z.number(),
});

// Get student's coins
router.get('/students/:studentId', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === 'student' && req.params.studentId !== req.user!.uid) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    const account = await coinService.getAccount(req.params.studentId);
    res.json({ data: account || { totalCoins: 0, transactions: [] } });
  } catch (error) { next(error); }
});

// Award coins (teacher/admin)
router.post('/award', requireRole('admin', 'teacher'), validateBody(awardCoinsSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const { studentId, groupId, amount, reason, sourceType, sourceId } = req.body;
      if (amount > 0) {
        await coinService.awardCoins(studentId, groupId, amount, reason, sourceType, sourceId || null, req.user!.uid);
      } else {
        await coinService.deductCoins(studentId, Math.abs(amount), reason, sourceType, sourceId || null, req.user!.uid);
      }
      res.json({ message: `${Math.abs(amount)} coins ${amount > 0 ? 'awarded' : 'deducted'}` });
    } catch (error) { next(error); }
  }
);

// Redeem store item (student)
router.post('/store/redeem', validateBody(redeemSchema),
  async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
    try {
      const purchase = await coinService.redeemItem(
        req.user!.uid,
        req.user!.groupId!,
        req.body.itemId,
        req.body.itemName,
        req.body.cost
      );
      res.status(201).json({ data: purchase, message: 'Redemption request submitted' });
    } catch (error) { next(error); }
  }
);

// Fulfil store request (teacher)
router.put('/store-requests/:requestId/fulfil', requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await coinService.fulfilPurchase(req.params.requestId, req.body.teacherNote);
      res.json({ message: 'Purchase fulfilled' });
    } catch (error) { next(error); }
  }
);

// Reject store request (teacher)
router.put('/store-requests/:requestId/reject', requireRole('admin', 'teacher'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await coinService.rejectPurchase(req.params.requestId, req.body.reason);
      res.json({ message: 'Purchase rejected' });
    } catch (error) { next(error); }
  }
);

export default router;
