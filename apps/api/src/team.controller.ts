import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  invitationAcceptSchema,
  invitationCreateSchema,
  membershipUpdateSchema
} from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { SessionScoped } from "./session.decorator.js";
import { TeamService } from "./team.service.js";

@ApiTags("team")
@ApiBearerAuth()
@Controller()
export class TeamController {
  public constructor(private readonly team: TeamService) {}

  @Get("v1/tenants/:tenantId/team")
  public overview(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.team.overview(this.context(request));
  }

  @Post("v1/tenants/:tenantId/invitations")
  public invite(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.team.invite(
      this.context(request),
      requireIdempotencyKey(idempotencyKey),
      invitationCreateSchema.parse(body)
    );
  }

  @Delete("v1/tenants/:tenantId/invitations/:invitationId")
  public revoke(
    @Req() request: AuthenticatedRequest,
    @Param("invitationId") invitationId: string
  ): Promise<void> {
    return this.team.revokeInvitation(this.context(request), invitationId);
  }

  @Patch("v1/tenants/:tenantId/memberships/:membershipId")
  public updateMembership(
    @Req() request: AuthenticatedRequest,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.team.updateMembership(
      this.context(request),
      membershipId,
      membershipUpdateSchema.parse(body)
    );
  }

  /**
   * Session scoped: the invitee has just signed in and holds no membership yet,
   * so demanding a tenant here would make the invite impossible to accept. The
   * identity comes from the verified token, never from the request body.
   */
  @SessionScoped()
  @Post("v1/invitations/accept")
  public accept(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<unknown> {
    if (request.authSubject === undefined || request.authEmail === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    const input = invitationAcceptSchema.parse(body);
    return this.team.accept({
      token: input.token,
      authUserId: request.authSubject,
      email: request.authEmail,
      name: request.authEmail.split("@")[0] ?? request.authEmail
    });
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }
}
