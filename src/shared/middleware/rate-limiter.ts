import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { RateLimitError } from '../utils/errors';

// General API rate limiter
export const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    });
  },
});

// Stricter limiter for auth endpoints
export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// AI endpoint limiter (more restrictive due to costs)
export const aiLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 AI requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

// Custom rate limiter with different limits per endpoint
export function createRateLimiter(
  maxRequests: number,
  windowMs: number = 60 * 1000
) {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// Per-user rate limiting middleware
export async function userRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  const ip = req.ip;
  const key = `ratelimit:user:${userId || ip}`;
  
  const windowSeconds = 60;
  const maxRequests = 100;
  
  try {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.pexpire(key, windowSeconds * 1000);
    
    const results = await multi.exec();
    const count = results?.[2]?.[1] as number || 0;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
    
    if (count > maxRequests) {
      next(new RateLimitError());
      return;
    }
    
    next();
  } catch (error) {
    next(error);
  }
}
