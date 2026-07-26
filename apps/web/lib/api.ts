import "server-only";
import { z } from "zod";
import {
  approvalSchema,
  authorizeResponseSchema,
  connectionSummarySchema,
  currentSessionSchema,
  dashboardSchema,
  errorEnvelopeSchema,
  integrationPropertySchema,
  invitationAcceptResultSchema,
  invitationCreateResultSchema,
  recommendationSchema,
  sessionTenantSchema,
  syncJobSchema,
  taskSchema,
  teamMemberSchema,
  teamOverviewSchema,
  tenantSchema,
  type Approval,
  type AuthorizeResponse,
  type ConnectionSummary,
  type CurrentSession,
  type Dashboard,
  type IntegrationProperty,
  type InvitationAcceptResult,
  type InvitationCreate,
  type InvitationCreateResult,
  type MembershipUpdate,
  type Provider,
  type Recommendation,
  type SessionTenant,
  type SyncJob,
  type Task,
  type TeamMember,
  type TeamOverview,
  type Tenant,
  type TenantCreate,
  type TenantUpdate
} from "@growth-manager/contracts";
import { requireAccessToken } from "./auth";

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure;

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly tenantId?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

function failure(status: number, code: string, message: string): ApiFailure {
  return { ok: false, status, code, message };
}

async function readFailure(response: Response): Promise<ApiFailure> {
  try {
    const envelope = errorEnvelopeSchema.safeParse(await response.json());
    if (envelope.success) {
      return failure(response.status, envelope.data.error.code, envelope.data.error.message);
    }
  } catch {
    // A non-JSON body is itself the diagnostic; fall through to the generic map.
  }
  if (response.status === 401) {
    return failure(401, "GM-WEB-UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
  }
  if (response.status === 403) {
    return failure(403, "GM-WEB-FORBIDDEN", "Você não tem acesso a este cliente.");
  }
  return failure(
    response.status,
    "GM-WEB-API-ERROR",
    `A API respondeu ${String(response.status)}.`
  );
}

async function buildHeaders(options: RequestOptions): Promise<Record<string, string>> {
  const accessToken = await requireAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "x-request-id": crypto.randomUUID(),
    Accept: "application/json"
  };
  if (options.tenantId !== undefined) headers["x-tenant-id"] = options.tenantId;
  if (options.idempotencyKey !== undefined) headers["idempotency-key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return headers;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined || baseUrl.length === 0) {
    return failure(0, "GM-WEB-API-URL", "A variável API_BASE_URL não está configurada.");
  }

  const headers = await buildHeaders(options);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: "no-store"
    });
  } catch {
    return failure(
      0,
      "GM-WEB-API-UNREACHABLE",
      "Não foi possível falar com a API. Verifique se ela está no ar."
    );
  }

  if (!response.ok) return readFailure(response);
  return readBody(response, schema);
}

async function readBody<T>(response: Response, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  // A 204 carries no body, so there is nothing to parse against the schema.
  if (response.status === 204) return { ok: true, data: undefined as T };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failure(response.status, "GM-WEB-CONTRACT", "A API respondeu um corpo inválido.");
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return failure(
      response.status,
      "GM-WEB-CONTRACT",
      "A resposta da API não corresponde ao contrato esperado."
    );
  }
  return { ok: true, data: parsed.data };
}

export function getCurrentSession(): Promise<ApiResult<CurrentSession>> {
  return request("/v1/me", currentSessionSchema);
}

// Session-scoped routes deliberately omit tenantId so no x-tenant-id header is
// sent: a client being created does not exist yet, and the API would reject a
// tenant the caller cannot reach.
export function listTenants(): Promise<ApiResult<readonly SessionTenant[]>> {
  return request("/v1/tenants", z.array(sessionTenantSchema));
}

export function createTenant(
  idempotencyKey: string,
  input: TenantCreate
): Promise<ApiResult<Tenant>> {
  return request("/v1/tenants", tenantSchema, {
    method: "POST",
    idempotencyKey,
    body: input
  });
}

export function updateTenant(
  tenantId: string,
  input: TenantUpdate
): Promise<ApiResult<Tenant>> {
  return request(`/v1/tenants/${tenantId}`, tenantSchema, {
    method: "PATCH",
    tenantId,
    body: input
  });
}

export function getTeam(tenantId: string): Promise<ApiResult<TeamOverview>> {
  return request(`/v1/tenants/${tenantId}/team`, teamOverviewSchema, { tenantId });
}

export function createInvitation(
  tenantId: string,
  idempotencyKey: string,
  input: InvitationCreate
): Promise<ApiResult<InvitationCreateResult>> {
  return request(`/v1/tenants/${tenantId}/invitations`, invitationCreateResultSchema, {
    method: "POST",
    tenantId,
    idempotencyKey,
    body: input
  });
}

