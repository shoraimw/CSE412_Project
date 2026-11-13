/** Same-origin requests need no CORS. Cross-origin access is allowlist-only. */
export function getCorsOptions() {
  const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
    allowedOrigins.push('http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000');
  }
  return {
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}
