import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { parseConfig } from "@growth-manager/config";
import { AuthorizationService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import type { AuthenticatedRequest } from "./request-context.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly config = parseConfig(process.env);
  private readonly jwks = createRemoteJWKSet(
    new URL(`${this.config.SUPABASE_JWT_ISSUER}/.well-known/jwks.json`)
  );

  public constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService
  ) {}

  public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      executionContext.getHandler(),
      executionContext.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers.authorization);
    const tenantId = this.tenantId(request);
    const requestId = this.header(request, "x-request-id") ?? crypto.randomUUID();
    const traceId = this.header(request, "traceparent") ?? requestId;

    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.config.SUPABASE_JWT_ISSUER,
        audience: "authenticated"
      });
      const subject = verified.payload.sub;
      if (subject === undefined) {
        throw new UnauthorizedException();
      }

      request.authSubject = subject;
      request.authAal = verified.payload.aal === "aal2" ? "aal2" : "aal1";
      request.tenantContext = await this.authorization.resolveContext({
        authUserId: subject,
        tenantId,
        requestId,
        traceId
      });
      return true;
    } catch {
      throw new UnauthorizedException("Sessão inválida ou expirada.");
    }
  }

  private bearerToken(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token ausente.");
    }
    return value.slice(7);
  }

  private tenantId(request: AuthenticatedRequest): string {
    const value = request.params.tenantId ?? this.header(request, "x-tenant-id");
    if (value === undefined) {
      throw new UnauthorizedException("Contexto de tenant ausente.");
    }
    return value;
  }

  private header(request: AuthenticatedRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
