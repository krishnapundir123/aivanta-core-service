import { Request, Response } from 'express';
import { z } from 'zod';
import { TicketStatus, TicketPriority } from '@prisma/client';
import { ticketsService } from './tickets.service';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ValidationError } from '../../shared/utils/errors';

const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required'),
  priority: z.nativeEnum(TicketPriority).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assigneeId: z.string().uuid().optional().nullable().transform(v => v ?? undefined),
});

const listTicketsQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  status: z.string().optional().transform(v => v || undefined).pipe(z.nativeEnum(TicketStatus).optional()),
  priority: z.string().optional().transform(v => v || undefined).pipe(z.nativeEnum(TicketPriority).optional()),
  category: z.string().optional().transform(v => v || undefined),
  search: z.string().optional().transform(v => v || undefined),
});

export const ticketsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const validation = createTicketSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    // Get tenant from user context
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant to create tickets');
    }

    const ticket = await ticketsService.createTicket(
      {
        ...validation.data,
        tenantId,
        requesterId: req.user!.id,
      },
      req.user!.id
    );

    res.status(201).json({
      success: true,
      data: ticket,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketsService.getTicketById(
      req.params.id!,
      req.user!.id,
      req.user!.role,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: ticket,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const queryValidation = listTicketsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const result = await ticketsService.listTickets(
      {
        tenantId: req.user!.tenantId,
        status: queryValidation.data.status,
        priority: queryValidation.data.priority,
        category: queryValidation.data.category,
        search: queryValidation.data.search,
      },
      {
        page: queryValidation.data.page,
        limit: queryValidation.data.limit,
      },
      req.user!.id,
      req.user!.role
    );

    res.json({
      success: true,
      data: result.tickets,
      pagination: result.pagination,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const validation = updateTicketSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const ticket = await ticketsService.updateTicket(
      req.params.id!,
      validation.data,
      req.user!.id,
      req.user!.role,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: ticket,
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await ticketsService.deleteTicket(req.params.id!, req.user!.id, req.user!.role);

    res.json({
      success: true,
      message: 'Ticket deleted successfully',
    });
  }),

  runAiTriage: asyncHandler(async (req: Request, res: Response) => {
    const result = await ticketsService.runAiTriage(
      req.params.id!,
      req.user!.id,
      req.user!.role,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: result,
    });
  }),

  getSimilar: asyncHandler(async (req: Request, res: Response) => {
    const similar = await ticketsService.getSimilarTickets(
      req.params.id!,
      req.user!.id,
      req.user!.role,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: similar,
    });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    const stats = await ticketsService.getTicketStats(tenantId, req.user!.role);

    res.json({
      success: true,
      data: stats,
    });
  }),
};
