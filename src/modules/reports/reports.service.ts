import { prisma } from '../../config/database';
import { aiClient } from '../../services/ai-client';
import logger from '../../shared/utils/logger';

export interface ReportConfig {
  reportType: 'TICKET_TRENDS' | 'SLA_COMPLIANCE' | 'AGENT_PERFORMANCE' | 'CUSTOM';
  filters: {
    dateRange?: { from: string; to: string };
    status?: string[];
    priority?: string[];
    assigneeIds?: string[];
    customerId?: string;
  };
  groupBy?: string[];
  aggregations?: string[];
}

export const reportsService = {
  async getTicketTrends(tenantId: string, config: ReportConfig) {
    const { dateRange, status, priority } = config.filters;
    
    const where: any = { tenantId };
    
    if (dateRange) {
      where.createdAt = {
        gte: new Date(dateRange.from),
        lte: new Date(dateRange.to),
      };
    }
    
    if (status?.length) {
      where.status = { in: status };
    }
    
    if (priority?.length) {
      where.priority = { in: priority };
    }

    const tickets = await prisma.ticket.groupBy({
      by: ['status', 'priority'],
      where,
      _count: { id: true },
      _avg: {
        timeToResolve: true,
      },
    });

    const dailyTrend = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        status,
        COUNT(*) as count
      FROM tickets
      WHERE tenant_id = ${tenantId}
      ${dateRange ? prisma.$queryRaw`AND created_at >= ${new Date(dateRange.from)} AND created_at <= ${new Date(dateRange.to)}` : prisma.$queryRaw``}
      GROUP BY DATE(created_at), status
      ORDER BY date DESC
      LIMIT 30
    `;

    return {
      summary: tickets,
      dailyTrend,
    };
  },

  async getSLACompliance(tenantId: string, config: ReportConfig) {
    const { dateRange } = config.filters;
    
    const tickets = await prisma.ticket.findMany({
      where: {
        tenantId,
        resolvedAt: { not: null },
        ...(dateRange && {
          createdAt: {
            gte: new Date(dateRange.from),
            lte: new Date(dateRange.to),
          },
        }),
      },
      select: {
        id: true,
        priority: true,
        slaDeadline: true,
        resolvedAt: true,
      },
    });

    const total = tickets.length;
    const breached = tickets.filter(t => 
      t.slaDeadline && t.resolvedAt && t.resolvedAt > t.slaDeadline
    ).length;

    const byPriority = tickets.reduce((acc, t) => {
      const key = t.priority;
      if (!acc[key]) acc[key] = { total: 0, breached: 0 };
      acc[key].total++;
      if (t.slaDeadline && t.resolvedAt && t.resolvedAt > t.slaDeadline) {
        acc[key].breached++;
      }
      return acc;
    }, {} as Record<string, { total: number; breached: number }>);

    return {
      overall: {
        total,
        breached,
        compliance: total > 0 ? ((total - breached) / total) * 100 : 100,
      },
      byPriority,
    };
  },

  async getAgentPerformance(tenantId: string, config: ReportConfig) {
    const { dateRange, assigneeIds } = config.filters;
    
    const where: any = {
      tenantId,
      assigneeId: assigneeIds?.length ? { in: assigneeIds } : { not: null },
    };

    if (dateRange) {
      where.createdAt = {
        gte: new Date(dateRange.from),
        lte: new Date(dateRange.to),
      };
    }

    const performance = await prisma.ticket.groupBy({
      by: ['assigneeId'],
      where,
      _count: { id: true },
      _avg: { timeToResolve: true },
    });

    // Get agent details
    const agentIds = performance.map(p => p.assigneeId).filter(Boolean);
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds as string[] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    return performance.map(p => {
      const agent = agents.find(a => a.id === p.assigneeId);
      return {
        agentId: p.assigneeId,
        agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown',
        ticketsAssigned: p._count.id,
        avgResolutionTime: p._avg.timeToResolve,
      };
    });
  },

  async generateAINarrative(reportType: string, data: unknown): Promise<string> {
    try {
      return await aiClient.generateReportNarrative(data, reportType);
    } catch (error) {
      logger.error('Failed to generate AI narrative', { error });
      return '';
    }
  },

  async saveReport(userId: string, name: string, config: ReportConfig, tenantId?: string) {
    return prisma.reportDefinition.create({
      data: {
        userId,
        tenantId,
        name,
        dataSource: config.reportType,
        filters: config.filters,
        visualizations: config.groupBy || [],
      },
    });
  },

  async getSavedReports(userId: string, tenantId?: string) {
    return prisma.reportDefinition.findMany({
      where: {
        OR: [
          { userId },
          { tenantId, isShared: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
