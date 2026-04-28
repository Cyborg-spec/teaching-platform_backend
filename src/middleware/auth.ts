import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase';
import { AppError } from '../utils/appError';
import { UserRole, AuthenticatedRequest } from '../models/types';

/**
 * Verify Firebase ID token and attach user info to request
 */
export async function verifyFirebaseToken(
  req: Request & Partial<AuthenticatedRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('No authentication token provided');
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);

    // Get user doc from Firestore for role and group info
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      throw AppError.unauthorized('User account not found');
    }

    const userData = userDoc.data()!;

    if (!userData.isActive) {
      throw AppError.forbidden('Account has been deactivated');
    }

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      role: userData.role as UserRole,
      groupId: userData.groupId || null,
    };

    // Update last login
    await db.collection('users').doc(decodedToken.uid).update({
      lastLoginAt: new Date(),
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(AppError.unauthorized('Invalid or expired authentication token'));
    }
  }
}

/**
 * Require specific roles for access
 */
export function requireRole(...roles: UserRole[]) {
  return (
    req: Request & Partial<AuthenticatedRequest>,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`This action requires one of the following roles: ${roles.join(', ')}`));
      return;
    }

    next();
  };
}

/**
 * Ensure students can only access their own group's data
 */
export function requireGroupAccess(
  req: Request & Partial<AuthenticatedRequest>,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }

  // Admin and teacher have broader access (teacher access checked in service layer)
  if (req.user.role === 'admin') {
    next();
    return;
  }

  // For teacher, we allow access but verify in service layer
  if (req.user.role === 'teacher') {
    next();
    return;
  }

  // For students, check groupId in params or query matches their group
  const requestedGroupId = req.params.groupId || req.query.groupId || req.body?.groupId;

  if (requestedGroupId && requestedGroupId !== req.user.groupId) {
    next(AppError.forbidden('You can only access data from your own group'));
    return;
  }

  next();
}
