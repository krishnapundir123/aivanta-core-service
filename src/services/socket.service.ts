import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redis, redisSubscriber } from '../config/redis';
import logger from '../shared/utils/logger';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId?: string;
  };
}

export class SocketService {
  private io: SocketIOServer | null = null;

  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.frontendUrl,
        credentials: true,
      },
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const payload = jwt.verify(token, config.jwt.secret) as {
          userId: string;
          email: string;
          role: string;
          tenantId?: string;
        };

        socket.user = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
        };

        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.setupEventHandlers();
    this.setupRedisSubscriber();

    logger.info('Socket.IO initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`Socket connected: ${socket.id}, user: ${socket.user?.id}`);

      // Join user's room for direct messages
      socket.join(`user:${socket.user!.id}`);

      // Join tenant room
      if (socket.user!.tenantId) {
        socket.join(`tenant:${socket.user!.tenantId}`);
      }

      // Handle ticket subscription
      socket.on('ticket:subscribe', (ticketId: string) => {
        socket.join(`ticket:${ticketId}`);
        logger.debug(`User ${socket.user!.id} subscribed to ticket ${ticketId}`);
      });

      socket.on('ticket:unsubscribe', (ticketId: string) => {
        socket.leave(`ticket:${ticketId}`);
        logger.debug(`User ${socket.user!.id} unsubscribed from ticket ${ticketId}`);
      });

      // Handle Copilot messages
      socket.on('copilot:message', async (data: { query: string; context: Record<string, unknown> }) => {
        try {
          // Forward to AI service
          const response = await this.handleCopilotMessage(
            socket.user!.id,
            data.query,
            data.context
          );

          socket.emit('copilot:response', response);
        } catch (error) {
          socket.emit('copilot:error', { message: 'Failed to process query' });
        }
      });

      // Handle Assistant messages
      socket.on('assistant:message', async (data: { query: string; sessionId: string }) => {
        try {
          const response = await this.handleAssistantMessage(
            data.sessionId,
            data.query,
            socket.user!.tenantId
          );

          socket.emit('assistant:response', response);
        } catch (error) {
          socket.emit('assistant:error', { message: 'Failed to process query' });
        }
      });

      // Handle typing indicators
      socket.on('ticket:typing', (data: { ticketId: string; isTyping: boolean }) => {
        socket.to(`ticket:${data.ticketId}`).emit('ticket:typing', {
          userId: socket.user!.id,
          ticketId: data.ticketId,
          isTyping: data.isTyping,
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  private setupRedisSubscriber(): void {
    // Subscribe to Redis events for cross-server broadcasting
    redisSubscriber.subscribe('ticket:message', 'ticket:update', 'notification:new');
    
    redisSubscriber.on('message', (channel, message) => {
      if (!this.io) return;

      const data = JSON.parse(message);
      
      switch (channel) {
        case 'ticket:message':
          this.io.to(`ticket:${data.ticketId}`).emit('message:new', data.message);
          break;
        case 'ticket:update':
          this.io.to(`ticket:${data.ticketId}`).emit('ticket:update', data.ticket);
          break;
        case 'notification:new':
          this.io.to(`user:${data.userId}`).emit('notification:new', data.notification);
          break;
      }
    });
  }

  private async handleCopilotMessage(
    userId: string,
    query: string,
    context: Record<string, unknown>
  ): Promise<unknown> {
    // Import dynamically to avoid circular dependency
    const { aiClient } = await import('./ai-client');
    return aiClient.copilotQuery(query, context, userId);
  }

  private async handleAssistantMessage(
    sessionId: string,
    query: string,
    tenantId?: string
  ): Promise<unknown> {
    const { aiClient } = await import('./ai-client');
    const history: Array<{ role: string; content: string }> = []; // Load from Redis/cache
    return aiClient.assistantQuery(query, sessionId, tenantId || '', history);
  }

  // Public methods for emitting events
  emitToTicket(ticketId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(`ticket:${ticketId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  emitToTenant(tenantId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(`tenant:${tenantId}`).emit(event, data);
  }

  broadcast(event: string, data: unknown): void {
    if (!this.io) return;
    this.io.emit(event, data);
  }
}

export const socketService = new SocketService();
export default socketService;
