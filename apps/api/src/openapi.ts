import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

function configuration(): ReturnType<DocumentBuilder["build"]> {
  return new DocumentBuilder()
    .setTitle("Growth Manager API")
    .setVersion("1.1")
    .addBearerAuth()
    .build();
}

export function createOpenApiDocument(application: NestFastifyApplication): OpenAPIObject {
  return SwaggerModule.createDocument(application, configuration());
}

export function setupOpenApi(application: NestFastifyApplication): void {
  SwaggerModule.setup("openapi", application, createOpenApiDocument(application));
}
