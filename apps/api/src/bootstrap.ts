import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module.js";
import { setupOpenApi } from "./openapi.js";
import { registerRequestTimings } from "./request-timing.js";

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
  registerRequestTimings(application);

  if (process.env.APP_ENV !== "production") setupOpenApi(application);

  await application.init();
  await application.getHttpAdapter().getInstance().ready();
  return application;
}
