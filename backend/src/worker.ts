import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getCorsOptions } from './config/cors';
import { setDriveRuntimeConfig } from './config/runtime-config';

let handlerPromise: Promise<ReturnType<typeof httpServerHandler>> | undefined;

async function createHandler(bindings: Env) {
  setDriveRuntimeConfig({
    supabaseUrl: bindings.SUPABASE_URL || '',
    supabaseAnonKey: bindings.SUPABASE_ANON_KEY || '',
    corsOrigin: bindings.CORS_ORIGIN || '',
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

    // Only API routes should enter NestJS. All other requests must be served
    // by Workers Static Assets (HTML, CSS, JS, images, favicon, etc.).
    if (!url.pathname.startsWith('/api/')) {
      return envBindings.ASSETS.fetch(request);
    }

    handlerPromise ??= createHandler(envBindings);
    const handler = await handlerPromise;
    return handler.fetch(request);
  },
};
