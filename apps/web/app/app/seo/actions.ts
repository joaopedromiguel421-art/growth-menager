"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSeoTarget, startSeoAnalysis, updateSeoFindingStatus } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";

async function activeTenantId(): Promise<string | null> {
  const result = await loadWorkspace();
  return result.ok ? (result.workspace.activeTenant?.id ?? null) : null;
}

export async function createSeoTargetAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const rawUrl = formData.get("url");
  if (tenantId === null || typeof rawUrl !== "string" || rawUrl.trim().length === 0) return;
  const result = await createSeoTarget(tenantId, {
    location_id: null,
    url: rawUrl.trim(),
    scope: "origin",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    crawl_policy: {
      max_pages: 100,
      max_redirects: 3,
      timeout_ms: 30_000,
      concurrency: 5,
      delay_ms: 1_000,
      respect_robots: true
    }
  });
  if (!result.ok) redirect(`/app/seo?error=${encodeURIComponent(result.message)}`);
  revalidatePath("/app/seo");
  redirect(`/app/seo?target=${result.data.id}`);
}

export async function runSeoAnalysisAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const targetId = formData.get("target_id");
  if (tenantId === null || typeof targetId !== "string") return;
  const result = await startSeoAnalysis(tenantId, crypto.randomUUID(), {
    target_id: targetId,
    mode: "on_demand"
  });
  if (!result.ok)
    redirect(`/app/seo?target=${targetId}&error=${encodeURIComponent(result.message)}`);
  revalidatePath("/app/seo");
  redirect(`/app/seo?target=${targetId}&run=${result.data.id}`);
}

export async function manageSeoFindingAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const input = readFindingAction(formData);
  if (tenantId === null || input === null) return;
  const result = await updateSeoFindingStatus(tenantId, input.findingId, {
    version: input.version,
    status: input.status,
    reason: null,
    dismiss_until: null
  });
  const targetQuery = input.targetId === null ? "" : `target=${input.targetId}`;
  if (!result.ok) {
    redirect(`/app/seo?${targetQuery}&error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/app/seo");
  revalidatePath("/app/tasks");
}

function readFindingAction(formData: FormData): {
  readonly findingId: string;
  readonly targetId: string | null;
  readonly version: number;
  readonly status: "acknowledged" | "accepted" | "in_progress";
} | null {
  const findingId = formData.get("finding_id");
  const targetId = formData.get("target_id");
  const rawVersion = formData.get("version");
  const status = formData.get("status");
  if (typeof findingId !== "string" || typeof rawVersion !== "string") return null;
  if (status !== "acknowledged" && status !== "accepted" && status !== "in_progress") return null;
  const version = Number.parseInt(rawVersion, 10);
  if (!Number.isInteger(version) || version < 1) return null;
  return { findingId, targetId: typeof targetId === "string" ? targetId : null, version, status };
}
