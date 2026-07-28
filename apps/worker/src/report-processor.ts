import { createHash } from "node:crypto";
import type { AppConfig } from "@growth-manager/config";
import type { JobEnvelope } from "@growth-manager/contracts";
import { newId, type TenantContext } from "@growth-manager/domain";
import { and, eq, gte, lte, schema, sql, type Database } from "@growth-manager/database";
import { SupabaseRawArtifactStore } from "@growth-manager/integrations";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { JobResult } from "./job-processor.js";

export class ReportProcessor {
  private readonly artifacts: SupabaseRawArtifactStore;

  public constructor(config: AppConfig) {
    this.artifacts = new SupabaseRawArtifactStore({
      supabaseUrl: config.SUPABASE_URL,
      secretKey: config.SUPABASE_SECRET_KEY
    });
  }

  public async render(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const reportId = requiredString(job.payload.report_id, "report_id");
    const reportRows = await database
      .select()
      .from(schema.reports)
      .where(and(eq(schema.reports.id, reportId), eq(schema.reports.tenantId, context.tenantId)))
      .limit(1);
    const report = reportRows[0];
    if (report === undefined) throw new Error(`Report ${reportId} was not found`);

    const existing = await database
      .select()
      .from(schema.reportSnapshots)
      .where(
        and(
          eq(schema.reportSnapshots.reportId, reportId),
          eq(schema.reportSnapshots.version, report.currentVersion),
          eq(schema.reportSnapshots.tenantId, context.tenantId)
        )
      )
      .limit(1);
    const completeSnapshot = existing[0];
    if (completeSnapshot !== undefined && completeSnapshot.pdfObjectKey !== null) {
      return {
        status: "completed",
        cursor: null,
        details: {
          report_id: reportId,
          html_object_key: completeSnapshot.htmlObjectKey,
          duplicate: true
        }
      };
    }

    await database
      .update(schema.reports)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(schema.reports.id, reportId));

