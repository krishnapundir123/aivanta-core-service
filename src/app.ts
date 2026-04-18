import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { errorHandler } from './shared/middleware/error-handler';
import { generalLimiter } from './shared/middleware/rate-limiter';
import logger from './shared/utils/logger';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import ticketsRoutes from './modules/tickets/tickets.routes';
import messagesRoutes from './modules/messages/messages.routes';
import copilotRoutes from './modules/copilot/copilot.routes';
import assistantRoutes from './modules/assistant/assistant.routes';
import documentsRoutes from './modules/documents/documents.routes';
import reportsRoutes from './modules/reports/reports.routes';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }));
}

// Rate limiting
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/tickets/:ticketId/messages', messagesRoutes);
app.use('/api/v1/ai/copilot', copilotRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/reports', reportsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
