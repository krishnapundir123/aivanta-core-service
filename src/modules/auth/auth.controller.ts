import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ValidationError } from '../../shared/utils/errors';
import { config } from '../../config';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.nativeEnum(UserRole),
  tenantId: z.string().uuid().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

// Cookie options
const accessTokenCookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict' as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth/refresh',
};

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const user = await authService.register(validation.data);

    res.status(201).json({
      success: true,
      data: user,
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const result = await authService.login({
      ...validation.data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Set cookies
    res.cookie('accessToken', result.accessToken, accessTokenCookieOptions);
    res.cookie('refreshToken', result.refreshToken, refreshTokenCookieOptions);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    // Get refresh token from cookie or body
    let refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      const validation = refreshSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ValidationError('Refresh token required');
      }
      refreshToken = validation.data.refreshToken;
    }

    const tokens = await authService.refreshTokens(refreshToken);

    // Update cookies
    res.cookie('accessToken', tokens.accessToken, accessTokenCookieOptions);
    res.cookie('refreshToken', tokens.refreshToken, refreshTokenCookieOptions);

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
      },
    });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }),

  logoutAll: asyncHandler(async (req: Request, res: Response) => {
    await authService.logoutAllDevices(req.user!.id);

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.json({
      success: true,
      message: 'Logged out from all devices',
    });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getCurrentUser(req.user!.id);

    res.json({
      success: true,
      data: user,
    });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const validation = changePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    await authService.changePassword(
      req.user!.id,
      validation.data.currentPassword,
      validation.data.newPassword
    );

    // Clear cookies - force re-login
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  }),

  sessions: asyncHandler(async (req: Request, res: Response) => {
    const sessions = await authService.getUserSessions(req.user!.id);

    res.json({
      success: true,
      data: sessions,
    });
  }),
};
