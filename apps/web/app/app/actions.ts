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
  createContent,
  createInvitation,
  createPublication,
  createReport,
  createReportDelivery,
  createTask,
  createTenant,
  decideApproval,
  decideRecommendation,
  disconnectConnection,
  refreshConnectionProperties,
  requestConnectionSync,
  revokeInvitation,
  selectConnectionProperties,
  submitContent,
  submitReport,
  updateAlert,
  updateContent,
  updateMembership,
  updatePublication,
  upsertBrandKit,
  upsertBudget,
  updateTask,
  updateTenant
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

export async function refreshPropertiesAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const provider = readProvider(formData);
  if (tenantId === null || provider === null) return;

  const result = await refreshConnectionProperties(tenantId, provider);
  if (!result.ok) {
    redirect(`/app/connections?error=${encodeURIComponent(result.message)}`);
  }
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

export async function editClientAction(formData: FormData): Promise<void> {
  const tenantId = text(formData, "tenant_id");
  const version = positiveInteger(formData, "version");
  if (tenantId.length === 0 || version === null) return;
  const statusValue = text(formData, "status");
  const status = ["onboarding", "active", "suspended", "closing"].includes(statusValue)
    ? (statusValue as "onboarding" | "active" | "suspended" | "closing")
    : "active";
  await updateTenant(tenantId, {
    version,
    name: text(formData, "name"),
    legal_name: optional(formData, "legal_name"),
    industry: optional(formData, "industry"),
    timezone: text(formData, "timezone"),
    status
  });
  revalidatePath("/app");
  revalidatePath("/app/clients");
}

export async function editTaskAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const taskId = text(formData, "task_id");
  const version = positiveInteger(formData, "version");
  if (tenantId === null || taskId.length === 0 || version === null) return;
  const statusValue = text(formData, "status");
  const status = ["backlog", "todo", "in_progress", "blocked", "done", "cancelled"].includes(
    statusValue
  )
    ? (statusValue as Task["status"])
    : "backlog";
  await updateTask(tenantId, taskId, crypto.randomUUID(), {
    version,
    title: text(formData, "title"),
    description: optional(formData, "description"),
    status,
    priority: readPriority(formData),
    assignee_id: optional(formData, "assignee_id"),
    due_at: readDueAt(formData)
  });
  revalidatePath("/app");
  revalidatePath("/app/tasks");
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const membershipId = formData.get("membership_id");
  const role = invitableRoleSchema.safeParse(formData.get("role"));
  if (tenantId === null || typeof membershipId !== "string" || !role.success) return;
  await updateMembership(tenantId, membershipId, { role: role.data });
  revalidatePath("/app/settings/team");
}

