import "reflect-metadata";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApplication } from "../src/bootstrap.js";

let applicationPromise: Promise<NestFastifyApplication> | undefined;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  applicationPromise ??= createApplication();
  const application = await applicationPromise;
  application.getHttpAdapter().getInstance().routing(request, response);
}
