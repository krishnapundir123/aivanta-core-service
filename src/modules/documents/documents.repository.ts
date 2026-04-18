import { prisma } from '../../config/database';
import { DocumentType, Prisma } from '@prisma/client';

export interface CreateDocumentInput {
  tenantId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  uploadedBy: string;
  parsedContent?: string;
  summary?: string;
}

export interface UpdateDocumentInput {
  parsedContent?: string;
  summary?: string;
  version?: number;
}

export const documentsRepository = {
  async create(data: CreateDocumentInput) {
    return prisma.document.create({
      data: {
        ...data,
        version: 1,
      },
      include: {
        sections: true,
        ticketLinks: {
          include: {
            ticket: {
              select: { id: true, title: true, status: true },
            },
          },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.document.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { sectionPath: 'asc' },
        },
        ticketLinks: {
          include: {
            ticket: {
              select: { id: true, title: true, status: true },
            },
          },
        },
      },
    });
  },

  async findMany(filters: { tenantId: string; documentType?: DocumentType; search?: string }) {
    const where: Prisma.DocumentWhereInput = {
      tenantId: filters.tenantId,
    };

    if (filters.documentType) {
      where.documentType = filters.documentType;
    }

    if (filters.search) {
      where.OR = [
        { filename: { contains: filters.search, mode: 'insensitive' } },
        { parsedContent: { contains: filters.search, mode: 'insensitive' } },
        { summary: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { ticketLinks: true, sections: true },
        },
      },
    });
  },

  async update(id: string, data: UpdateDocumentInput) {
    return prisma.document.update({
      where: { id },
      data,
      include: {
        sections: true,
      },
    });
  },

  async delete(id: string) {
    return prisma.document.delete({
      where: { id },
    });
  },

  // Document sections
  async createSection(data: {
    documentId: string;
    sectionPath: string;
    title: string;
    content: string;
    requirements?: Prisma.InputJsonValue;
  }) {
    return prisma.documentSection.create({
      data,
    });
  },

  async findSectionsByDocumentId(documentId: string) {
    return prisma.documentSection.findMany({
      where: { documentId },
      orderBy: { sectionPath: 'asc' },
    });
  },

  async updateSectionEmbedding(id: string, embedding: number[]) {
    const embeddingString = `[${embedding.join(',')}]`;
    await prisma.$executeRaw`
      UPDATE document_sections 
      SET embedding = ${embeddingString}::vector
      WHERE id = ${id}
    `;
  },

  // Ticket links
  async linkToTicket(data: {
    documentId: string;
    ticketId: string;
    linkedBy: string;
    linkType?: string;
  }) {
    return prisma.documentTicketLink.create({
      data: {
        ...data,
        linkType: data.linkType || 'reference',
      },
      include: {
        ticket: {
          select: { id: true, title: true, status: true },
        },
      },
    });
  },

  async unlinkFromTicket(documentId: string, ticketId: string) {
    return prisma.documentTicketLink.deleteMany({
      where: {
        documentId,
        ticketId,
      },
    });
  },

  async findLinkedTickets(documentId: string) {
    return prisma.documentTicketLink.findMany({
      where: { documentId },
      include: {
        ticket: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });
  },

  // Semantic search using pgvector
  async searchSimilar(embedding: number[], tenantId: string, threshold: number = 0.7, limit: number = 10) {
    const embeddingString = `[${embedding.join(',')}]`;

    const query = `
      SELECT 
        d.id,
        d.filename,
        d.document_type as "documentType",
        d.summary,
        1 - (ds.embedding <=> ${embeddingString}::vector) as similarity
      FROM documents d
      JOIN document_sections ds ON ds.document_id = d.id
      WHERE d.tenant_id = '${tenantId}'
      AND ds.embedding IS NOT NULL
      AND 1 - (ds.embedding <=> ${embeddingString}::vector) >= ${threshold}
      ORDER BY ds.embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;

    return prisma.$queryRawUnsafe<
      Array<{
        id: string;
        filename: string;
        documentType: string;
        summary: string;
        similarity: number;
      }>
    >(query);
  },
};
