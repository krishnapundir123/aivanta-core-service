import { UserRole } from '@prisma/client';
import { authRepository } from './auth.repository';
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from '../../shared/utils/encryption';
import { generateTokens, verifyRefreshToken } from '../../shared/middleware/authentication';
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { config } from '../../config';
import logger from '../../shared/utils/logger';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
}

export const authService = {
  async register(input: RegisterInput) {
    // Check if user exists
    const existingUser = await authRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Validate password strength
    if (input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user
    const user = await authRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      tenantId: input.tenantId,
    });

    logger.info(`User registered: ${user.email}`, { userId: user.id });

    return user;
  },

  async login(input: LoginInput) {
    // Find user
    const user = await authRepository.findByEmail(input.email);
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is disabled');
    }

    // Verify password
    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login
    await authRepository.update(user.id, { lastLoginAt: new Date() });

    // Generate tokens
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Calculate refresh token expiry
    const refreshExpiresIn = config.jwt.refreshExpiration;
    const expiresAt = new Date();
    const match = refreshExpiresIn.match(/(\d+)([d])/);
    if (match) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(match[1]!));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    // Store refresh token (hashed)
    const hashedRefreshToken = hashToken(refreshToken);
    await authRepository.createSession(
      user.id,
      hashedRefreshToken,
      expiresAt,
      input.ipAddress,
      input.userAgent
    );

    logger.info(`User logged in: ${user.email}`, { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
      },
      accessToken,
      refreshToken,
    };
  },

  async refreshTokens(refreshToken: string) {
    // Verify refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check if session exists and is valid
    const hashedToken = hashToken(refreshToken);
    const session = await authRepository.findSessionByRefreshToken(hashedToken);
    
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Verify user is still active
    if (!session.user.isActive) {
      throw new AuthenticationError('Account is disabled');
    }

    // Revoke old session
    await authRepository.revokeSession(hashedToken);

    // Generate new tokens
    const tokenPayload: TokenPayload = {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      tenantId: session.user.tenantId || undefined,
    };

    const tokens = generateTokens(tokenPayload);

    // Create new session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const newHashedToken = hashToken(tokens.refreshToken);
    
    await authRepository.createSession(
      session.user.id,
      newHashedToken,
      expiresAt,
      session.ipAddress || undefined,
      session.userAgent || undefined
    );

    return tokens;
  },

  async logout(refreshToken: string) {
    const hashedToken = hashToken(refreshToken);
    await authRepository.revokeSession(hashedToken);
    logger.info('User logged out');
  },

  async logoutAllDevices(userId: string) {
    await authRepository.revokeAllUserSessions(userId);
    logger.info(`User logged out from all devices`, { userId });
  },

  async getCurrentUser(userId: string) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      tenant: user.tenant,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    // Hash and update
    const newHash = await hashPassword(newPassword);
    await authRepository.update(userId, { passwordHash: newHash });

    // Revoke all sessions for security
    await authRepository.revokeAllUserSessions(userId);

    logger.info(`Password changed for user: ${user.email}`);
  },

  async getUserSessions(userId: string) {
    return authRepository.getUserSessions(userId);
  },
};
