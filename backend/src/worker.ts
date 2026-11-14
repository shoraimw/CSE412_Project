import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { handleAsNodeRequest } from 'cloudflare:node';
import { AppModule } from './app.module';

interface DriveEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CORS_ORIGINS?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const PORT = 8787;
let bootstrap: Promise<void> | undefined;

async function startApi(env: DriveEnv): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY Worker secrets.');
  }

  // Nest providers read process.env when they are instantiated.
  process.env.SUPABASE_URL = env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  process.env.NODE_ENV = 'production';

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');

  const allowedOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  const server = app.getHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, resolve);
  });
}

export default {
  async fetch(request: Request, env: DriveEnv): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (!bootstrap) {
        bootstrap = startApi(env).catch((error) => {
          bootstrap = undefined;
          throw error;
        });
      }
      await bootstrap;
      return await handleAsNodeRequest(PORT, request);
    } catch (error) {
      console.error('DRIVE API bootstrap/request failure', error);
      return Response.json(
        {
          statusCode: 503,
          message: 'DRIVE API is temporarily unavailable. Check Worker bindings and logs.',
        },
        { status: 503 },
      );
    }
  },
};
