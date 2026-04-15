import cron from 'node-cron';
import { checkSlaBreaches } from '../modules/sla/sla.service';
import logger from '../shared/utils/logger';

export function startScheduledJobs(): void {
  // SLA breach check - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.debug('Running SLA breach check...');
      await checkSlaBreaches();
    } catch (error) {
      logger.error('SLA breach check failed:', error);
    }
  });

  // Session cleanup - daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.debug('Running session cleanup...');
      const { authRepository } = await import('../modules/auth/auth.repository');
      const deleted = await authRepository.cleanupExpiredSessions();
      logger.info(`Cleaned up ${deleted.count} expired sessions`);
    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  });

  // Recurrent pattern analysis - weekly on Sunday at 3 AM
  cron.schedule('0 3 * * 0', async () => {
    try {
      logger.info('Running recurrent pattern analysis...');
      // TODO: Implement pattern detection
      // const { analyzeRecurrentPatterns } = await import('./recurrent-analysis.job');
      // await analyzeRecurrentPatterns();
    } catch (error) {
      logger.error('Pattern analysis failed:', error);
    }
  });

  logger.info('Scheduled jobs started');
}
