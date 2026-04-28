export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message: string = 'Access denied') {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    return new AppError(`${resource.toUpperCase().replace(/\s/g, '_')}_NOT_FOUND`, message, 404);
  }

  static conflict(code: string, message: string) {
    return new AppError(code, message, 409);
  }

  static internal(message: string = 'Internal server error') {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}
