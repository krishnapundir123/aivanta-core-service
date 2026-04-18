import { Router } from 'express';
import { z } from 'zod';
import { messagesService } from './messages.service';
import { authenticate } from '../../shared/middleware/authentication';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ValidationError } from '../../shared/utils/errors';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);

const createMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  visibility: z.enum(['public', 'internal']).default('public'),
  parentId: z.string().uuid().optional(),
});

const updateMessageSchema = z.object({
  content: z.string().min(1),
});

// Create message on a ticket
router.post('/', asyncHandler(async (req, res) => {
  const validation = createMessageSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
  }

  const message = await messagesService.createMessage(
    {
      ticketId: req.params.ticketId,
      authorId: req.user!.id,
      ...validation.data,
    },
    req.user!.id,
    req.user!.role,
    req.user!.tenantId
  );

  res.status(201).json({
    success: true,
    data: message,
  });
}));

// Get all messages for a ticket
router.get('/', asyncHandler(async (req, res) => {
  const messages = await messagesService.getTicketMessages(
    req.params.ticketId,
    req.user!.id,
    req.user!.role,
    req.user!.tenantId
  );

  res.json({
    success: true,
    data: messages,
  });
}));

// Update message
router.patch('/:messageId', asyncHandler(async (req, res) => {
  const validation = updateMessageSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError('Validation failed');
  }

  const message = await messagesService.updateMessage(
    req.params.messageId,
    validation.data.content,
    req.user!.id,
    req.user!.role,
    req.user!.tenantId
  );

  res.json({
    success: true,
    data: message,
  });
}));

// Delete message
router.delete('/:messageId', asyncHandler(async (req, res) => {
  await messagesService.deleteMessage(
    req.params.messageId,
    req.user!.id,
    req.user!.role,
    req.user!.tenantId
  );

  res.json({
    success: true,
    message: 'Message deleted',
  });
}));

export default router;
