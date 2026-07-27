"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  invitableRoleSchema,
  providerSchema,
  type Provider,
  type Task
} from "@growth-manager/contracts";
import {
  authorizeConnection,
  createInvitation,
  createTask,
  createTenant,
  decideApproval,
  decideRecommendation,
  disconnectConnection,
  requestConnectionSync,
  revokeInvitation,
  selectConnectionProperties,
  updateMembership,
  updateTask
} from "../../lib/api";
import { signOut } from "../../lib/auth";
import { ACTIVE_TENANT_COOKIE, loadWorkspace } from "../../lib/session";

export interface ActionState {
  readonly error: string | null;
}

async function activeTenantId(): Promise<string | null> {
  const result = await loadWorkspace();
  if (!result.ok) return null;
  return result.workspace.activeTenant?.id ?? null;
}

const ACTIVE_TENANT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 180 * 24 * 60 * 60
} as const;

export async function switchTenantAction(formData: FormData): Promise<void> {
  const tenantId = formData.get("tenant_id");
  if (typeof tenantId !== "string" || tenantId.length === 0) return;

  const result = await loadWorkspace();
  if (!result.ok) return;
  // Never trust the submitted id: it must be one the session already grants.
  if (!result.workspace.session.tenants.some((tenant) => tenant.id === tenantId)) return;

  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, ACTIVE_TENANT_COOKIE_OPTIONS);
  revalidatePath("/app");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);
  redirect("/login");
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function readPriority(formData: FormData): Task["priority"] {
  const value = formData.get("priority");
  if (value === "low" || value === "high" || value === "urgent") return value;
  return "medium";
}

function readDueAt(formData: FormData): string | null {
  const value = text(formData, "due_at");
  if (value.length === 0) return null;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function optional(formData: FormData, field: string): string | null {
  const value = text(formData, field);
  return value.length === 0 ? null : value;
}

/**
 * Creating a client is the entry point of the whole product, so it does more
 * than insert a row: it makes the new client active and sends the operator to
 * the connections screen. A client with no source connected has nothing to show,
 * and leaving them on an empty dashboard is what made the app look broken.
 */
export async function createClientAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = text(formData, "name");
  if (name.length === 0) return { error: "Informe o nome do cliente." };

  const organizationId = text(formData, "organization_id");
  const isNewOrganization = organizationId === "" || organizationId === "new";

  const result = await createTenant(crypto.randomUUID(), {
    name,
    legal_name: optional(formData, "legal_name"),
    industry: optional(formData, "industry"),
    country_code: "BR",
    timezone: text(formData, "timezone") || "America/Sao_Paulo",
    locale: "pt-BR",
    organization_id: isNewOrganization ? null : organizationId,
    ...(isNewOrganization
      ? {
          organization_name: text(formData, "organization_name"),
          billing_email: text(formData, "billing_email")
        }
      : {})
  });
  if (!result.ok) return { error: result.message };

  (await cookies()).set(ACTIVE_TENANT_COOKIE, result.data.id, ACTIVE_TENANT_COOKIE_OPTIONS);
  revalidatePath("/app");
  revalidatePath("/app/clients");
  redirect("/app/connections?novo=1");
}

export async function inviteMemberAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };

  const email = text(formData, "email");
  if (email.length === 0) return { error: "Informe o e-mail de quem você quer convidar." };

  const roleValue = formData.get("role");
  const role = invitableRoleSchema.safeParse(roleValue);
  if (!role.success) return { error: "Escolha um papel válido." };

  const scope = formData.get("scope") === "organization" ? "organization" : "tenant";

  const result = await createInvitation(tenantId, crypto.randomUUID(), {
    email,
    role: role.data,
    scope,
    expires_in_days: 7
  });
  if (!result.ok) return { error: result.message };

  revalidatePath("/app/settings/team");
  // A provider outage must not hide the invitation: surface the link to copy.
  if (!result.data.email_sent) {
    return {
      error: `Convite criado, mas o e-mail não pôde ser enviado. Envie este link manualmente: ${result.data.accept_url}`
    };
  }
  return { error: null };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const invitationId = formData.get("invitation_id");
  if (tenantId === null || typeof invitationId !== "string") return;

  await revokeInvitation(tenantId, invitationId);
  revalidatePath("/app/settings/team");
}

