import winston from 'winston';
import { config } from '../../config';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  if (stack) {
    msg += `\n${stack}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  defaultMeta: { service: 'aivanta-core' },
  format: combine(
    timestamp(),
    errors({ stack: true })
  ),
  transports: [
    // Console output
    new winston.transports.Console({
      format: combine(
        colorize(),
        config.nodeEnv === 'development' ? devFormat : json()
      ),
    }),
  ],
});

// Add file transports in production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

export default logger;