function positiveInteger(formData: FormData, field: string): number | null {
  const value = Number.parseInt(text(formData, field), 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function createContentAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const title = text(formData, "title");
  const body = text(formData, "body");
  if (title.length === 0 || body.length === 0) return { error: "Informe título e texto." };
  const channelValue = text(formData, "channel");
  const channel = [
    "instagram",
    "facebook",
    "google_business",
    "linkedin",
    "blog",
    "email"
  ].includes(channelValue)
    ? (channelValue as "instagram" | "facebook" | "google_business" | "linkedin" | "blog" | "email")
    : "google_business";
  const typeValue = text(formData, "type");
  const type = ["post", "story", "article", "email", "update"].includes(typeValue)
    ? (typeValue as "post" | "story" | "article" | "email" | "update")
    : "post";
  const result = await createContent(tenantId, crypto.randomUUID(), {
    channel,
    type,
    title,
    body,
    timezone: "America/Sao_Paulo",
    owner_id: null,
    brand_kit_id: null,
    campaign: optional(formData, "campaign")
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/content");
  return { error: null };
}

export async function setContentStatusAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const contentId = text(formData, "content_id");
  const version = positiveInteger(formData, "version");
  const statusValue = text(formData, "status");
  const allowed = ["draft", "review", "cancelled"] as const;
  const status = allowed.find((candidate) => candidate === statusValue);
  if (tenantId === null || contentId.length === 0 || version === null || status === undefined)
    return;
  await updateContent(tenantId, contentId, crypto.randomUUID(), { version, status });
  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
}

export async function submitContentAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const contentId = text(formData, "content_id");
  if (tenantId === null || contentId.length === 0) return;
  await submitContent(tenantId, contentId, crypto.randomUUID());
  revalidatePath("/app/content");
  revalidatePath("/app/approvals");
}

export async function schedulePublicationAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const contentItemId = text(formData, "content_item_id");
  const propertyId = text(formData, "property_id");
  const scheduledValue = text(formData, "scheduled_at");
  if (contentItemId.length === 0 || propertyId.length === 0 || scheduledValue.length === 0) {
    return { error: "Escolha o conteúdo, a propriedade e a data." };
  }
  const scheduledAt = new Date(scheduledValue);
  if (Number.isNaN(scheduledAt.getTime())) return { error: "Informe uma data válida." };
  const result = await createPublication(tenantId, crypto.randomUUID(), {
    content_item_id: contentItemId,
    provider: "google_business",
    property_id: propertyId,
    scheduled_at: scheduledAt.toISOString()
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/calendar");
  revalidatePath("/app/content");
  return { error: null };
}

export async function cancelPublicationAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const publicationId = text(formData, "publication_id");
  const version = positiveInteger(formData, "version");
  if (tenantId === null || publicationId.length === 0 || version === null) return;
  await updatePublication(tenantId, publicationId, crypto.randomUUID(), {
    version,
    status: "cancelled"
  });
  revalidatePath("/app/calendar");
}

export async function updateAlertAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const alertId = text(formData, "alert_id");
  const version = positiveInteger(formData, "version");
  const status = text(formData, "status") === "resolved" ? "resolved" : "acknowledged";
  if (tenantId === null || alertId.length === 0 || version === null) return;
  await updateAlert(tenantId, alertId, crypto.randomUUID(), { version, status });
  revalidatePath("/app/alerts");
  revalidatePath("/app");
}

export async function createReportAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  const result = await createReport(tenantId, crypto.randomUUID(), {
    period_start: periodStart,
    period_end: periodEnd
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/reports");
  return { error: null };
}

export async function submitReportAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const reportId = text(formData, "report_id");
  if (tenantId === null || reportId.length === 0) return;
  await submitReport(tenantId, reportId, crypto.randomUUID());
  revalidatePath("/app/reports");
  revalidatePath("/app/approvals");
}

export async function deliverReportAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const reportId = text(formData, "report_id");
  const email = text(formData, "email");
  if (reportId.length === 0 || email.length === 0) return { error: "Informe o destinatário." };
  const result = await createReportDelivery(tenantId, reportId, crypto.randomUUID(), {
    email,
    name: optional(formData, "name")
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/reports");
  return { error: null };
}

export async function saveBudgetAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const softLimit = Number(text(formData, "soft_limit"));
  const hardLimit = Number(text(formData, "hard_limit"));
  if (!Number.isFinite(softLimit) || !Number.isFinite(hardLimit))
    return { error: "Informe limites válidos." };
  const result = await upsertBudget(tenantId, crypto.randomUUID(), {
    provider: text(formData, "provider"),
    soft_limit: softLimit,
    hard_limit: hardLimit,
    currency: "BRL",
    essential_override: formData.get("essential_override") === "on",
    effective_from: text(formData, "effective_from")
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/costs");
  return { error: null };
}

export async function saveBrandKitAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tenantId = await activeTenantId();
  if (tenantId === null) return { error: "Nenhum cliente ativo na sua sessão." };
  const version = positiveInteger(formData, "version") ?? undefined;
  const splitLines = (field: string): string[] =>
    text(formData, field)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const result = await upsertBrandKit(tenantId, crypto.randomUUID(), {
    ...(version === undefined ? {} : { version }),
    name: text(formData, "name"),
    voice: text(formData, "voice"),
    audiences: splitLines("audiences"),
    allowed_claims: splitLines("allowed_claims"),
    forbidden_claims: splitLines("forbidden_claims"),
    visual_tokens: {
      primary_color: text(formData, "primary_color"),
      secondary_color: text(formData, "secondary_color")
    }
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/app/settings/brand");
  return { error: null };
}
