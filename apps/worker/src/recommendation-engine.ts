import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@growth-manager/database";
import {
  freshnessScore,
  newId,
  PRIORITY_FORMULA_VERSION,
  priorityScore,
  recommendationConfidence,
  type TenantContext
} from "@growth-manager/domain";

/**
 * Turns synced metrics into prioritised recommendations.
 *
 * Every rule here is deterministic and reads only from app.metric_snapshots: the
 * facts behind a priority must be reproducible from stored data, never generated
 * text. Each recommendation carries the evidence rows it was derived from, so a
 * number on screen can always be traced back to the provider response.
 */

const WINDOW_DAYS = 7;
const MIN_IMPRESSIONS = 100;

export interface EngineOutcome {
  readonly created: number;
  readonly updated: number;
  readonly alerts: number;
}

interface WindowRow extends Record<string, unknown> {
  readonly dimension_hash: string;
  readonly dimensions: Record<string, unknown>;
  readonly metric: string;
  readonly current_value: string | null;
  readonly previous_value: string | null;
  readonly observed_at: Date | string;
}

interface Facts {
  readonly rule: string;
  readonly window_days: number;
  readonly metric: string;
  readonly scope: Record<string, unknown>;
  readonly current: number;
  readonly previous: number;
  readonly delta_pct: number | null;
  readonly support: Record<string, number>;
  /** Search Console breakdowns return top rows only, never the full set. */
  readonly coverage: "complete" | "top_rows";
}

interface Candidate {
  readonly rule: string;
  readonly dedupeKey: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly risk: string;
  readonly impact: number;
  readonly urgency: number;
  readonly alignment: number;
  readonly effort: number;
  readonly claim: string;
  readonly facts: Facts;
  readonly observedAt: Date;
}

export async function generateRecommendations(input: {
  readonly database: Database;
  readonly context: TenantContext;
  readonly provider: "google_business" | "search_console";
  readonly now?: Date;
}): Promise<EngineOutcome> {
  const now = input.now ?? new Date();
  const rows = await readWindows(input.database, input.context, input.provider, now);
  if (rows.length === 0) return { created: 0, updated: 0, alerts: 0 };

  const byScope = groupByScope(rows);
  const candidates =
    input.provider === "search_console"
      ? searchCandidates(byScope, now)
      : businessCandidates(byScope, now);

  let created = 0;
  let updated = 0;
  for (const candidate of candidates) {
    const wasCreated = await persist(input.database, input.context, candidate, input.provider, now);
    if (wasCreated) created += 1;
    else updated += 1;
  }

  return { created, updated, alerts: 0 };
}

/**
 * One pass over the trailing fortnight, splitting each metric into the last
 * seven days and the seven before them. Comparing the two is what turns a raw
 * number into a movement worth acting on.
 */
async function readWindows(
  database: Database,
  context: TenantContext,
  provider: string,
  now: Date
): Promise<readonly WindowRow[]> {
  const currentStart = isoDate(addDays(now, -WINDOW_DAYS));
  const previousStart = isoDate(addDays(now, -2 * WINDOW_DAYS));

  return database.execute<WindowRow>(sql`
    select dimension_hash,
           max(dimensions::text)::jsonb as dimensions,
           metric,
           sum(value) filter (where period_start >= ${currentStart}::date)::text as current_value,
           sum(value) filter (
             where period_start >= ${previousStart}::date and period_start < ${currentStart}::date
           )::text as previous_value,
           max(observed_at) as observed_at
    from app.metric_snapshots
    where tenant_id = ${context.tenantId}
      and source = ${provider}
      and period_start >= ${previousStart}::date
    group by dimension_hash, metric
  `);
}

function groupByScope(rows: readonly WindowRow[]): Map<string, Map<string, WindowRow>> {
  const scopes = new Map<string, Map<string, WindowRow>>();
  for (const row of rows) {
    const existing = scopes.get(row.dimension_hash) ?? new Map<string, WindowRow>();
    existing.set(row.metric, row);
    scopes.set(row.dimension_hash, existing);
  }
  return scopes;
}

/**
 * Expected click-through rate by average position. Rates well below the band for
 * a page's own position point at a title or description problem rather than a
 * ranking problem, which is a cheaper and faster fix.
 */
function expectedCtr(position: number): number {
  if (position < 4) return 0.15;
  if (position < 6) return 0.08;
  if (position < 8) return 0.05;
  return 0.03;
}

