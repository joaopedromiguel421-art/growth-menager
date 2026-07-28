import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { logger } from "@growth-manager/observability";

const processStartedAt = performance.now();

export function registerRequestTimings(application: NestFastifyApplication): void {
  const starts = new WeakMap<object, number>();
  let firstRequest = true;
  const server = application.getHttpAdapter().getInstance();

  server.addHook("onRequest", (request, _reply, done) => {
    starts.set(request, performance.now());
    done();
  });

  server.addHook("onResponse", (request, reply, done) => {
    const startedAt = starts.get(request) ?? performance.now();
    const coldStart = firstRequest;
    firstRequest = false;
    const requestId = request.id;
    const route = request.routeOptions.url ?? "unmatched";

    logger.info(
      {
        requestId,
        traceId: header(request.headers["x-trace-id"]) ?? requestId,
        operation: `${request.method} ${route}`,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        statusCode: reply.statusCode,
        coldStart,
        ...(coldStart
          ? { processReadyAfterMs: Math.round((performance.now() - processStartedAt) * 100) / 100 }
          : {})
      },
      "API request completed"
    );
    done();
  });
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
