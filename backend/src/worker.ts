import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getCorsOptions } from './config/cors';
import { setDriveRuntimeConfig } from './config/runtime-config';

let handlerPromise: Promise<ReturnType<typeof httpServerHandler>> | undefined;

async function createHandler() {
  setDriveRuntimeConfig({
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
    corsOrigin: env.CORS_ORIGIN || '',
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
    handlerPromise ??= createHandler();
    const handler = await handlerPromise;
    return handler.fetch(request);
  },
};