export async function revokeMemberAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const membershipId = formData.get("membership_id");
  if (tenantId === null || typeof membershipId !== "string") return;

  await updateMembership(tenantId, membershipId, { status: "revoked" });
  revalidatePath("/app/settings/team");
}

export async function createTaskAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };

  const title = text(formData, "title");
  if (title.length === 0) return { error: "Informe um título para a tarefa." };

  const result = await createTask(tenantId, crypto.randomUUID(), {
    title,
    description: text(formData, "description"),
    priority: readPriority(formData),
    recommendation_id: null,
    assignee_id: null,
    due_at: readDueAt(formData)
  });
  if (!result.ok) return { error: result.message };

  revalidatePath("/app");
  revalidatePath("/app/tasks");
  return { error: null };
}

export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return;

  const taskId = formData.get("task_id");
  const versionValue = formData.get("version");
  const statusValue = formData.get("status");
  if (typeof taskId !== "string" || typeof versionValue !== "string") return;

  const version = Number.parseInt(versionValue, 10);
  if (!Number.isInteger(version) || version < 1) return;

  const allowed: readonly Task["status"][] = [
    "backlog",
    "todo",
    "in_progress",
    "blocked",
    "done",
    "cancelled"
  ];
  const status = allowed.find((candidate) => candidate === statusValue);
  if (status === undefined) return;

  await updateTask(tenantId, taskId, crypto.randomUUID(), { version, status });
  revalidatePath("/app");
  revalidatePath("/app/tasks");
}

function readProvider(formData: FormData): Provider | null {
  const parsed = providerSchema.safeParse(formData.get("provider"));
  return parsed.success ? parsed.data : null;
}

/**
 * Starting OAuth has to happen server side because only the server holds the
 * access token, and the browser then follows the provider's consent URL.
 */
export async function connectProviderAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const provider = readProvider(formData);
  if (tenantId === null || provider === null) return;

  const result = await authorizeConnection(tenantId, provider, "/app/connections");
  if (!result.ok) {
    redirect(`/app/connections?error=${encodeURIComponent(result.message)}`);
  }
  // The consent URL is external, which typed routes cannot describe.
  redirect(result.data.authorization_url as Parameters<typeof redirect>[0]);
}

export async function disconnectProviderAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const provider = readProvider(formData);
  if (tenantId === null || provider === null) return;

  const result = await disconnectConnection(tenantId, provider);
  if (!result.ok) {
    redirect(`/app/connections?error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/app");
  revalidatePath("/app/connections");
}

export async function syncProviderAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const provider = readProvider(formData);
  if (tenantId === null || provider === null) return;

  const result = await requestConnectionSync(tenantId, provider, crypto.randomUUID());
  if (!result.ok) {
    redirect(`/app/connections?error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/app/connections");
}

export async function selectPropertiesAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const provider = readProvider(formData);
  if (tenantId === null || provider === null) return;

  const propertyIds = formData
    .getAll("property_id")
    .filter((value): value is string => typeof value === "string");

  const result = await selectConnectionProperties(tenantId, provider, propertyIds);
  if (!result.ok) {
    redirect(`/app/connections?error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/app");
  revalidatePath("/app/connections");
}

export async function decideRecommendationAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return;

  const recommendationId = formData.get("recommendation_id");
  const decisionValue = formData.get("decision");
  if (typeof recommendationId !== "string") return;
  if (decisionValue !== "accepted" && decisionValue !== "dismissed") return;

  await decideRecommendation(tenantId, recommendationId, crypto.randomUUID(), {
    decision: decisionValue,
    create_task: decisionValue === "accepted"
  });
  revalidatePath("/app");
  revalidatePath("/app/opportunities");
  revalidatePath("/app/tasks");
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return;

  const approvalId = formData.get("approval_id");
  const subjectVersionValue = formData.get("subject_version");
  const decisionValue = formData.get("decision");
  if (typeof approvalId !== "string" || typeof subjectVersionValue !== "string") return;
  if (decisionValue !== "approved" && decisionValue !== "rejected") return;

  const subjectVersion = Number.parseInt(subjectVersionValue, 10);
  if (!Number.isInteger(subjectVersion) || subjectVersion < 1) return;

  await decideApproval(tenantId, approvalId, crypto.randomUUID(), {
    decision: decisionValue,
    subject_version: subjectVersion
  });
  revalidatePath("/app/approvals");
  revalidatePath("/app/reviews");
}
