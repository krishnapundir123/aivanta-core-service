import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const MAX_RETRY_ATTEMPTS = 5;

export let isRedisAvailable = false;

export const redis = new Redis(redisUrl, {
  retryStrategy: (times) => {
    if (times >= MAX_RETRY_ATTEMPTS) {
      isRedisAvailable = false;
      return null; // stop retrying
    }
    return Math.min(times * 200, 2000);
  },
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: false,
});

export const redisSubscriber = new Redis(redisUrl, {
  retryStrategy: (times) => {
    if (times >= MAX_RETRY_ATTEMPTS) return null;
    return Math.min(times * 200, 2000);
  },
});

redisSubscriber.on('error', () => {
  // suppress unhandled error events; redis.on('error') already logs
});

redis.on('connect', () => {
  isRedisAvailable = true;
  console.log('✅ Redis connected');
});

redis.on('close', () => {
  isRedisAvailable = false;
});

redis.on('error', (err) => {
  isRedisAvailable = false;
  const msg = err.message || (err as NodeJS.ErrnoException).code || String(err);
  console.error('❌ Redis unavailable:', msg);
});

// Session management helpers
export const sessionStore = {
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) as T : null;
  },

  async delete(key: string): Promise<void> {
    await redis.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  },
};

// Rate limiting helpers
export const rateLimitStore = {
  async increment(key: string, windowSeconds: number): Promise<{ count: number; resetTime: number }> {
    const multi = redis.multi();
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.pexpire(key, windowSeconds * 1000);

    const results = await multi.exec();
    const count = results?.[2]?.[1] as number || 0;
    const resetTime = now + windowSeconds * 1000;

    return { count, resetTime };
  },
};

// Pub/Sub helpers
export const eventBus = {
  async publish(channel: string, message: unknown): Promise<void> {
    await redis.publish(channel, JSON.stringify(message));
  },

  subscribe(channel: string, handler: (message: unknown) => void): void {
    redisSubscriber.subscribe(channel);
    redisSubscriber.on('message', (ch, message) => {
      if (ch === channel) {
        handler(JSON.parse(message));
      }
    });
  },

  unsubscribe(channel: string): void {
    redisSubscriber.unsubscribe(channel);
  },
};

export default redis;
