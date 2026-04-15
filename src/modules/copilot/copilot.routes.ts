import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../shared/middleware/authentication';
import { asyncHandler } from '../../shared/utils/async-handler';
import { aiClient } from '../../services/ai-client';
import { ValidationError } from '../../shared/utils/errors';

const router = Router();

router.use(authenticate);

const querySchema = z.object({
  query: z.string().min(1),
  context: z.record(z.unknown()).default({}),
  sessionId: z.string().optional(),
});

const actionSchema = z.object({
  action: z.string(),
  params: z.record(z.unknown()).default({}),
});

// Copilot query endpoint
router.post('/query', asyncHandler(async (req, res) => {
  const validation = querySchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request');
  }

  const { query, context, sessionId } = validation.data;
  const userId = req.user!.id;

  // Get or create session
  let session;
  if (sessionId) {
    session = await prisma.copilotSession.findFirst({
      where: { id: sessionId, userId },
    });
  }

  if (!session) {
    session = await prisma.copilotSession.create({
      data: {
        userId,
        context,
        messages: [],
      },
    });
  }

  // Call AI service
  const response = await aiClient.copilotQuery(query, context, userId, session.id);

  // Update session with messages
  const updatedMessages = [
    ...((session.messages as unknown[]) || []),
    { role: 'user', content: query, timestamp: new Date() },
    { role: 'assistant', content: response.content, timestamp: new Date(), actions: response.actions },
  ];

  await prisma.copilotSession.update({
    where: { id: session.id },
    data: {
      messages: updatedMessages as unknown[],
      context: { ...session.context as Record<string, unknown>, ...response.context },
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

// Execute action endpoint
router.post('/action', asyncHandler(async (req, res) => {
  const validation = actionSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Invalid request');
  }

  const { action, params } = validation.data;
  const userId = req.user!.id;

  // Execute via AI service or handle directly
  const result = await aiClient.copilotExecuteAction(action, params, userId);

  res.json({
    success: true,
    data: result,
  });
}));

// Get session history
router.get('/sessions/:id', asyncHandler(async (req, res) => {
  const session = await prisma.copilotSession.findFirst({
    where: {
      id: req.params.id,
      userId: req.user!.id,
    },
  });

  if (!session) {
    throw new ValidationError('Session not found');
  }

  res.json({
    success: true,
    data: session,
  });
}));

// List user's sessions
router.get('/sessions', asyncHandler(async (req, res) => {
  const sessions = await prisma.copilotSession.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      context: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({
    success: true,
    data: sessions,
  });
}));

export default router;
