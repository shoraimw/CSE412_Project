import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap(){const app=await NestFactory.create(AppModule);app.setGlobalPrefix('api');app.enableCors({origin:(process.env.CORS_ORIGINS||'http://localhost:5500').split(',').map(x=>x.trim()),methods:['GET','POST','PATCH','OPTIONS'],allowedHeaders:['Content-Type','Authorization']});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(Number(process.env.PORT||3000));}bootstrap();