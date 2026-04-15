import { createServer } from 'http';
import app from './app';
import { config } from './config';
import { initializeDatabase } from './config/database';
import { initializeDefaultSlaConfig } from './modules/sla/sla.service';
import { socketService } from './services/socket.service';
import { startScheduledJobs } from './jobs';
import logger from './shared/utils/logger';

const PORT = config.port;

async function bootstrap(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();

    // Initialize default SLA config
    await initializeDefaultSlaConfig();

    // Create HTTP server
    const server = createServer(app);

    // Initialize Socket.IO
    socketService.initialize(server);

    // Start scheduled jobs
    startScheduledJobs();

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close database connection
      await import('./config/database').then(({ prisma }) => prisma.$disconnect());
      
      // Close Redis connections
      await import('./config/redis').then(({ redis, redisSubscriber }) => {
        redis.disconnect();
        redisSubscriber.disconnect();
      });

      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