export function revokeInvitation(
  tenantId: string,
  invitationId: string
): Promise<ApiResult<undefined>> {
  return request(`/v1/tenants/${tenantId}/invitations/${invitationId}`, z.undefined(), {
    method: "DELETE",
    tenantId
  });
}

export function updateMembership(
  tenantId: string,
  membershipId: string,
  input: MembershipUpdate
): Promise<ApiResult<TeamMember>> {
  return request(`/v1/tenants/${tenantId}/memberships/${membershipId}`, teamMemberSchema, {
    method: "PATCH",
    tenantId,
    body: input
  });
}

export function acceptInvitation(token: string): Promise<ApiResult<InvitationAcceptResult>> {
  return request("/v1/invitations/accept", invitationAcceptResultSchema, {
    method: "POST",
    body: { token }
  });
}

export function getDashboard(tenantId: string): Promise<ApiResult<Dashboard>> {
  return request(`/v1/tenants/${tenantId}/dashboard`, dashboardSchema, { tenantId });
}

export function listRecommendations(
  tenantId: string
): Promise<ApiResult<readonly Recommendation[]>> {
  return request(`/v1/tenants/${tenantId}/recommendations`, z.array(recommendationSchema), {
    tenantId
  });
}

export function listTasks(tenantId: string): Promise<ApiResult<readonly Task[]>> {
  return request(`/v1/tenants/${tenantId}/tasks`, z.array(taskSchema), { tenantId });
}

export function listApprovals(tenantId: string): Promise<ApiResult<readonly Approval[]>> {
  return request(`/v1/tenants/${tenantId}/approvals`, z.array(approvalSchema), { tenantId });
}

export function createTask(
  tenantId: string,
  idempotencyKey: string,
  input: {
    readonly title: string;
    readonly description: string;
    readonly priority: Task["priority"];
    readonly recommendation_id: string | null;
    readonly assignee_id: string | null;
    readonly due_at: string | null;
  }
): Promise<ApiResult<unknown>> {
  return request(`/v1/tenants/${tenantId}/tasks`, z.unknown(), {
    method: "POST",
    tenantId,
    idempotencyKey,
    body: input
  });
}

export function updateTask(
  tenantId: string,
  taskId: string,
  idempotencyKey: string,
  input: { readonly version: number; readonly status?: Task["status"] }
): Promise<ApiResult<unknown>> {
  return request(`/v1/tenants/${tenantId}/tasks/${taskId}`, z.unknown(), {
    method: "PATCH",
    tenantId,
    idempotencyKey,
    body: input
  });
}

export function listConnections(
  tenantId: string
): Promise<ApiResult<readonly ConnectionSummary[]>> {
  return request(`/v1/tenants/${tenantId}/integrations`, z.array(connectionSummarySchema), {
    tenantId
  });
}

export function authorizeConnection(
  tenantId: string,
  provider: Provider,
  redirectPath: string
): Promise<ApiResult<AuthorizeResponse>> {
  return request(
    `/v1/tenants/${tenantId}/integrations/${provider}/authorize`,
    authorizeResponseSchema,
    { method: "POST", tenantId, body: { redirect_path: redirectPath } }
  );
}

export function listConnectionProperties(
  tenantId: string,
  provider: Provider
): Promise<ApiResult<readonly IntegrationProperty[]>> {
  return request(
    `/v1/tenants/${tenantId}/integrations/${provider}/properties`,
    z.array(integrationPropertySchema),
    { tenantId }
  );
}

export function selectConnectionProperties(
  tenantId: string,
  provider: Provider,
  propertyIds: readonly string[]
): Promise<ApiResult<readonly IntegrationProperty[]>> {
  return request(
    `/v1/tenants/${tenantId}/integrations/${provider}/properties`,
    z.array(integrationPropertySchema),
    { method: "PUT", tenantId, body: { property_ids: propertyIds } }
  );
}

export function disconnectConnection(
  tenantId: string,
  provider: Provider
): Promise<ApiResult<undefined>> {
  return request(`/v1/tenants/${tenantId}/integrations/${provider}`, z.undefined(), {
    method: "DELETE",
    tenantId
  });
}

export function requestConnectionSync(
  tenantId: string,
  provider: Provider,
  idempotencyKey: string
): Promise<ApiResult<SyncJob>> {
  return request(`/v1/tenants/${tenantId}/integrations/${provider}/syncs`, syncJobSchema, {
    method: "POST",
    tenantId,
    idempotencyKey
  });
}

export function decideRecommendation(
  tenantId: string,
  recommendationId: string,
  idempotencyKey: string,
  input: {
    readonly decision: "accepted" | "dismissed";
    readonly reason?: string;
    readonly create_task?: boolean;
  }
): Promise<ApiResult<unknown>> {
  return request(
    `/v1/tenants/${tenantId}/recommendations/${recommendationId}/decision`,
    z.unknown(),
    { method: "POST", tenantId, idempotencyKey, body: input }
  );
}
