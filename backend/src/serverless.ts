import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import serverless from 'serverless-http';
let handler: ReturnType<typeof serverless> | undefined;
async function getHandler(){
 if(!handler){
  const app=await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({origin:process.env.CORS_ORIGIN?.split(',').map(x=>x.trim())||true});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  await app.init();
  handler=serverless(app.getHttpAdapter().getInstance());
 }
 return handler;
}
export default async function vercelHandler(req:any,res:any){
 const run=await getHandler();
 return run(req,res);
}