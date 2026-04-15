import { messagesRepository, CreateMessageInput } from './messages.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import { NotFoundError, AuthorizationError } from '../../shared/utils/errors';
import logger from '../../shared/utils/logger';
import { aiClient } from '../../services/ai-client';
import { eventBus } from '../../config/redis';

export const messagesService = {
  async createMessage(data: CreateMessageInput, userId: string, userRole: string, tenantId?: string) {
    // Verify ticket exists and user has access
    const ticket = await ticketsRepository.findById(data.ticketId);
    
    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    if (userRole !== 'ADMIN_3SC' && ticket.tenantId !== tenantId) {
      throw new AuthorizationError('Access denied to this ticket');
    }

    // Create message
    const message = await messagesRepository.create(data);

    // Generate embedding for the message
    try {
      const embedding = await aiClient.generateEmbedding(data.content);
      await messagesRepository.updateEmbedding(message.id, embedding);
    } catch (error) {
      logger.warn('Failed to generate message embedding', { error });
    }

    // Publish real-time event
    await eventBus.publish('ticket:message', {
      ticketId: data.ticketId,
      message: {
        id: message.id,
        content: message.content,
        author: message.author,
        visibility: message.visibility,
        createdAt: message.createdAt,
      },
    });

    logger.info(`Message created: ${message.id}`, { ticketId: data.ticketId, userId });

    return message;
  },

  async getTicketMessages(ticketId: string, userId: string, userRole: string, tenantId?: string) {
    // Verify ticket access
    const ticket = await ticketsRepository.findById(ticketId);
    
    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    if (userRole !== 'ADMIN_3SC' && ticket.tenantId !== tenantId) {
      throw new AuthorizationError('Access denied to this ticket');
    }

    // For non-admin clients, only show public messages
    const visibility = userRole === 'CLIENT_ADMIN' || userRole === 'DELIVERY_USER' 
      ? 'public' 
      : undefined;

    return messagesRepository.findByTicketId(ticketId, { visibility });
  },

  async updateMessage(
    messageId: string,
    content: string,
    userId: string,
    userRole: string,
    tenantId?: string
  ) {
    const message = await messagesRepository.findById(messageId);
    
    if (!message) {
      throw new NotFoundError('Message');
    }

    // Only author or admin can edit
    if (message.authorId !== userId && userRole !== 'ADMIN_3SC') {
      throw new AuthorizationError('Cannot edit this message');
    }

    // Check ticket access
    const ticket = await ticketsRepository.findById(message.ticketId);
    if (userRole !== 'ADMIN_3SC' && ticket?.tenantId !== tenantId) {
      throw new AuthorizationError('Access denied');
    }

    const updated = await messagesRepository.update(messageId, { content });

    // Update embedding
    try {
      const embedding = await aiClient.generateEmbedding(content);
      await messagesRepository.updateEmbedding(messageId, embedding);
    } catch (error) {
      logger.warn('Failed to update message embedding', { error });
    }

    // Publish update event
    await eventBus.publish('ticket:message:update', {
      ticketId: message.ticketId,
      message: updated,
    });

    return updated;
  },

  async deleteMessage(messageId: string, userId: string, userRole: string, tenantId?: string) {
    const message = await messagesRepository.findById(messageId);
    
    if (!message) {
      throw new NotFoundError('Message');
    }

    // Only author or admin can delete
    if (message.authorId !== userId && userRole !== 'ADMIN_3SC') {
      throw new AuthorizationError('Cannot delete this message');
    }

    const ticket = await ticketsRepository.findById(message.ticketId);
    if (userRole !== 'ADMIN_3SC' && ticket?.tenantId !== tenantId) {
      throw new AuthorizationError('Access denied');
    }

    await messagesRepository.delete(messageId);

    // Publish delete event
    await eventBus.publish('ticket:message:delete', {
      ticketId: message.ticketId,
      messageId,
    });

    logger.info(`Message deleted: ${messageId}`, { userId });
  },
};
