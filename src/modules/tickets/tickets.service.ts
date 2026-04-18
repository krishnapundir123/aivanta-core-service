import { TicketStatus, TicketPriority } from '@prisma/client';
import { ticketsRepository, CreateTicketInput, UpdateTicketInput } from './tickets.repository';
import { NotFoundError, ValidationError, AuthorizationError } from '../../shared/utils/errors';
import logger from '../../shared/utils/logger';
import { aiClient } from '../../services/ai-client';
import { calculateSlaDeadline } from '../sla/sla.service';

export const ticketsService = {
  async createTicket(data: CreateTicketInput, userId: string) {
    // Run AI triage
    let aiTriage: Record<string, unknown> | undefined;
    let aiSummary: string | undefined;
    let embedding: number[] | undefined;

    try {
      const triageResult = await aiClient.triageTicket(data.title, data.description);
      aiTriage = {
        category: triageResult.category,
        priority: triageResult.priority,
        confidence: triageResult.confidence,
        suggestedAssignee: triageResult.suggestedAssignee,
        autoRoute: triageResult.confidence > 0.85,
      };
      aiSummary = triageResult.summary;
      embedding = triageResult.embedding;
    } catch (error) {
      logger.warn('AI triage failed, creating ticket without AI analysis', { error });
    }

    // Calculate SLA deadline
    let slaDeadline: Date | undefined;
    try {
      const priority = (aiTriage?.priority as TicketPriority) || data.priority || 'MEDIUM';
      slaDeadline = await calculateSlaDeadline(data.tenantId, priority);
    } catch (error) {
      logger.warn('SLA calculation failed', { error });
    }

    // Create ticket
    const ticket = await ticketsRepository.create({
      ...data,
      priority: (aiTriage?.priority as TicketPriority) || data.priority,
    });

    // Update with AI data if available
    if (aiTriage || aiSummary || embedding) {
      await ticketsRepository.update(ticket.id, {
        aiTriage,
        aiSummary,
      });

      if (embedding) {
        await ticketsRepository.updateEmbedding(ticket.id, embedding);
      }
    }

    logger.info(`Ticket created: ${ticket.id}`, { 
      userId, 
      tenantId: data.tenantId,
      aiTriage: aiTriage?.category,
    });

    const created = await ticketsRepository.findById(ticket.id);
    if (!created) {
      throw new NotFoundError('Ticket');
    }
    return created;
  },

  async getTicketById(id: string, userId: string, userRole: string, tenantId?: string) {
    const ticket = await ticketsRepository.findById(id);
    
    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    // Check access permissions
    if (userRole !== 'ADMIN_3SC' && ticket.tenantId !== tenantId) {
      throw new AuthorizationError('Access denied to this ticket');
    }

    return ticket;
  },

  async listTickets(
    filters: { tenantId?: string; status?: TicketStatus; priority?: TicketPriority; category?: string; search?: string },
    pagination: { page: number; limit: number },
    userId: string,
    userRole: string
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // If not admin, restrict to user's tenant
    const effectiveFilters = userRole === 'ADMIN_3SC' 
      ? filters 
      : { ...filters, tenantId: filters.tenantId };

    const { tickets, total } = await ticketsRepository.findMany(effectiveFilters, {
      skip,
      take: limit,
    });

    return {
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async updateTicket(
    id: string,
    data: UpdateTicketInput,
    userId: string,
    userRole: string,
    tenantId?: string
  ) {
    const ticket = await this.getTicketById(id, userId, userRole, tenantId);

    // Status transition validation
    if (data.status) {
      const validTransitions: Record<TicketStatus, TicketStatus[]> = {
        OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'],
        ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED'],
        IN_PROGRESS: ['RESOLVED'],
        RESOLVED: ['CLOSED', 'IN_PROGRESS'],
        CLOSED: ['OPEN'],
      };

      if (!validTransitions[ticket.status].includes(data.status)) {
        throw new ValidationError(`Cannot transition from ${ticket.status} to ${data.status}`);
      }

      // Set timestamps based on status
      if (data.status === 'ACKNOWLEDGED' && !ticket.acknowledgedAt) {
        data.acknowledgedAt = new Date();
        data.timeToAcknowledge = Math.floor(
          (data.acknowledgedAt.getTime() - ticket.createdAt.getTime()) / 1000
        );
      }

      if (data.status === 'RESOLVED' && !ticket.resolvedAt) {
        data.resolvedAt = new Date();
        data.timeToResolve = Math.floor(
          (data.resolvedAt.getTime() - ticket.createdAt.getTime()) / 1000
        );
      }

      if (data.status === 'CLOSED') {
        data.closedAt = new Date();
      }
    }

    const updated = await ticketsRepository.update(id, data);

    logger.info(`Ticket updated: ${id}`, { 
      userId, 
      changes: Object.keys(data),
    });

    return updated;
  },

  async deleteTicket(id: string, userId: string, userRole: string) {
    if (userRole !== 'ADMIN_3SC') {
      throw new AuthorizationError('Only admins can delete tickets');
    }

    await this.getTicketById(id, userId, userRole);
    await ticketsRepository.delete(id);

    logger.info(`Ticket deleted: ${id}`, { userId });
  },

  async runAiTriage(id: string, userId: string, userRole: string, tenantId?: string) {
    const ticket = await this.getTicketById(id, userId, userRole, tenantId);

    try {
      const result = await aiClient.triageTicket(ticket.title, ticket.description);
      
      await ticketsRepository.update(id, {
        aiTriage: {
          category: result.category,
          priority: result.priority,
          confidence: result.confidence,
          suggestedAssignee: result.suggestedAssignee,
          autoRoute: result.confidence > 0.85,
        },
        aiSummary: result.summary,
      });

      if (result.embedding) {
        await ticketsRepository.updateEmbedding(id, result.embedding);
      }

      // Find similar tickets
      const similar = await ticketsRepository.findSimilar(result.embedding, 0.8, id);
      await ticketsRepository.update(id, {
        similarTickets: similar.map(s => ({ ticketId: s.id, similarity: s.similarity })),
      });

      return {
        triage: result,
        similarTickets: similar,
      };
    } catch (error) {
      logger.error('AI triage failed', { error, ticketId: id });
      throw new ValidationError('AI triage failed');
    }
  },

  async getSimilarTickets(id: string, userId: string, userRole: string, tenantId?: string) {
    const embedding = await ticketsRepository.getEmbedding(id);

    if (!embedding) {
      // Run triage to generate embedding
      const triageResult = await this.runAiTriage(id, userId, userRole, tenantId);
      return triageResult.similarTickets;
    }

    return ticketsRepository.findSimilar(embedding, 0.8, id);
  },

  async getTicketStats(tenantId: string, userRole: string) {
    return ticketsRepository.getTicketStats(tenantId);
  },
};
