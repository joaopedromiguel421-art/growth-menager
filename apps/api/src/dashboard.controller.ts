import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DomainError } from "@growth-manager/domain";
import { DashboardService } from "./dashboard.service.js";
import type { AuthenticatedRequest } from "./request-context.js";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("v1/tenants/:tenantId/dashboard")
export class DashboardController {
  public constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOkResponse()
  public async get(@Req() request: AuthenticatedRequest): Promise<unknown> {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return this.dashboard.get(request.tenantContext);
  }
}
