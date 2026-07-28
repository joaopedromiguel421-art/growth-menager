import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { sql, type DatabaseClient } from "@growth-manager/database";
import { logger } from "@growth-manager/observability";
import { DATABASE } from "./database.provider.js";
import { Public } from "./public.decorator.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  @Public()
  @Get("live")
  @ApiOkResponse()
  public live(): Readonly<Record<string, string>> {
    return { status: "ok", service: "growth-manager-api" };
  }

  @Public()
  @Get("ready")
  @ApiOkResponse()
  public async ready(): Promise<Readonly<Record<string, string>>> {
    try {
      await this.client.database.execute(sql`select 1 as ready`);
      return { status: "ready", database: "connected", queue: "database-backed" };
    } catch (error) {
      // The probe answers a fixed 503 so it never leaks the connection string,
      // which makes the log the only place the real cause (timeout, refused
      // host, rejected credentials) can be read.
      const requestId = crypto.randomUUID();
      logger.error(
        {
          requestId,
          traceId: requestId,
          operation: "GET /health/ready",
          cause:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { name: "UnknownError", message: String(error) }
        },
        "Readiness probe could not reach the database"
      );
      throw new ServiceUnavailableException("Database is not ready.");
    }
  }
}
