import { Request, Response } from 'express';
import { z } from 'zod';
import { documentsService } from './documents.service';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ValidationError } from '../../shared/utils/errors';

const createDocumentSchema = z.object({
  filename: z.string().min(1),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  documentType: z.enum(['BRD', 'SOW', 'TECHNICAL_SPEC', 'USER_MANUAL', 'CONTRACT', 'OTHER']),
  parsedContent: z.string().optional(),
});

const updateDocumentSchema = z.object({
  parsedContent: z.string().optional(),
  summary: z.string().optional(),
});

const linkTicketSchema = z.object({
  ticketId: z.string().uuid(),
  linkType: z.enum(['reference', 'implements', 'blocks']).default('reference'),
});

export const documentsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const validation = createDocumentSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    const document = await documentsService.createDocument(
      {
        ...validation.data,
        tenantId,
        uploadedBy: req.user!.id,
      },
      req.user!.id
    );

    res.status(201).json({
      success: true,
      data: document,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const document = await documentsService.getDocumentById(
      req.params.id,
      req.user!.id,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: document,
    });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    const documents = await documentsService.listDocuments(tenantId, {
      documentType: req.query.documentType as string,
      search: req.query.search as string,
    });

    res.json({
      success: true,
      data: documents,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const validation = updateDocumentSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed');
    }

    const document = await documentsService.updateDocument(
      req.params.id,
      validation.data,
      req.user!.id,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: document,
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await documentsService.deleteDocument(
      req.params.id,
      req.user!.id,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  }),

  linkTicket: asyncHandler(async (req: Request, res: Response) => {
    const validation = linkTicketSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed');
    }

    const link = await documentsService.linkToTicket(
      req.params.id,
      validation.data.ticketId,
      validation.data.linkType,
      req.user!.id,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      data: link,
    });
  }),

  unlinkTicket: asyncHandler(async (req: Request, res: Response) => {
    const { ticketId } = req.body;
    if (!ticketId) {
      throw new ValidationError('ticketId is required');
    }

    await documentsService.unlinkFromTicket(
      req.params.id,
      ticketId,
      req.user!.id,
      req.user!.tenantId!
    );

    res.json({
      success: true,
      message: 'Ticket unlinked successfully',
    });
  }),

  search: asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter q is required');
    }

    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      throw new ValidationError('User must belong to a tenant');
    }

    const results = await documentsService.searchDocuments(
      q,
      tenantId,
      parseInt(req.query.limit as string) || 10
    );

    res.json({
      success: true,
      data: results,
    });
  }),
};
