import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import serverless from 'serverless-http';
import { getCorsOptions } from './config/cors';

let handler: ReturnType<typeof serverless> | undefined;
async function getHandler() {
  if (!handler) {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    app.enableCors(getCorsOptions());
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      transformOptions: { enableImplicitConversion: true }
    }));
    await app.init();
    handler = serverless(app.getHttpAdapter().getInstance());
  }
  return handler;
}
export default async function vercelHandler(req: any, res: any) {
  const run = await getHandler();
  return run(req, res);
}
