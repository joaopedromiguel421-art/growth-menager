import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module.js";

export async function createApplication(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: 1024 * 1024,
    trustProxy: true,
    requestIdHeader: "x-request-id",
    genReqId: (): string => crypto.randomUUID()
  });
  const application = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    rawBody: true
  });
  await application.register(helmet, {
    contentSecurityPolicy: false
  });
  await application.register(cors, {
    origin: false,
    credentials: false
  });
  application.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: false,
      whitelist: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Growth Manager API")
    .setVersion("1.1")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "openapi",
    application,
    SwaggerModule.createDocument(application, swaggerConfig)
  );

  await application.init();
  return application;
}
