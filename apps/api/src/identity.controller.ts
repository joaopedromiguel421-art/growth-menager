import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DomainError } from "@growth-manager/domain";
import { IdentityService } from "./identity.service.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { SessionScoped } from "./session.decorator.js";

@ApiTags("identity")
@ApiBearerAuth()
@Controller("v1/me")
export class IdentityController {
  public constructor(private readonly identity: IdentityService) {}

  @SessionScoped()
  @Get()
  @ApiOkResponse()
  public currentSession(@Req() request: AuthenticatedRequest): Promise<unknown> {
    if (request.authSubject === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return this.identity.currentSession({
      authUserId: request.authSubject,
      aal: request.authAal ?? "aal1"
    });
  }
}
