import { prisma } from '../../config/database';
import { UserRole } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  passwordHash?: string;
  lastLoginAt?: Date;
}

export const authRepository = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  },

  async create(data: CreateUserInput) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  async update(id: string, data: UpdateUserInput) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        tenantId: true,
        isActive: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });
  },

  async createSession(userId: string, refreshToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string) {
    return prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });
  },

  async findSessionByRefreshToken(refreshToken: string) {
    return prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
  },

  async revokeSession(refreshToken: string) {
    return prisma.session.update({
      where: { refreshToken },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllUserSessions(userId: string) {
    return prisma.session.updateMany({
      where: { 
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  },

  async cleanupExpiredSessions() {
    return prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
  },

  async getUserSessions(userId: string) {
    return prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  },
};
