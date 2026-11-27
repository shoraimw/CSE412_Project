import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getCorsOptions } from './config/cors';
import { setDriveRuntimeConfig } from './config/runtime-config';

let handlerPromise: Promise<ReturnType<typeof httpServerHandler>> | undefined;

function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('X-DNS-Prefetch-Control', 'off');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(self), notifications=(self), camera=(), microphone=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function createHandler(bindings: Env) {
  setDriveRuntimeConfig({
    supabaseUrl: bindings.SUPABASE_URL || '',
    supabaseAnonKey: bindings.SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: bindings.SUPABASE_SERVICE_ROLE_KEY || '',
    corsOrigin: bindings.CORS_ORIGIN || '',
    appBaseUrl: bindings.DRIVE_PUBLIC_URL || 'https://drive-ewu.pages.dev',
    sslcommerzStoreId: bindings.SSLCOMMERZ_STORE_ID || '',
    sslcommerzStorePassword: bindings.SSLCOMMERZ_STORE_PASSWORD || '',
    sslcommerzMode: bindings.SSLCOMMERZ_MODE === 'live' ? 'live' : 'sandbox',
    drivePaymentWebhookSecret: bindings.DRIVE_PAYMENT_WEBHOOK_SECRET || '',
    nodeEnv: 'production',
  });

  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api');
  app.enableCors(getCorsOptions());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.listen(8787);
  return httpServerHandler({ port: 8787 });
}

export default {
  async fetch(request: Request, envBindings: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return addSecurityHeaders(await envBindings.ASSETS.fetch(request));
    }
    handlerPromise ??= createHandler(envBindings);
    const handler = await handlerPromise;
    return addSecurityHeaders(await handler.fetch(request));
  },
};
