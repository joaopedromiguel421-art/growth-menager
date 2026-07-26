import { Body, Controller, Get, Headers, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { tenantCreateSchema, tenantUpdateSchema } from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { IdentityService } from "./identity.service.js";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { SessionScoped } from "./session.decorator.js";
import { TenantsService } from "./tenants.service.js";

@ApiTags("tenants")
@ApiBearerAuth()
@Controller("v1/tenants")
export class TenantsController {
  public constructor(
    private readonly tenants: TenantsService,
    private readonly identity: IdentityService
  ) {}

  /**
   * The session already carries every tenant the caller may enter, so this
   * reuses it rather than running a second, subtly different, access query.
   */
  @SessionScoped()
  @Get()
  public async list(@Req() request: AuthenticatedRequest): Promise<unknown> {
    const session = await this.identity.currentSession({
      authUserId: this.authSubject(request),
      aal: request.authAal ?? "aal1"
    });
    return session.tenants;
  }

  // Session scoped by necessity: there is no tenant to name in the header yet.
  @SessionScoped()
  @Post()
  public create(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    requireIdempotencyKey(idempotencyKey);
    return this.tenants.create(tenantCreateSchema.parse(body), this.authSubject(request));
  }

  @Patch(":tenantId")
  public update(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<unknown> {
    return this.tenants.update(this.context(request), tenantUpdateSchema.parse(body));
  }

  private authSubject(request: AuthenticatedRequest): string {
    if (request.authSubject === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.authSubject;
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }
}
