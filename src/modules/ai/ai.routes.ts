import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../shared/middleware/authentication';
import { asyncHandler } from '../../shared/utils/async-handler';
import { aiClient } from '../../services/ai-client';
import { ValidationError } from '../../shared/utils/errors';

const router = Router();

router.use(authenticate);

const summarizeSchema = z.object({
  type: z.enum(['ticket', 'document']),
  ticketId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
});

router.post('/summarize', asyncHandler(async (req, res) => {
  const validation = summarizeSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request', validation.error.flatten().fieldErrors);
  }

  const { type, ticketId, documentId } = validation.data;

  if (type === 'ticket') {
    if (!ticketId) {
      throw new ValidationError('ticketId is required for ticket summarization');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { content: true },
        },
      },
    });

    if (!ticket) {
      throw new ValidationError('Ticket not found');
    }

    const messages = ticket.messages.map(m => m.content);
    const summary = await aiClient.summarizeTicket(ticket.id, messages);

    res.json({
      success: true,
      data: { summary, type: 'ticket', id: ticketId },
    });
  } else {
    if (!documentId) {
      throw new ValidationError('documentId is required for document summarization');
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, parsedContent: true, filename: true },
    });

    if (!document) {
      throw new ValidationError('Document not found');
    }

    const content = document.parsedContent || '';
    const summary = await aiClient.summarizeTicket(document.id, [content]);

    res.json({
      success: true,
      data: { summary, type: 'document', id: documentId },
    });
  }
}));

export default router;
