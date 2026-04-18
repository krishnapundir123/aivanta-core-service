import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import logger from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        tenantId?: string;
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  iat: number;
  exp: number;
}

export function generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiration as any,
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiration as any }
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, config.jwt.secret) as JWTPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { userId: string };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check for token in cookies first, then Authorization header
    let token = req.cookies?.accessToken;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    const payload = verifyAccessToken(token);
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, tenantId: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AuthorizationError(`Required role: ${allowedRoles.join(' or ')}`));
      return;
    }

    next();
  };
}

// Optional auth - sets req.user if token exists but doesn't require it
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.accessToken;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (token) {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, tenantId: true, isActive: true }
      });

      if (user?.isActive) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId || undefined,
        };
      }
    }

    next();
  } catch {
    // Ignore auth errors for optional auth
    next();
  }
}
