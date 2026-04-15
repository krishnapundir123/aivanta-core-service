import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { optionalAuth } from '../../shared/middleware/authentication';
import { asyncHandler } from '../../shared/utils/async-handler';
import { aiClient } from '../../services/ai-client';
import { ValidationError } from '../../shared/utils/errors';
import { ticketsService } from '../tickets/tickets.service';

const router = Router();

router.use(optionalAuth);

const querySchema = z.object({
  query: z.string().min(1),
  sessionId: z.string().optional(),
  customerEmail: z.string().email(),
  tenantId: z.string().uuid(),
});

const rateSchema = z.object({
  sessionId: z.string(),
  rating: z.number().min(1).max(5),
  feedback: z.string().optional(),
});

const createTicketSchema = z.object({
  sessionId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
});

// Assistant query endpoint
router.post('/query', asyncHandler(async (req, res) => {
  const validation = querySchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request');
  }

  const { query, sessionId, customerEmail, tenantId } = validation.data;

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new ValidationError('Invalid tenant');
  }

  // Get or create session
  let session;
  if (sessionId) {
    session = await prisma.assistantSession.findFirst({
      where: { id: sessionId, tenantId },
    });
  }

  if (!session) {
    session = await prisma.assistantSession.create({
      data: {
        customerEmail,
        tenantId,
        messages: [],
      },
    });
  }

  // Build conversation history
  const history = (session.messages as Array<{ role: string; content: string }>) || [];

  // Call AI service
  const response = await aiClient.assistantQuery(query, session.id, tenantId, history);

  // Update session
  const updatedMessages = [
    ...history,
    { role: 'user', content: query },
    { role: 'assistant', content: response.content },
  ];

  await prisma.assistantSession.update({
    where: { id: session.id },
    data: {
      messages: updatedMessages,
      deflectionCount: response.deflectionConfidence > 0.7 
        ? { increment: 1 } 
        : undefined,
    },
  });

  res.json({
    success: true,
    data: {
      ...response,
      sessionId: session.id,
    },
  });
}));

// Rate assistant response
router.post('/rate', asyncHandler(async (req, res) => {
  const validation = rateSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request');
  }

  const { sessionId, rating, feedback } = validation.data;

  await prisma.assistantSession.update({
    where: { id: sessionId },
    data: { rating, feedback },
  });

  res.json({
    success: true,
    message: 'Feedback recorded',
  });
}));

// Create ticket from assistant session
router.post('/create-ticket', asyncHandler(async (req, res) => {
  const validation = createTicketSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request');
  }

  const { sessionId, title, description } = validation.data;

  const session = await prisma.assistantSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new ValidationError('Session not found');
  }

  // Create user if doesn't exist
  let user = await prisma.user.findUnique({
    where: { email: session.customerEmail },
  });

  if (!user) {
    // Create a customer user
    const { hashPassword } = await import('../../shared/utils/encryption');
    const tempPassword = Math.random().toString(36).slice(-12);
    
    user = await prisma.user.create({
      data: {
        email: session.customerEmail,
        passwordHash: await hashPassword(tempPassword),
        firstName: 'Customer',
        lastName: session.customerEmail.split('@')[0],
        role: 'CLIENT_ADMIN',
        tenantId: session.tenantId,
      },
    });
  }

  // Create ticket
  const ticket = await ticketsService.createTicket({
    tenantId: session.tenantId,
    title,
    description,
    requesterId: user.id,
  }, user.id);

  // Update session
  await prisma.assistantSession.update({
    where: { id: sessionId },
    data: {
      ticketCreated: true,
      ticketId: ticket.id,
    },
  });

  res.status(201).json({
    success: true,
    data: ticket,
  });
}));

export default router;
