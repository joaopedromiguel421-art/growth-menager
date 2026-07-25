import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@growth-manager/database";
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
    } catch {
      throw new ServiceUnavailableException("Database is not ready.");
    }
  }
}
