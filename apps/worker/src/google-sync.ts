import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AppConfig } from "@growth-manager/config";
import { schema, type Database } from "@growth-manager/database";
import { newId, type TenantContext } from "@growth-manager/domain";
import {
  fetchBusinessPerformance,
  querySearchAnalytics,
  refreshAccessToken,
  type DailyMetric,
  type GoogleOAuthConfig
} from "@growth-manager/integrations";

export type SyncableProvider = "google_business" | "search_console";

export interface SyncOutcome {
  readonly recordsRead: number;
  readonly recordsWritten: number;
}

// Search Console only finalises data after a couple of days and Business Profile
// restates recent days, so every run re-reads an overlapping window and upserts.
const LOOKBACK_DAYS = 30;
const METRIC_UNIT: Readonly<Record<string, string>> = {
  SEARCH_CTR: "ratio",
  SEARCH_POSITION: "position"
};

export async function syncGoogleProvider(input: {
  readonly database: Database;
  readonly context: TenantContext;
  readonly config: AppConfig;
  readonly provider: SyncableProvider;
}): Promise<SyncOutcome> {
  const connection = await activeConnection(input.database, input.context, input.provider);
  const properties = await selectedProperties(input.database, connection.id);
  if (properties.length === 0) {
    return { recordsRead: 0, recordsWritten: 0 };
  }

  const accessToken = await accessTokenFor(input.database, connection.id, {
    clientId: input.config.GOOGLE_CLIENT_ID,
    clientSecret: input.config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${input.config.API_BASE_URL}/v1/integrations/${input.provider}/callback`
  });

  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let read = 0;
  let written = 0;
  for (const property of properties) {
    const metrics = await readMetrics({
      provider: input.provider,
      accessToken,
      externalId: property.externalId,
      start,
      end
    });
    read += metrics.length;
    if (metrics.length === 0) continue;

    const rawImportId = await recordRawImport({
      database: input.database,
      context: input.context,
      provider: input.provider,
      property,
      metrics,
      capturedAt: end
    });
    written += await upsertMetrics({
      database: input.database,
      context: input.context,
      provider: input.provider,
      locationId: property.locationId,
      metrics,
      rawImportId,
      observedAt: end
    });
  }

  await input.database
    .update(schema.integrationConnections)
    .set({
      lastSyncedAt: end,
      status: "active",
      errorCode: null,
      updatedAt: end,
      version: sql`${schema.integrationConnections.version} + 1`
    })
    .where(eq(schema.integrationConnections.id, connection.id));

  return { recordsRead: read, recordsWritten: written };
}

async function readMetrics(input: {
  readonly provider: SyncableProvider;
  readonly accessToken: string;
  readonly externalId: string;
  readonly start: Date;
  readonly end: Date;
}): Promise<readonly DailyMetric[]> {
  if (input.provider === "google_business") {
    return fetchBusinessPerformance({
      accessToken: input.accessToken,
      externalId: input.externalId,
      start: input.start,
      end: input.end
    });
  }
  // Two passes: the site-level totals answer "is traffic moving", and the query
  // and page breakdown is what a recommendation can actually name an action on.
  const [totals, breakdown] = await Promise.all([
    querySearchAnalytics({
      accessToken: input.accessToken,
      siteUrl: input.externalId,
      start: input.start,
      end: input.end
    }),
    querySearchAnalytics({
      accessToken: input.accessToken,
      siteUrl: input.externalId,
      start: input.start,
      end: input.end,
      dimensions: ["date", "query", "page"],
      rowLimit: 5000
    })
  ]);
  return [...totals, ...breakdown];
}

/**
 * The raw payload is hashed and recorded so a metric can always be traced back to
 * the response that produced it, which is what makes a priority auditable.
 */
async function recordRawImport(input: {
  readonly database: Database;
  readonly context: TenantContext;
  readonly provider: SyncableProvider;
  readonly property: PropertyRow;
  readonly metrics: readonly DailyMetric[];
  readonly capturedAt: Date;
}): Promise<string> {
  const digest = createHash("sha256").update(JSON.stringify(input.metrics)).digest("hex");
  const objectKey = `${input.context.tenantId}/${input.provider}/${digest}`;
  const expiresAt = new Date(input.capturedAt.getTime() + 90 * 24 * 60 * 60 * 1000);

  const rows = await input.database
    .insert(schema.rawImports)
    .values({
      id: newId(),
      tenantId: input.context.tenantId,
      provider: input.provider,
      resourceType: input.property.kind,
      resourceId: input.property.externalId,
      capturedAt: input.capturedAt,
      objectKey,
      sha256: digest,
      schemaVersion: "1",
      expiresAt
    })
    .onConflictDoUpdate({
      target: schema.rawImports.objectKey,
      set: { capturedAt: input.capturedAt, updatedAt: input.capturedAt }
    })
    .returning({ id: schema.rawImports.id });

  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Failed to record the raw import");
  return id;
}

async function upsertMetrics(input: {
  readonly database: Database;
  readonly context: TenantContext;
  readonly provider: SyncableProvider;
  readonly locationId: string | null;
  readonly metrics: readonly DailyMetric[];
  readonly rawImportId: string;
  readonly observedAt: Date;
}): Promise<number> {
  const values = input.metrics.map((metric) => ({
    id: newId(),
    tenantId: input.context.tenantId,
    locationId: input.locationId,
    source: input.provider,
    metric: metric.metric,
    dimensionHash: createHash("sha256").update(JSON.stringify(metric.dimensions)).digest("hex"),
    dimensions: metric.dimensions,
    periodStart: metric.date,
    periodEnd: metric.date,
    value: metric.value.toString(),
    unit: METRIC_UNIT[metric.metric] ?? "count",
    observedAt: input.observedAt,
    quality: "measured",
    rawImportId: input.rawImportId
  }));

  await input.database
    .insert(schema.metricSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.metricSnapshots.tenantId,
        schema.metricSnapshots.source,
        schema.metricSnapshots.metric,
        schema.metricSnapshots.dimensionHash,
        schema.metricSnapshots.periodStart,
        schema.metricSnapshots.periodEnd
      ],
      set: {
        value: sql`excluded.value`,
        observedAt: sql`excluded.observed_at`,
        rawImportId: sql`excluded.raw_import_id`,
        updatedAt: input.observedAt,
        version: sql`${schema.metricSnapshots.version} + 1`
      }
    });

  return values.length;
}

interface PropertyRow {
  readonly kind: string;
  readonly externalId: string;
  readonly locationId: string | null;
}

async function selectedProperties(
  database: Database,
  connectionId: string
): Promise<readonly PropertyRow[]> {
  return database
    .select({
      kind: schema.integrationProperties.kind,
      externalId: schema.integrationProperties.externalId,
      locationId: schema.integrationProperties.locationId
    })
    .from(schema.integrationProperties)
    .where(
      and(
        eq(schema.integrationProperties.connectionId, connectionId),
        eq(schema.integrationProperties.selected, true)
      )
    );
}

async function activeConnection(
  database: Database,
  context: TenantContext,
  provider: SyncableProvider
): Promise<typeof schema.integrationConnections.$inferSelect> {
  const rows = await database
    .select()
    .from(schema.integrationConnections)
    .where(
      and(
        eq(schema.integrationConnections.tenantId, context.tenantId),
        eq(schema.integrationConnections.provider, provider)
      )
    )
    .limit(1);

  const connection = rows[0];
  if (connection?.status !== "active") {
    throw new Error(`No active ${provider} connection for tenant ${context.tenantId}`);
  }
  return connection;
}

async function accessTokenFor(
  database: Database,
  connectionId: string,
  oauth: GoogleOAuthConfig
): Promise<string> {
  const rows = await database.execute<{ readonly read_integration_secret: string | null }>(
    sql`select app.read_integration_secret(${connectionId}::uuid)`
  );
  const refreshToken = rows[0]?.read_integration_secret;
  if (refreshToken === null || refreshToken === undefined) {
    throw new Error(`Connection ${connectionId} has no stored credential`);
  }
  const tokens = await refreshAccessToken({ config: oauth, refreshToken });
  return tokens.accessToken;
}
