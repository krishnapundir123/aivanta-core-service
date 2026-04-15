import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-min-32-characters-long',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-min-32',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  
  // AI Service
  aiService: {
    url: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.AI_SERVICE_API_KEY || '',
  },
  
  // Storage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 's3',
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET || 'aivanta-documents',
    },
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    },
  },
  
  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    sessionSecret: process.env.SESSION_SECRET || 'fallback-session-secret',
  },
  
  // Email
  email: {
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: process.env.FROM_EMAIL || 'noreply@aivanta.com',
  },
};

export default config;