/** Everything the search rules read, resolved once per scope. */
interface SearchScope {
  readonly dimensionHash: string;
  readonly scope: Record<string, unknown>;
  readonly query: string | null;
  readonly page: string | null;
  readonly coverage: Facts["coverage"];
  readonly observedAt: Date;
  readonly impressions: number;
  readonly clicks: number;
  readonly previousClicks: number;
  readonly position: number;
  readonly ctr: number;
}

function searchScope(
  dimensionHash: string,
  metrics: Map<string, WindowRow>,
  now: Date
): SearchScope {
  const scope = scopeOf(metrics);
  const query = typeof scope.query === "string" ? scope.query : null;
  const impressions = current(metrics, "SEARCH_IMPRESSIONS");
  const clicks = current(metrics, "SEARCH_CLICKS");
  const positionRow = metrics.get("SEARCH_POSITION");

  return {
    dimensionHash,
    scope,
    query,
    page: typeof scope.page === "string" ? scope.page : null,
    // Aggregated rows have no query dimension; a per-query row is the top-rows
    // slice Search Console returns.
    coverage: query === null ? "complete" : "top_rows",
    observedAt: latestObservation(metrics, now),
    impressions,
    clicks,
    previousClicks: previous(metrics, "SEARCH_CLICKS"),
    // Position is an average, so the summed window has to be divided back down.
    position: positionRow === undefined ? 0 : Number(positionRow.current_value ?? 0) / WINDOW_DAYS,
    ctr: impressions === 0 ? 0 : clicks / impressions
  };
}

function searchCandidates(
  scopes: Map<string, Map<string, WindowRow>>,
  now: Date
): readonly Candidate[] {
  const candidates: Candidate[] = [];

  for (const [dimensionHash, metrics] of scopes) {
    const view = searchScope(dimensionHash, metrics, now);
    // Below this volume a percentage swing is noise, not a signal.
    if (view.impressions < MIN_IMPRESSIONS) continue;

    const ctrGap = ctrGapCandidate(view);
    if (ctrGap !== null) candidates.push(ctrGap);

    const drop = trafficDropCandidate(view);
    if (drop !== null) candidates.push(drop);
  }

  return candidates;
}

/**
 * Ranking on page one but under-clicked: the fix is the snippet, not the
 * ranking, which is why this scores as low effort.
 */
function ctrGapCandidate(view: SearchScope): Candidate | null {
  const target = expectedCtr(view.position);
  if (view.position < 4 || view.position > 10 || view.ctr >= target * 0.7) return null;

  const where = view.page === null ? "" : ` Página: ${view.page}`;
  return {
    rule: "seo_ctr_gap",
    dedupeKey: `seo_ctr_gap:${view.dimensionHash}`,
    title:
      view.query === null
        ? "Melhore o título e a descrição das páginas na primeira página"
        : `Melhore o snippet para "${view.query}"`,
    description:
      `A busca ${view.query === null ? "do site" : `"${view.query}"`} aparece na posição média ` +
      `${view.position.toFixed(1)} com ${view.impressions.toFixed(0)} impressões, mas só ` +
      `${(view.ctr * 100).toFixed(1)}% dos usuários clicam — abaixo dos ` +
      `${(target * 100).toFixed(0)}% típicos dessa posição. Reescrever o título e a meta ` +
      `descrição costuma recuperar cliques sem precisar subir no ranking.${where}`,
    category: "seo",
    risk: "low",
    impact: clamp((target - view.ctr) / target),
    urgency: 0.4,
    alignment: 0.8,
    effort: 0.2,
    claim: `CTR de ${(view.ctr * 100).toFixed(1)}% na posição ${view.position.toFixed(1)}`,
    facts: {
      rule: "seo_ctr_gap",
      window_days: WINDOW_DAYS,
      metric: "SEARCH_CTR",
      scope: view.scope,
      current: round(view.ctr, 4),
      previous: round(target, 4),
      delta_pct: round(((view.ctr - target) / target) * 100, 2),
      support: { impressions: round(view.impressions, 0), clicks: round(view.clicks, 0) },
      coverage: view.coverage
    },
    observedAt: view.observedAt
  };
}

