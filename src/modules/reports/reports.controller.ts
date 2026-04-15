import { Request, Response } from 'express';
import { z } from 'zod';
import { reportsService, ReportConfig } from './reports.service';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ValidationError } from '../../shared/utils/errors';

const reportQuerySchema = z.object({
  reportType: z.enum(['TICKET_TRENDS', 'SLA_COMPLIANCE', 'AGENT_PERFORMANCE', 'CUSTOM']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeIds: z.string().optional(),
  generateNarrative: z.boolean().optional(),
});

const saveReportSchema = z.object({
  name: z.string().min(1),
  config: z.object({
    reportType: z.string(),
    filters: z.record(z.unknown()),
    groupBy: z.array(z.string()).optional(),
  }),
});

export const reportsController = {
  generate: asyncHandler(async (req: Request, res: Response) => {
    const validation = reportQuerySchema.safeParse(req.query);
    if (!validation.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const { reportType, dateFrom, dateTo, status, priority, assigneeIds, generateNarrative } = validation.data;
    
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    const config: ReportConfig = {
      reportType,
      filters: {
        ...(dateFrom && dateTo && { dateRange: { from: dateFrom, to: dateTo } }),
        ...(status && { status: status.split(',') }),
        ...(priority && { priority: priority.split(',') }),
        ...(assigneeIds && { assigneeIds: assigneeIds.split(',') }),
      },
    };

    let data: unknown;

    switch (reportType) {
      case 'TICKET_TRENDS':
        data = await reportsService.getTicketTrends(tenantId, config);
        break;
      case 'SLA_COMPLIANCE':
        data = await reportsService.getSLACompliance(tenantId, config);
        break;
      case 'AGENT_PERFORMANCE':
        data = await reportsService.getAgentPerformance(tenantId, config);
        break;
      default:
        throw new ValidationError('Unknown report type');
    }

    let narrative: string | undefined;
    if (generateNarrative) {
      narrative = await reportsService.generateAINarrative(reportType, data);
    }

    res.json({
      success: true,
      data,
      narrative,
    });
  }),

  save: asyncHandler(async (req: Request, res: Response) => {
    const validation = saveReportSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const report = await reportsService.saveReport(
      req.user!.id,
      validation.data.name,
      validation.data.config as ReportConfig,
      req.user!.tenantId
    );

    res.status(201).json({
      success: true,
      data: report,
    });
  }),

  listSaved: asyncHandler(async (req: Request, res: Response) => {
    const reports = await reportsService.getSavedReports(
      req.user!.id,
      req.user!.tenantId
    );

    res.json({
      success: true,
      data: reports,
    });
  }),

  getDashboardMetrics: asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    // Get quick metrics for dashboard
    const [ticketStats, slaStats] = await Promise.all([
      reportsService.getTicketTrends(tenantId, {
        reportType: 'TICKET_TRENDS',
        filters: {},
      }),
      reportsService.getSLACompliance(tenantId, {
        reportType: 'SLA_COMPLIANCE',
        filters: {},
      }),
    ]);

    res.json({
      success: true,
      data: {
        tickets: ticketStats,
        sla: slaStats,
      },
    });
  }),
};
