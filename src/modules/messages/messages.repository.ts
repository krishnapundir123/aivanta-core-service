import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';

export interface CreateMessageInput {
  ticketId: string;
  authorId: string;
  content: string;
  visibility?: string;
  parentId?: string;
  isAiGenerated?: boolean;
  aiModel?: string;
  attachments?: Array<{
    filename: string;
    storageKey: string;
    mimeType: string;
  }>;
}

export const messagesRepository = {
  async create(data: CreateMessageInput) {
    return prisma.message.create({
      data: {
        ticketId: data.ticketId,
        authorId: data.authorId,
        content: data.content,
        visibility: data.visibility || 'public',
        parentId: data.parentId,
        isAiGenerated: data.isAiGenerated || false,
        aiModel: data.aiModel,
        attachments: data.attachments || [],
      },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        replies: {
          include: {
            author: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.message.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        replies: {
          include: {
            author: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  },

  async findByTicketId(ticketId: string, options: { visibility?: string } = {}) {
    const where: Prisma.MessageWhereInput = { ticketId };
    
    if (options.visibility) {
      where.visibility = options.visibility;
    }

    return prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        replies: {
          include: {
            author: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  },

  async update(id: string, data: Partial<CreateMessageInput>) {
    return prisma.message.update({
      where: { id },
      data: {
        content: data.content,
      },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  },

  async delete(id: string) {
    return prisma.message.delete({
      where: { id },
    });
  },

  async updateEmbedding(id: string, embedding: number[]) {
    const embeddingString = `[${embedding.join(',')}]`;
    
    await prisma.$executeRaw`
      UPDATE messages 
      SET embedding = ${embeddingString}::vector
      WHERE id = ${id}
    `;
  },
};
