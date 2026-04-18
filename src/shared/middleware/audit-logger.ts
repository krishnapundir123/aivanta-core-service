import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import logger from '../utils/logger';

interface AuditLogData {
  action: string;
  entityType: string;
  entityId: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

// Middleware to automatically log certain actions
export function auditLog(action: string, entityType: string, getEntityId?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const oldData = req.body; // Capture before modification if needed
    
    // Store original end function
    const originalEnd = res.end;
    
    res.end = function(chunk?: unknown, encoding?: unknown, cb?: () => void): Response {
      // Restore original end
      res.end = originalEnd;
      
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = getEntityId ? getEntityId(req) : req.params.id || 'unknown';
        
        // Log asynchronously without blocking
        logAudit({
          action,
          entityType,
          entityId,
          oldData,
          newData: req.body,
        }, req).catch(err => logger.error('Audit log failed:', err));
      }
      
      return originalEnd.call(this, chunk as Buffer, encoding as BufferEncoding, cb);
    };
    
    next();
  };
}

// Direct audit logging function
export async function logAudit(data: AuditLogData, req?: Request): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req?.user?.id,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldData: (data.oldData || {}) as Prisma.InputJsonValue,
        newData: (data.newData || {}) as Prisma.InputJsonValue,
        ipAddress: req?.ip,
        userAgent: req?.headers['user-agent'],
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break functionality
  }
}

// Get audit logs for an entity
export async function getEntityAuditLogs(
  entityType: string,
  entityId: string,
  limit: number = 50
) {
  return prisma.auditLog.findMany({
    where: {
      entityType,
      entityId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}
