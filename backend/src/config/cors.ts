import { getDriveRuntimeConfig } from './runtime-config';

/** Same-origin Cloudflare requests need no CORS; local development uses a small allowlist. */
export function getCorsOptions() {
  const config = getDriveRuntimeConfig();
  const allowedOrigins = config.corsOrigin.split(',').map(x => x.trim()).filter(Boolean);
  if (config.nodeEnv !== 'production' && allowedOrigins.length === 0) {
    allowedOrigins.push('http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://localhost:8787');
  }
  return {
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}