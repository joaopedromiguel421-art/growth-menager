import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  authorizeRequestSchema,
  propertySelectionSchema,
  providerSchema,
  type Provider
} from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { IntegrationsService } from "./integrations.service.js";
import { Public } from "./public.decorator.js";
import type { AuthenticatedRequest } from "./request-context.js";

interface RedirectResponse {
  redirect(url: string): void;
}

@ApiTags("integrations")
@ApiBearerAuth()
@Controller("v1")
export class IntegrationsController {
  public constructor(private readonly integrations: IntegrationsService) {}

  @Get("tenants/:tenantId/integrations")
  public list(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.integrations.list(this.context(request));
  }

  @Post("tenants/:tenantId/integrations/:provider/authorize")
  public authorize(
    @Req() request: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.integrations.authorize(
      this.context(request),
      this.provider(provider),
      authorizeRequestSchema.parse(body ?? {})
    );
  }

  /**
   * Google redirects the operator's browser here, so the route cannot require a
   * bearer token; the signed single-use state is what proves the request is ours.
   */
  @Public()
  @Get("integrations/:provider/callback")
  public async callback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() response: RedirectResponse
  ): Promise<void> {
    if (error !== undefined) {
      throw new DomainError("GM-OAUTH-DENIED", "A autorização foi recusada no Google.", false);
    }
    if (code === undefined || state === undefined) {
      throw new DomainError("GM-OAUTH-CALLBACK-INVALID", "Retorno de autorização inválido.", false);
    }
    const result = await this.integrations.callback(this.provider(provider), code, state);
    response.redirect(result.redirectUrl);
  }

  @Get("tenants/:tenantId/integrations/:provider/properties")
  public listProperties(
    @Req() request: AuthenticatedRequest,
    @Param("provider") provider: string
  ): Promise<unknown> {
    return this.integrations.listProperties(this.context(request), this.provider(provider));
  }

  @Put("tenants/:tenantId/integrations/:provider/properties")
  public selectProperties(
    @Req() request: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.integrations.selectProperties(
      this.context(request),
      this.provider(provider),
      propertySelectionSchema.parse(body)
    );
  }

  @Delete("tenants/:tenantId/integrations/:provider")
  @HttpCode(204)
  public disconnect(
    @Req() request: AuthenticatedRequest,
    @Param("provider") provider: string
  ): Promise<void> {
    if (request.authAal !== "aal2") {
      throw new DomainError(
        "GM-AUTH-MFA-REQUIRED",
        "Confirme o MFA para revogar uma conexão.",
        false
      );
    }
    return this.integrations.disconnect(this.context(request), this.provider(provider));
  }

  @Post("tenants/:tenantId/integrations/:provider/syncs")
  public requestSync(
    @Req() request: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<unknown> {
    return this.integrations.requestSync(
      this.context(request),
      this.provider(provider),
      this.idempotencyKey(idempotencyKey)
    );
  }

  @Get("tenants/:tenantId/syncs/:jobId")
  public getSync(
    @Req() request: AuthenticatedRequest,
    @Param("jobId") jobId: string
  ): Promise<unknown> {
    return this.integrations.getSync(this.context(request), jobId);
  }

  private provider(value: string): Provider {
    const parsed = providerSchema.safeParse(value);
    if (!parsed.success) {
      throw new DomainError("GM-INTEGRATION-PROVIDER", "Provedor desconhecido.", false);
    }
    return parsed.data;
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }

  private idempotencyKey(value: string | undefined): string {
    if (value === undefined || value.length < 8 || value.length > 160) {
      throw new DomainError("GM-IDEMPOTENCY-REQUIRED", "Envie um Idempotency-Key válido.", false);
    }
    return value;
  }
}