function trafficDropCandidate(view: SearchScope): Candidate | null {
  if (view.previousClicks <= 0 || view.clicks >= view.previousClicks * 0.8) return null;

  const dropPct = ((view.previousClicks - view.clicks) / view.previousClicks) * 100;
  const where = view.page === null ? "" : ` Página afetada: ${view.page}`;
  return {
    rule: "seo_traffic_drop",
    dedupeKey: `seo_traffic_drop:${view.dimensionHash}`,
    title:
      view.query === null
        ? "Investigue a queda de cliques na busca"
        : `Queda de cliques em "${view.query}"`,
    description:
      `Os cliques caíram ${dropPct.toFixed(0)}% nos últimos ${String(WINDOW_DAYS)} dias ` +
      `(${view.clicks.toFixed(0)} contra ${view.previousClicks.toFixed(0)} na semana anterior), ` +
      `com ${view.impressions.toFixed(0)} impressões no período.${where}`,
    category: "seo",
    risk: dropPct >= 40 ? "high" : "medium",
    impact: clamp(dropPct / 100),
    // A drop compounds while it goes unattended, so it outranks an optimisation.
    urgency: clamp(0.5 + dropPct / 200),
    alignment: 0.9,
    effort: 0.5,
    claim: `${view.clicks.toFixed(0)} cliques contra ${view.previousClicks.toFixed(0)} na semana anterior`,
    facts: {
      rule: "seo_traffic_drop",
      window_days: WINDOW_DAYS,
      metric: "SEARCH_CLICKS",
      scope: view.scope,
      current: round(view.clicks, 2),
      previous: round(view.previousClicks, 2),
      delta_pct: round(-dropPct, 2),
      support: { impressions: round(view.impressions, 0) },
      coverage: view.coverage
    },
    observedAt: view.observedAt
  };
}

const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS"
] as const;

const ACTION_METRICS = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS"] as const;

function businessCandidates(
  scopes: Map<string, Map<string, WindowRow>>,
  now: Date
): readonly Candidate[] {
  const candidates: Candidate[] = [];

  for (const [dimensionHash, metrics] of scopes) {
    const impressions = sumCurrent(metrics, IMPRESSION_METRICS);
    const previousImpressions = sumPrevious(metrics, IMPRESSION_METRICS);
    const actions = sumCurrent(metrics, ACTION_METRICS);
    const previousActions = sumPrevious(metrics, ACTION_METRICS);
    if (impressions < MIN_IMPRESSIONS || previousImpressions === 0) continue;

    const impressionGrowth = (impressions - previousImpressions) / previousImpressions;
    const actionGrowth = previousActions === 0 ? 1 : (actions - previousActions) / previousActions;

    // More people finding the listing while fewer act on it points at the
    // profile's content, not at visibility.
    if (impressionGrowth >= 0.1 && actionGrowth <= 0) {
      const scope = scopeOf(metrics);
      candidates.push({
        rule: "gbp_conversion_gap",
        dedupeKey: `gbp_conversion_gap:${dimensionHash}`,
        title: "Converta a visibilidade crescente em contatos",
        description:
          `As visualizações do perfil subiram ${(impressionGrowth * 100).toFixed(0)}% nos ` +
          `últimos ${String(WINDOW_DAYS)} dias, mas ligações, cliques no site e pedidos de rota ` +
          `${actionGrowth === 0 ? "ficaram parados" : `caíram ${(Math.abs(actionGrowth) * 100).toFixed(0)}%`} ` +
          `(${actions.toFixed(0)} contra ${previousActions.toFixed(0)}). Revise fotos, horários e ` +
          `botão de ação do perfil.`,
        category: "local",
        risk: "medium",
        impact: clamp(impressionGrowth),
        urgency: 0.6,
        alignment: 0.9,
        effort: 0.3,
        claim: `${impressions.toFixed(0)} visualizações geraram ${actions.toFixed(0)} ações`,
        facts: {
          rule: "gbp_conversion_gap",
          window_days: WINDOW_DAYS,
          metric: "BUSINESS_ACTIONS",
          scope,
          current: round(actions, 2),
          previous: round(previousActions, 2),
          delta_pct: round(actionGrowth * 100, 2),
          support: {
            impressions: round(impressions, 0),
            previous_impressions: round(previousImpressions, 0)
          },
          coverage: "complete"
        },
        observedAt: latestObservation(metrics, now)
      });
    }
  }

  return candidates;
}

/**
 * Writes the evidence first, then the recommendation, then the link between
 * them. Ordering matters: a recommendation must never exist without the rows
 * that justify it.
 */
