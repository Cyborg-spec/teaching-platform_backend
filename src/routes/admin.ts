import { Router } from 'express';
import { z } from 'zod';
import { adminController } from '../controllers/adminController';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

// All admin routes require admin role
router.use(verifyFirebaseToken, requireRole('admin'));

// Validation schemas
const createGroupSchema = z.object({
  name: z.string().min(2, 'Group name must be at least 2 characters'),
  teacherId: z.string().min(1, 'Teacher ID is required'),
  studentIds: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  displayName: z.string().min(2).optional(),
  role: z.enum(['admin', 'teacher', 'student']).optional(),
  groupId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(2).optional(),
  teacherId: z.string().min(1).optional(),
  monthIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  coinStoreItems: z.array(z.any()).optional(),
});

const bulkActionSchema = z.object({
  userIds: z.array(z.string()).min(1, 'At least one user ID is required'),
});

const bulkMoveSchema = z.object({
  userIds: z.array(z.string()).min(1),
  groupId: z.string().min(1),
});

const awardCoinsSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  amount: z.number().int().min(1, 'Amount must be greater than 0'),
  reason: z.string().optional(),
});

// Dashboard
router.get('/dashboard', adminController.getDashboard.bind(adminController));

// Users
router.get('/users', adminController.getUsers.bind(adminController));
router.get('/users/:userId', adminController.getUser.bind(adminController));
router.put('/users/:userId', validateBody(updateUserSchema), adminController.updateUser.bind(adminController));
router.delete('/users/:userId', adminController.deactivateUser.bind(adminController));
router.delete('/users/:userId/hard', adminController.deleteUser.bind(adminController));
router.post('/users/:userId/reactivate', adminController.reactivateUser.bind(adminController));
router.post('/users/bulk-deactivate', validateBody(bulkActionSchema), adminController.bulkDeactivate.bind(adminController));
router.post('/users/bulk-move-group', validateBody(bulkMoveSchema), adminController.bulkMoveGroup.bind(adminController));

// Groups
router.get('/groups', adminController.getGroups.bind(adminController));
router.get('/groups/:groupId', adminController.getGroup.bind(adminController));
router.post('/groups', validateBody(createGroupSchema), adminController.createGroup.bind(adminController));
router.put('/groups/:groupId', validateBody(updateGroupSchema), adminController.updateGroup.bind(adminController));
router.post('/groups/:groupId/archive', adminController.archiveGroup.bind(adminController));

// Reports
router.get('/reports/lesson-logs', adminController.getLessonLogReport.bind(adminController));
router.get('/reports/quiz-results', adminController.getQuizReport.bind(adminController));
router.get('/reports/coins', adminController.getCoinReport.bind(adminController));

// Coins
router.post('/coins/award', validateBody(awardCoinsSchema), adminController.awardCoins.bind(adminController));

// Settings
router.get('/settings', adminController.getSettings.bind(adminController));
router.put('/settings', adminController.updateSettings.bind(adminController));

export default router;
