import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AuthenticatedRequest } from '../models/types';
import { AppError } from '../utils/appError';

export class AuthController {
  /**
   * POST /auth/create-user
   * Admin creates teacher/student, teacher creates student
   */
  async createUser(
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();

      const user = await authService.createUser(req.body, req.user.role);

      res.status(201).json({
        message: 'User created successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/first-login-password-change
   * Change password on first login
   */
  async changePassword(
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();

      const { newPassword } = req.body;
      await authService.changePassword(req.user.uid, newPassword);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/me
   * Get current user's profile
   */
  async getMe(
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();

      const user = await authService.getUserById(req.user.uid);
      if (!user) throw AppError.notFound('User', req.user.uid);

      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /auth/profile
   * Update current user's profile
   */
  async updateProfile(
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();

      await authService.updateProfile(req.user.uid, req.body);

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/change-password
   * Change own password (not first login)
   */
  async changeOwnPassword(
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();

      const { newPassword } = req.body;
      await authService.changePassword(req.user.uid, newPassword);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
