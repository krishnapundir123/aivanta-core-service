import { prisma } from '../../config/database';
import { TicketStatus, TicketPriority, Prisma } from '@prisma/client';

export interface CreateTicketInput {
  tenantId: string;
  title: string;
  description: string;
  requesterId: string;
  priority?: TicketPriority;
  category?: string;
  tags?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: string;
  tags?: string[];
  assigneeId?: string;
  aiTriage?: Record<string, unknown>;
  aiSummary?: string;
  slaDeadline?: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  timeToAcknowledge?: number;
  timeToResolve?: number;
  similarTickets?: unknown;
}

export interface TicketFilters {
  tenantId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  requesterId?: string;
  category?: string;
  search?: string;
}

export const ticketsRepository = {
  async create(data: CreateTicketInput) {
    return prisma.ticket.create({
      data: {
        ...data,
        priority: data.priority || 'MEDIUM',
      },
      include: {
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        requester: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        requester: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  },

  async findMany(filters: TicketFilters, options: { skip?: number; take?: number; orderBy?: Prisma.TicketOrderByWithRelationInput } = {}) {
    const where: Prisma.TicketWhereInput = {};

    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.requesterId) where.requesterId = filters.requesterId;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy || { createdAt: 'desc' },
        include: {
          assignee: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          requester: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return { tickets, total };
  },

  async update(id: string, data: UpdateTicketInput) {
    return prisma.ticket.update({
      where: { id },
      data: data as any,
      include: {
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        requester: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  },

  async delete(id: string) {
    return prisma.ticket.delete({
      where: { id },
    });
  },

  async findSimilar(embedding: number[], threshold: number = 0.85, excludeId?: string) {
    const embeddingString = `[${embedding.join(',')}]`;
    
    const query = `
      SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        1 - (t.embedding <=> ${embeddingString}::vector) as similarity
      FROM tickets t
      WHERE t.embedding IS NOT NULL
      ${excludeId ? `AND t.id != '${excludeId}'` : ''}
      AND 1 - (t.embedding <=> ${embeddingString}::vector) >= ${threshold}
      ORDER BY t.embedding <=> ${embeddingString}::vector
      LIMIT 5
    `;

    return prisma.$queryRawUnsafe<Array<{ id: string; title: string; status: string; priority: string; similarity: number }>>(query);
  },

  async updateEmbedding(id: string, embedding: number[]) {
    const embeddingString = `[${embedding.join(',')}]`;
    
    await prisma.$executeRaw`
      UPDATE tickets 
      SET embedding = ${embeddingString}::vector
      WHERE id = ${id}
    `;
  },

  async getEmbedding(id: string): Promise<number[] | null> {
    const result = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
      SELECT embedding::text as embedding FROM tickets WHERE id = ${id}
    `;
    const text = result[0]?.embedding;
    if (!text) return null;
    return text.replace(/[\[\]]/g, '').split(',').map(Number);
  },

  async getTicketStats(tenantId: string) {
    const [
      total,
      byStatus,
      byPriority,
      overdue,
      resolvedToday,
    ] = await Promise.all([
      prisma.ticket.count({ where: { tenantId } }),
      prisma.ticket.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
      }),
      prisma.ticket.groupBy({
        by: ['priority'],
        where: { tenantId },
        _count: { priority: true },
      }),
      prisma.ticket.count({
        where: {
          tenantId,
          slaDeadline: { lt: new Date() },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
      prisma.ticket.count({
        where: {
          tenantId,
          resolvedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, curr) => ({
        ...acc,
        [curr.status]: curr._count.status,
      }), {}),
      byPriority: byPriority.reduce((acc, curr) => ({
        ...acc,
        [curr.priority]: curr._count.priority,
      }), {}),
      overdue,
      resolvedToday,
    };
  },
};