    const start = new Date(`${report.periodStart}T00:00:00.000Z`);
    const end = new Date(`${report.periodEnd}T23:59:59.999Z`);
    const [tenantRows, metrics, tasks, recommendations, alerts] = await Promise.all([
      database
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, context.tenantId))
        .limit(1),
      database
        .select()
        .from(schema.metricSnapshots)
        .where(
          and(
            eq(schema.metricSnapshots.tenantId, context.tenantId),
            gte(schema.metricSnapshots.periodStart, report.periodStart),
            lte(schema.metricSnapshots.periodEnd, report.periodEnd)
          )
        ),
      database
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.tenantId, context.tenantId),
            gte(schema.tasks.createdAt, start),
            lte(schema.tasks.createdAt, end)
          )
        ),
      database
        .select()
        .from(schema.recommendations)
        .where(
          and(
            eq(schema.recommendations.tenantId, context.tenantId),
            gte(schema.recommendations.createdAt, start),
            lte(schema.recommendations.createdAt, end)
          )
        ),
      database
        .select()
        .from(schema.alerts)
        .where(
          and(
            eq(schema.alerts.tenantId, context.tenantId),
            gte(schema.alerts.firstSeenAt, start),
            lte(schema.alerts.firstSeenAt, end)
          )
        )
    ]);
    const tenantName = tenantRows[0]?.name ?? "Cliente";
    const metricTotals = new Map<string, number>();
    for (const metric of metrics) {
      metricTotals.set(
        metric.metric,
        (metricTotals.get(metric.metric) ?? 0) + Number(metric.value)
      );
    }
    const data = {
      period: { start: report.periodStart, end: report.periodEnd },
      metrics: [...metricTotals.entries()].map(([metric, value]) => ({ metric, value })),
      tasks: {
        total: tasks.length,
        completed: tasks.filter((task) => task.status === "done").length
      },
      recommendations: {
        total: recommendations.length,
        accepted: recommendations.filter((item) => item.status === "accepted").length
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter((item) => item.severity === "critical").length
      }
    };
    const narrative = {
      headline: `${tenantName}: resultados de ${report.periodStart} a ${report.periodEnd}`,
      summary: buildSummary(
        data.tasks.completed,
        data.tasks.total,
        data.recommendations.accepted,
        data.recommendations.total
      )
    };
    const html = renderReportHtml(tenantName, data, narrative);
    const sha256 = createHash("sha256").update(html).digest("hex");
    const artifact = await this.artifacts.putText({
      tenantId: context.tenantId,
      category: "monthly",
      artifactId: `${reportId}-v${String(report.currentVersion)}`,
      value: html,
      bucket: "reports",
      contentType: "text/html"
    });
    const pdf = await renderReportPdf(tenantName, data, narrative);
    const pdfArtifact = await this.artifacts.putPdf({
      tenantId: context.tenantId,
      category: "monthly",
      artifactId: `${reportId}-v${String(report.currentVersion)}`,
      value: pdf,
      bucket: "reports",
      contentType: "application/pdf"
    });
    await this.persistSnapshot(database, context, {
      existingId: existing[0]?.id ?? null,
      reportId,
      version: report.currentVersion,
      data,
      narrative,
      htmlObjectKey: artifact.objectKey,
      pdfObjectKey: pdfArtifact.objectKey,
      sha256
    });
    await database
      .update(schema.reports)
      .set({ status: "draft", updatedAt: new Date(), version: sql`${schema.reports.version} + 1` })
      .where(eq(schema.reports.id, reportId));
    return {
      status: "completed",
      cursor: null,
      details: {
        report_id: reportId,
        html_object_key: artifact.objectKey,
        pdf_object_key: pdfArtifact.objectKey,
        html_sha256: sha256
      }
    };
  }

  private async persistSnapshot(
    database: Database,
    context: TenantContext,
    input: {
      readonly existingId: string | null;
      readonly reportId: string;
      readonly version: number;
      readonly data: Readonly<Record<string, unknown>>;
      readonly narrative: Readonly<Record<string, unknown>>;
      readonly htmlObjectKey: string;
      readonly pdfObjectKey: string;
      readonly sha256: string;
    }
  ): Promise<void> {
    if (input.existingId !== null) {
      await database
        .update(schema.reportSnapshots)
        .set({ pdfObjectKey: input.pdfObjectKey })
        .where(eq(schema.reportSnapshots.id, input.existingId));
      return;
    }
    await database.insert(schema.reportSnapshots).values({
      id: newId(),
      tenantId: context.tenantId,
      reportId: input.reportId,
      version: input.version,
      data: input.data,
      narrative: input.narrative,
      htmlObjectKey: input.htmlObjectKey,
      pdfObjectKey: input.pdfObjectKey,
      sha256: input.sha256,
      generatedAt: new Date()
    });
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${field}`);
  return value;
}

function buildSummary(
  completed: number,
  totalTasks: number,
  accepted: number,
  totalRecommendations: number
): string {
  return `${String(completed)} de ${String(totalTasks)} tarefas foram concluídas e ${String(accepted)} de ${String(totalRecommendations)} oportunidades foram aceitas no período.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderReportHtml(
  tenantName: string,
  data: {
    readonly period: { readonly start: string; readonly end: string };
    readonly metrics: readonly { readonly metric: string; readonly value: number }[];
    readonly tasks: { readonly total: number; readonly completed: number };
    readonly recommendations: { readonly total: number; readonly accepted: number };
    readonly alerts: { readonly total: number; readonly critical: number };
  },
  narrative: { readonly headline: string; readonly summary: string }
): string {
  const metrics =
    data.metrics.length === 0
      ? "<p>Nenhuma métrica sincronizada neste período.</p>"
      : `<table><thead><tr><th>Métrica</th><th>Valor</th></tr></thead><tbody>${data.metrics.map((item) => `<tr><td>${escapeHtml(item.metric)}</td><td>${item.value.toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(narrative.headline)}</title><style>body{font:16px system-ui;color:#15213b;max-width:960px;margin:0 auto;padding:48px}h1{font-size:36px}small{color:#65718a}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{border:1px solid #dce2ed;border-radius:16px;padding:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #dce2ed;padding:12px}@media(max-width:680px){.grid{grid-template-columns:1fr}}</style></head><body><small>Growth Manager · ${escapeHtml(tenantName)}</small><h1>${escapeHtml(narrative.headline)}</h1><p>${escapeHtml(narrative.summary)}</p><div class="grid"><div class="card"><strong>${String(data.tasks.completed)}/${String(data.tasks.total)}</strong><p>Tarefas concluídas</p></div><div class="card"><strong>${String(data.recommendations.accepted)}/${String(data.recommendations.total)}</strong><p>Oportunidades aceitas</p></div><div class="card"><strong>${String(data.alerts.critical)}</strong><p>Alertas críticos</p></div></div><h2>Métricas consolidadas</h2>${metrics}</body></html>`;
}

async function renderReportPdf(
  tenantName: string,
  data: {
    readonly period: { readonly start: string; readonly end: string };
    readonly metrics: readonly { readonly metric: string; readonly value: number }[];
    readonly tasks: { readonly total: number; readonly completed: number };
    readonly recommendations: { readonly total: number; readonly accepted: number };
    readonly alerts: { readonly total: number; readonly critical: number };
  },
  narrative: { readonly headline: string; readonly summary: string }
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595, 842]);
  let y = 790;
  const line = (value: string, size = 11, strong = false): void => {
    if (y < 60) {
      page = document.addPage([595, 842]);
      y = 790;
    }
    page.drawText(pdfSafe(value).slice(0, 100), {
      x: 48,
      y,
      size,
      font: strong ? bold : regular,
      color: rgb(0.08, 0.13, 0.23)
    });
    y -= size + 10;
  };
  line(`Growth Manager - ${tenantName}`, 10);
  line(narrative.headline, 20, true);
  y -= 4;
  for (const part of wrapText(narrative.summary, 88)) line(part, 11);
  y -= 12;
  line(`Tarefas concluidas: ${String(data.tasks.completed)}/${String(data.tasks.total)}`, 13, true);
  line(
    `Oportunidades aceitas: ${String(data.recommendations.accepted)}/${String(data.recommendations.total)}`,
    13,
    true
  );
  line(`Alertas criticos: ${String(data.alerts.critical)}`, 13, true);
  y -= 16;
  line("Metricas consolidadas", 16, true);
  if (data.metrics.length === 0) line("Nenhuma metrica sincronizada neste periodo.");
  for (const metric of data.metrics)
    line(`${metric.metric}: ${metric.value.toLocaleString("pt-BR")}`);
  return document.save();
}

function wrapText(value: string, width: number): readonly string[] {
  const words = value.split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length <= width) current = next;
    else {
      if (current.length > 0) lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function pdfSafe(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u2013\u2014]/gu, "-");
}
