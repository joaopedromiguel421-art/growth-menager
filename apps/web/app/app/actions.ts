"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { providerSchema, type Provider, type Task } from "@growth-manager/contracts";
import {
  authorizeConnection,
  createTask,
  decideRecommendation,
  disconnectConnection,
  requestConnectionSync,
  selectConnectionProperties,
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

export async function switchTenantAction(formData: FormData): Promise<void> {
  const tenantId = formData.get("tenant_id");
  if (typeof tenantId !== "string" || tenantId.length === 0) return;

  const result = await loadWorkspace();
  if (!result.ok) return;
  // Never trust the submitted id: it must be one the session already grants.
  if (!result.workspace.session.tenants.some((tenant) => tenant.id === tenantId)) return;

  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 180 * 24 * 60 * 60
  });
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
