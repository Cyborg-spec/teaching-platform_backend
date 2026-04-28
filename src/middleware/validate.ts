import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/appError';

/**
 * Validate request body against a Zod schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.reduce((acc, err) => {
          const key = err.path.join('.');
          acc[key] = err.message;
          return acc;
        }, {} as Record<string, string>);

        next(AppError.badRequest('VALIDATION_ERROR', 'Request validation failed', details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query parameters against a Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.reduce((acc, err) => {
          const key = err.path.join('.');
          acc[key] = err.message;
          return acc;
        }, {} as Record<string, string>);

        next(AppError.badRequest('VALIDATION_ERROR', 'Query parameter validation failed', details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request params against a Zod schema
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.reduce((acc, err) => {
          const key = err.path.join('.');
          acc[key] = err.message;
          return acc;
        }, {} as Record<string, string>);

        next(AppError.badRequest('VALIDATION_ERROR', 'Path parameter validation failed', details));
      } else {
        next(error);
      }
    }
  };
}
