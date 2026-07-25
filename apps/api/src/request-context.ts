import type { TenantContext } from "@growth-manager/domain";

export interface AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly method: string;
  readonly url: string;
  readonly rawBody?: Buffer;
  tenantContext?: TenantContext;
  authSubject?: string;
  authAal?: "aal1" | "aal2";
}