async function persist(
  database: Database,
  context: TenantContext,
  candidate: Candidate,
  provider: string,
  now: Date
): Promise<boolean> {
  const sha256 = createHash("sha256").update(JSON.stringify(candidate.facts)).digest("hex");

  const evidenceRows = await database.execute<{ id: string }>(sql`
    insert into app.evidence (
      id, tenant_id, source, source_ref, captured_at, title, excerpt, facts, sha256, fresh_until
    ) values (
      ${newId()}, ${context.tenantId}, ${provider},
      ${`metric_snapshots:${candidate.facts.metric}:${String(WINDOW_DAYS)}d`},
      ${candidate.observedAt}, ${candidate.claim.slice(0, 255)}, ${candidate.description.slice(0, 500)},
      ${JSON.stringify(candidate.facts)}::jsonb, ${sha256},
      ${addDays(now, WINDOW_DAYS)}
    )
    on conflict (tenant_id, sha256) do update
    set captured_at = excluded.captured_at,
        fresh_until = excluded.fresh_until,
        updated_at = now(),
        version = app.evidence.version + 1
    returning id
  `);
  const evidenceId = evidenceRows[0]?.id;
  if (evidenceId === undefined) return false;

  const confidence = recommendationConfidence({
    // One provider reported this scope, and both windows are present.
    coverage: candidate.facts.coverage === "complete" ? 1 : 0.7,
    freshness: freshnessScore(candidate.observedAt, now),
    agreement: candidate.facts.delta_pct === null ? 0.5 : 0.8
  });
  const score = priorityScore({
    impact: candidate.impact,
    confidence,
    urgency: candidate.urgency,
    alignment: candidate.alignment,
    effort: candidate.effort
  });

  const rationale =
    `Regra ${candidate.rule}, janela de ${String(WINDOW_DAYS)} dias comparada aos ` +
    `${String(WINDOW_DAYS)} dias anteriores, mínimo de ${String(MIN_IMPRESSIONS)} impressões. ` +
    `Cobertura dos dados: ${candidate.facts.coverage === "complete" ? "completa" : "apenas as linhas principais retornadas pelo Google"}.`;

  const recommendationRows = await database.execute<{ id: string; inserted: boolean }>(sql`
    insert into app.recommendations (
      id, tenant_id, title, description, category, status, priority_score,
      impact, confidence, urgency, alignment, effort, risk, rationale,
      generated_by, dedupe_key, formula_version
    ) values (
      ${newId()}, ${context.tenantId}, ${candidate.title.slice(0, 200)}, ${candidate.description},
      ${candidate.category}, 'open', ${score},
      ${candidate.impact}, ${confidence}, ${candidate.urgency}, ${candidate.alignment},
      ${candidate.effort}, ${candidate.risk}, ${rationale},
      'rule', ${candidate.dedupeKey}, ${PRIORITY_FORMULA_VERSION}
    )
    on conflict (tenant_id, dedupe_key) where status = 'open' and dedupe_key is not null
    do update set
      title = excluded.title,
      description = excluded.description,
      priority_score = excluded.priority_score,
      impact = excluded.impact,
      confidence = excluded.confidence,
      urgency = excluded.urgency,
      risk = excluded.risk,
      rationale = excluded.rationale,
      updated_at = now(),
      version = app.recommendations.version + 1
    returning id, (xmax = 0) as inserted
  `);
  const recommendation = recommendationRows[0];
  if (recommendation === undefined) return false;

  await database.execute(sql`
    insert into app.recommendation_evidence (recommendation_id, evidence_id, position, claim)
    values (${recommendation.id}, ${evidenceId}, 1, ${candidate.claim.slice(0, 500)})
    on conflict (recommendation_id, evidence_id) do update set claim = excluded.claim
  `);

  return recommendation.inserted;
}

function scopeOf(metrics: Map<string, WindowRow>): Record<string, unknown> {
  for (const row of metrics.values()) return row.dimensions;
  return {};
}

function latestObservation(metrics: Map<string, WindowRow>, fallback: Date): Date {
  let latest: Date | null = null;
  for (const row of metrics.values()) {
    const observed = new Date(row.observed_at);
    if (Number.isNaN(observed.getTime())) continue;
    if (latest === null || observed > latest) latest = observed;
  }
  return latest ?? fallback;
}

function current(metrics: Map<string, WindowRow>, metric: string): number {
  return Number(metrics.get(metric)?.current_value ?? 0);
}

function previous(metrics: Map<string, WindowRow>, metric: string): number {
  return Number(metrics.get(metric)?.previous_value ?? 0);
}

function sumCurrent(metrics: Map<string, WindowRow>, names: readonly string[]): number {
  return names.reduce((total, name) => total + current(metrics, name), 0);
}

function sumPrevious(metrics: Map<string, WindowRow>, names: readonly string[]): number {
  return names.reduce((total, name) => total + previous(metrics, name), 0);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
