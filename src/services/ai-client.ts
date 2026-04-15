import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import logger from '../shared/utils/logger';

export interface TriageResult {
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  suggestedAssignee?: string;
  summary: string;
  embedding: number[];
}

export interface CopilotResponse {
  content: string;
  actions?: Array<{
    type: string;
    label: string;
    params: Record<string, unknown>;
  }>;
  context?: Record<string, unknown>;
}

export interface AssistantResponse {
  content: string;
  deflectionConfidence: number;
  suggestedResources?: string[];
  shouldCreateTicket: boolean;
}

class AIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.aiService.url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.aiService.apiKey,
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('AI Service error:', {
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async triageTicket(title: string, description: string): Promise<TriageResult> {
    const response = await this.client.post('/triage', {
      title,
      description,
    });
    return response.data;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.post('/embeddings', {
      text,
    });
    return response.data.embedding;
  }

  async copilotQuery(
    query: string,
    context: Record<string, unknown>,
    userId: string,
    sessionId?: string
  ): Promise<CopilotResponse> {
    const response = await this.client.post('/copilot/query', {
      query,
      context,
      userId,
      sessionId,
    });
    return response.data;
  }

  async copilotExecuteAction(
    action: string,
    params: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    const response = await this.client.post('/copilot/action', {
      action,
      params,
      userId,
    });
    return response.data;
  }

  async assistantQuery(
    query: string,
    sessionId: string,
    tenantId: string,
    history: Array<{ role: string; content: string }>
  ): Promise<AssistantResponse> {
    const response = await this.client.post('/assistant/query', {
      query,
      sessionId,
      tenantId,
      history,
    });
    return response.data;
  }

  async summarizeTicket(ticketId: string, messages: string[]): Promise<string> {
    const response = await this.client.post('/summarize', {
      ticketId,
      messages,
    });
    return response.data.summary;
  }

  async predictSlaBreach(ticketId: string, context: Record<string, unknown>): Promise<{
    willBreach: boolean;
    probability: number;
    estimatedBreachTime?: string;
    riskFactors: string[];
  }> {
    const response = await this.client.post('/sla/predict', {
      ticketId,
      context,
    });
    return response.data;
  }

  async analyzePatterns(tenantId: string, tickets: unknown[]): Promise<{
    patterns: Array<{
      name: string;
      description: string;
      ticketIds: string[];
      confidence: number;
      rootCause?: string;
      suggestedFix?: string;
    }>;
  }> {
    const response = await this.client.post('/patterns/analyze', {
      tenantId,
      tickets,
    });
    return response.data;
  }

  async generateReportNarrative(data: unknown, reportType: string): Promise<string> {
    const response = await this.client.post('/reports/narrative', {
      data,
      reportType,
    });
    return response.data.narrative;
  }
}

export const aiClient = new AIClient();
export default aiClient;
