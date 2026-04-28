import { Router, Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../models/types';
import { notificationService } from '../services/notificationService';

const router = Router();
router.use(verifyFirebaseToken);

// Get my notifications
router.get('/', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    const notifications = await notificationService.getForUser(req.user!.uid);
    const unreadCount = await notificationService.getUnreadCount(req.user!.uid);
    res.json({ data: { notifications, unreadCount } });
  } catch (error) { next(error); }
});

// Mark one as read
router.put('/:notificationId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAsRead(req.params.notificationId);
    res.json({ message: 'Marked as read' });
  } catch (error) { next(error); }
});

// Mark all as read
router.put('/read-all', async (req: Request & Partial<AuthenticatedRequest>, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllAsRead(req.user!.uid);
    res.json({ message: 'All marked as read' });
  } catch (error) { next(error); }
});

export default router;
