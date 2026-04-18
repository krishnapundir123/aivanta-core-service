import { documentsRepository, CreateDocumentInput } from './documents.repository';
import { aiClient } from '../../services/ai-client';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import logger from '../../shared/utils/logger';

export const documentsService = {
  async createDocument(data: CreateDocumentInput, userId: string) {
    // Generate summary if content is available
    let summary: string | undefined;
    if (data.parsedContent) {
      try {
        summary = await this.summarizeDocument(data.parsedContent);
      } catch (error) {
        logger.warn('Failed to generate document summary', { error });
      }
    }

    const document = await documentsRepository.create({
      ...data,
      summary,
    });

    // Generate embeddings for sections if parsed content exists
    if (data.parsedContent) {
      await this.processDocumentSections(document.id, data.parsedContent);
    }

    logger.info(`Document created: ${document.id}`, { userId });
    return document;
  },

  async getDocumentById(id: string, userId: string, tenantId: string) {
    const document = await documentsRepository.findById(id);

    if (!document) {
      throw new NotFoundError('Document');
    }

    if (document.tenantId !== tenantId) {
      throw new ValidationError('Access denied to this document');
    }

    return document;
  },

  async listDocuments(
    tenantId: string,
    filters: { documentType?: string; search?: string }
  ) {
    return documentsRepository.findMany({
      tenantId,
      documentType: filters.documentType as any,
      search: filters.search,
    });
  },

  async updateDocument(
    id: string,
    data: { parsedContent?: string; summary?: string },
    userId: string,
    tenantId: string
  ) {
    const document = await this.getDocumentById(id, userId, tenantId);

    // If content changed, regenerate summary and sections
    if (data.parsedContent && data.parsedContent !== document.parsedContent) {
      data.summary = await this.summarizeDocument(data.parsedContent);
      
      // Increment version
      await documentsRepository.update(id, { version: document.version + 1 });
      
      // Reprocess sections
      await this.processDocumentSections(id, data.parsedContent);
    }

    const updated = await documentsRepository.update(id, data);
    logger.info(`Document updated: ${id}`, { userId });

    return updated;
  },

  async deleteDocument(id: string, userId: string, tenantId: string) {
    await this.getDocumentById(id, userId, tenantId);
    await documentsRepository.delete(id);
    logger.info(`Document deleted: ${id}`, { userId });
  },

  async linkToTicket(
    documentId: string,
    ticketId: string,
    linkType: string,
    userId: string,
    tenantId: string
  ) {
    await this.getDocumentById(documentId, userId, tenantId);

    const link = await documentsRepository.linkToTicket({
      documentId,
      ticketId,
      linkedBy: userId,
      linkType,
    });

    logger.info(`Document ${documentId} linked to ticket ${ticketId}`, { userId });
    return link;
  },

  async unlinkFromTicket(
    documentId: string,
    ticketId: string,
    userId: string,
    tenantId: string
  ) {
    await this.getDocumentById(documentId, userId, tenantId);
    await documentsRepository.unlinkFromTicket(documentId, ticketId);
    logger.info(`Document ${documentId} unlinked from ticket ${ticketId}`, { userId });
  },

  async searchDocuments(query: string, tenantId: string, limit: number = 10) {
    // Generate embedding for the query
    const embedding = await aiClient.generateEmbedding(query);

    // Search similar documents
    const results = await documentsRepository.searchSimilar(
      embedding,
      tenantId,
      0.7,
      limit
    );

    return results;
  },

  // Helper methods
  async summarizeDocument(content: string): Promise<string> {
    try {
      // Use AI service to summarize
      const response = await aiClient.summarizeTicket('temp', [content]);
      return response;
    } catch (error) {
      logger.error('Failed to summarize document', { error });
      return content.substring(0, 200) + '...';
    }
  },

  async processDocumentSections(documentId: string, content: string) {
    try {
      // Simple section extraction - in production, use more sophisticated parsing
      const sections = this.extractSections(content);

      for (const section of sections) {
        const created = await documentsRepository.createSection({
          documentId,
          sectionPath: section.path,
          title: section.title,
          content: section.content,
        });

        // Generate embedding for the section
        try {
          const embedding = await aiClient.generateEmbedding(section.content);
          await documentsRepository.updateSectionEmbedding(created.id, embedding);
        } catch (error) {
          logger.warn('Failed to generate section embedding', { error });
        }
      }
    } catch (error) {
      logger.error('Failed to process document sections', { error });
    }
  },

  extractSections(content: string): Array<{ path: string; title: string; content: string }> {
    // Simple section extraction based on headers
    const lines = content.split('\n');
    const sections: Array<{ path: string; title: string; content: string }> = [];
    let currentSection: { path: string; title: string; content: string } | null = null;
    let sectionCounter = 0;

    for (const line of lines) {
      // Check if line is a header (simple heuristic)
      const headerMatch = line.match(/^(#{1,3}\s+|<h[1-3][^>]*>)(.+?)$/i);
      
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }

        sectionCounter++;
        const title = headerMatch[2]!.replace(/<[^>]+>/g, '').trim();
        currentSection = {
          path: sectionCounter.toString(),
          title,
          content: line + '\n',
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    // Don't forget the last section
    if (currentSection) {
      sections.push(currentSection);
    }

    // If no sections found, create one with all content
    if (sections.length === 0) {
      sections.push({
        path: '1',
        title: 'General',
        content,
      });
    }

    return sections;
  },
};
