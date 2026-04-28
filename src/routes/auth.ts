import { Router } from 'express';
import { z } from 'zod';
import { authController } from '../controllers/authController';
import { verifyFirebaseToken, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  role: z.enum(['admin', 'teacher', 'student']),
  groupId: z.string().optional().nullable(),
  temporaryPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  language: z.enum(['en', 'ru']).optional(),
});

// Routes
router.post(
  '/create-user',
  verifyFirebaseToken,
  requireRole('admin', 'teacher'),
  validateBody(createUserSchema),
  authController.createUser.bind(authController)
);

router.post(
  '/first-login-password-change',
  verifyFirebaseToken,
  validateBody(changePasswordSchema),
  authController.changePassword.bind(authController)
);

router.get(
  '/me',
  verifyFirebaseToken,
  authController.getMe.bind(authController)
);

router.put(
  '/profile',
  verifyFirebaseToken,
  validateBody(updateProfileSchema),
  authController.updateProfile.bind(authController)
);

router.post(
  '/change-password',
  verifyFirebaseToken,
  validateBody(changePasswordSchema),
  authController.changeOwnPassword.bind(authController)
);

export default router;
