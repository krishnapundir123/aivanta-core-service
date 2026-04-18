import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';
import { config } from '../../config';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: Record<string, string | string[]>;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let errors: Record<string, string | string[]> | undefined;

  // Handle known application errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    
    if (err instanceof ValidationError) {
      errors = err.errors;
    }
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // Handle Prisma errors
    const prismaError = err as unknown as { code: string; meta?: { target?: string[] } };
    
    switch (prismaError.code) {
      case 'P2002':
        statusCode = 409;
        errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
        message = `Resource already exists: ${prismaError.meta?.target?.join(', ')}`;
        break;
      case 'P2025':
        statusCode = 404;
        errorCode = 'NOT_FOUND';
        message = 'Resource not found';
        break;
      case 'P2003':
        statusCode = 400;
        errorCode = 'FOREIGN_KEY_CONSTRAINT_VIOLATION';
        message = 'Referenced resource does not exist';
        break;
      default:
        logger.error('Prisma error:', err);
    }
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    const zodError = err as unknown as { errors: Array<{ path: (string | number)[]; message: string }> };
    errors = zodError.errors.reduce((acc, curr) => {
      const path = curr.path.join('.');
      acc[path] = curr.message;
      return acc;
    }, {} as Record<string, string>);
  }

  // Log error
  if (statusCode >= 500) {
    logger.error('Server error:', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    logger.warn('Client error:', {
      statusCode,
      errorCode,
      message,
      path: req.path,
      method: req.method,
    });
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  if (errors) {
    response.error.errors = errors;
  }

  if (config.nodeEnv === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

// Handle unhandled promise rejections
export function unhandledRejectionHandler(reason: unknown): void {
  logger.error('Unhandled Rejection:', reason);
  // In production, you might want to gracefully shutdown
  // process.exit(1);
}

// Handle uncaught exceptions
export function uncaughtExceptionHandler(error: Error): void {
  logger.error('Uncaught Exception:', error);
  // Gracefully shutdown
  process.exit(1);
}
