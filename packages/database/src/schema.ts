import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const app = pgSchema("app");

const mutableColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1)
};

export const organizations = app.table("organizations", {
  ...mutableColumns,
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  billingEmail: varchar("billing_email", { length: 320 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
  settings: jsonb("settings").notNull().default({})
});

export const tenants = app.table(
  "tenants",
  {
    ...mutableColumns,
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("onboarding"),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 16 }).notNull().default("pt-BR"),
    onboardingStep: smallint("onboarding_step").notNull().default(0),
    deletionDueAt: timestamp("deletion_due_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("tenants_organization_slug_uq").on(table.organizationId, table.slug),
    index("tenants_organization_status_idx").on(table.organizationId, table.status),
    check("tenants_onboarding_step_ck", sql`${table.onboardingStep} between 0 and 8`)
  ]
);

export const users = app.table(
  "users",
  {
    ...mutableColumns,
    authUserId: uuid("auth_user_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("invited"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    locale: varchar("locale", { length: 16 }).notNull().default("pt-BR"),
    mfaState: varchar("mfa_state", { length: 20 }).notNull().default("optional")
  },
  (table) => [
    uniqueIndex("users_auth_user_id_uq").on(table.authUserId),
    uniqueIndex("users_email_uq").on(table.email)
  ]
);

export const memberships = app.table(
  "memberships",
  {
    ...mutableColumns,
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: varchar("role", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    grantedBy: uuid("granted_by").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true })
  },
  (table) => [
    index("memberships_user_status_idx").on(table.userId, table.status),
    index("memberships_tenant_status_idx").on(table.tenantId, table.status)
  ]
);

// The geo and service_area columns hold PostGIS/JSON shapes no query path needs,
// so they stay out of the model.
export const locations = app.table(
  "locations",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    externalKey: varchar("external_key", { length: 255 }),
    primaryLocation: boolean("primary_location").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("active")
  },
  (table) => [index("locations_tenant_status_idx").on(table.tenantId, table.status)]
);

export const integrationConnections = app.table(
  "integration_connections",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("disconnected"),
    secretRef: varchar("secret_ref", { length: 512 }),
    scopes: text("scopes").array().notNull().default([]),
    authorizedBy: uuid("authorized_by").references(() => users.id),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 80 }),
    consentVersion: varchar("consent_version", { length: 32 }),
    metadata: jsonb("metadata").notNull().default({})
  },
  (table) => [
    uniqueIndex("integration_connections_tenant_provider_uq").on(table.tenantId, table.provider),
    index("integration_connections_status_expires_idx").on(table.status, table.expiresAt)
  ]
);

export const integrationProperties = app.table(
  "integration_properties",
  {
    ...mutableColumns,
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: varchar("kind", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    selected: boolean("selected").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({})
  },
  (table) => [
    uniqueIndex("integration_properties_connection_kind_external_uq").on(
      table.connectionId,
      table.kind,
      table.externalId
    ),
    index("integration_properties_tenant_kind_idx").on(table.tenantId, table.kind, table.selected)
  ]
);

export const syncJobs = app.table(
  "sync_jobs",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    connectionId: uuid("connection_id").references(() => integrationConnections.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    cursor: jsonb("cursor"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    attempt: smallint("attempt").notNull().default(0),
    requestedBy: uuid("requested_by").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    recordsRead: integer("records_read").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    recordsRejected: integer("records_rejected").notNull().default(0),
    error: jsonb("error")
  },
  (table) => [
    uniqueIndex("sync_jobs_tenant_idempotency_uq").on(table.tenantId, table.idempotencyKey),
    index("sync_jobs_status_retry_idx").on(table.status, table.nextRetryAt)
  ]
);

export const rawImports = app.table(
  "raw_imports",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 32 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("raw_imports_object_key_uq").on(table.objectKey),
    index("raw_imports_tenant_provider_captured_idx").on(
      table.tenantId,
      table.provider,
      table.capturedAt
    )
  ]
);

export const metricSnapshots = app.table(
  "metric_snapshots",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id").references(() => locations.id),
    source: varchar("source", { length: 32 }).notNull(),
    metric: varchar("metric", { length: 80 }).notNull(),
    dimensionHash: varchar("dimension_hash", { length: 64 }).notNull(),
    dimensions: jsonb("dimensions").notNull().default({}),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    quality: varchar("quality", { length: 20 }).notNull(),
    rawImportId: uuid("raw_import_id").references(() => rawImports.id)
  },
  (table) => [
    uniqueIndex("metric_snapshots_identity_uq").on(
      table.tenantId,
      table.source,
      table.metric,
      table.dimensionHash,
      table.periodStart,
      table.periodEnd
    ),
    index("metric_snapshots_tenant_metric_period_idx").on(
      table.tenantId,
      table.metric,
      table.periodEnd
    )
  ]
);

export const alerts = app.table(
  "alerts",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: varchar("type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    title: varchar("title", { length: 200 }).notNull(),
    details: jsonb("details").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    occurrences: integer("occurrences").notNull().default(1),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [index("alerts_tenant_status_idx").on(table.tenantId, table.status)]
);

export const usageEvents = app.table(
  "usage_events",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 80 }).notNull(),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    cost: numeric("cost", { precision: 14, scale: 6 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull().default({})
  },
  (table) => [index("usage_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt)]
);

export const budgets = app.table(
  "budgets",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    period: varchar("period", { length: 16 }).notNull().default("monthly"),
    softLimit: numeric("soft_limit", { precision: 14, scale: 4 }).notNull(),
    hardLimit: numeric("hard_limit", { precision: 14, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    essentialOverride: boolean("essential_override").notNull().default(false),
    effectiveFrom: date("effective_from").notNull()
  },
  (table) => [
    uniqueIndex("budgets_tenant_provider_effective_uq").on(
      table.tenantId,
      table.provider,
      table.effectiveFrom
    )
  ]
);

// These tables already exist in the normative SQL model. They are declared here
// so application code does not need raw SQL to create and verify SEO evidence.
export const evidence = app.table(
  "evidence",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    source: varchar("source", { length: 32 }).notNull(),
    sourceRef: varchar("source_ref", { length: 512 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    excerpt: text("excerpt"),
    facts: jsonb("facts").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    freshUntil: timestamp("fresh_until", { withTimezone: true }),
    rawImportId: uuid("raw_import_id").references(() => rawImports.id)
  },
  (table) => [
    uniqueIndex("evidence_tenant_sha_uq").on(table.tenantId, table.sha256),
    index("evidence_tenant_source_captured_idx").on(table.tenantId, table.source, table.capturedAt)
  ]
);

export const aiRuns = app.table(
  "ai_runs",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    useCase: varchar("use_case", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
    inputSha256: varchar("input_sha256", { length: 64 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cost: numeric("cost", { precision: 14, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    output: jsonb("output"),
    validationErrors: jsonb("validation_errors"),
    requestedBy: uuid("requested_by").references(() => users.id)
  },
  (table) => [
    index("ai_runs_tenant_use_case_idx").on(table.tenantId, table.useCase, table.createdAt)
  ]
);

export const aiRunEvidence = app.table(
  "ai_run_evidence",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    aiRunId: uuid("ai_run_id")
      .notNull()
      .references(() => aiRuns.id),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    position: smallint("position").notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.aiRunId, table.evidenceId] }),
    uniqueIndex("ai_run_evidence_tenant_position_uq").on(
      table.tenantId,
      table.aiRunId,
      table.position
    ),
    index("ai_run_evidence_tenant_evidence_idx").on(table.tenantId, table.evidenceId)
  ]
);

export const costReservations = app.table(
  "cost_reservations",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("reserved"),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }).notNull(),
    actualCost: numeric("actual_cost", { precision: 14, scale: 6 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({})
  },
  (table) => [
    uniqueIndex("cost_reservations_tenant_idempotency_uq").on(table.tenantId, table.idempotencyKey),
    index("cost_reservations_tenant_provider_status_idx").on(
      table.tenantId,
      table.provider,
      table.status
    )
  ]
);

export const providerPriceCatalog = app.table(
  "provider_price_catalog",
  {
    ...mutableColumns,
    provider: varchar("provider", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 80 }).notNull(),
    unit: varchar("unit", { length: 40 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 20, scale: 9 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    sourceUrl: varchar("source_url", { length: 512 }).notNull()
  },
  (table) => [
    uniqueIndex("provider_price_catalog_identity_uq").on(
      table.provider,
      table.operation,
      table.unit,
      table.effectiveFrom
    )
  ]
);

export const seoSourceRegistry = app.table(
  "seo_source_registry",
  {
    ...mutableColumns,
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    license: varchar("license", { length: 80 }).notNull(),
    termsUrl: varchar("terms_url", { length: 512 }),
    attribution: text("attribution"),
    allowedUses: text("allowed_uses").array().notNull().default([]),
    retentionPolicy: varchar("retention_policy", { length: 160 }).notNull(),
    active: boolean("active").notNull().default(true)
  },
  (table) => [uniqueIndex("seo_source_registry_code_uq").on(table.code)]
);

export const recommendations = app.table(
  "recommendations",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    priorityScore: smallint("priority_score").notNull(),
    impact: numeric("impact", { precision: 5, scale: 4 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    urgency: numeric("urgency", { precision: 5, scale: 4 }).notNull(),
    alignment: numeric("alignment", { precision: 5, scale: 4 }).notNull(),
    effort: numeric("effort", { precision: 5, scale: 4 }).notNull(),
    risk: varchar("risk", { length: 20 }).notNull(),
    rationale: text("rationale").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    generatedBy: varchar("generated_by", { length: 20 }).notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissalReason: varchar("dismissal_reason", { length: 500 })
  },
  (table) => [
    index("recommendations_tenant_status_score_idx").on(
      table.tenantId,
      table.status,
      table.priorityScore
    ),
    check("recommendations_score_ck", sql`${table.priorityScore} between 0 and 100`)
  ]
);

export const recommendationEvidence = app.table(
  "recommendation_evidence",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    position: smallint("position").notNull(),
    claim: varchar("claim", { length: 500 }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.recommendationId, table.evidenceId] }),
    uniqueIndex("recommendation_evidence_tenant_position_uq").on(
      table.tenantId,
      table.recommendationId,
      table.position
    )
  ]
);

export const tasks = app.table(
  "tasks",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recommendationId: uuid("recommendation_id").references(() => recommendations.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 24 }).notNull().default("backlog"),
    priority: varchar("priority", { length: 16 }).notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    source: varchar("source", { length: 32 }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    index("tasks_tenant_status_due_idx").on(table.tenantId, table.status, table.dueAt),
    index("tasks_tenant_open_due_idx")
      .on(table.tenantId, table.dueAt)
      .where(sql`${table.completedAt} is null`)
  ]
);

export const approvals = app.table(
  "approvals",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subjectType: varchar("subject_type", { length: 40 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    risk: varchar("risk", { length: 20 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: varchar("decision_note", { length: 1000 }),
    contentSha256: varchar("content_sha256", { length: 64 }).notNull()
  },
  (table) => [
    index("approvals_tenant_status_due_idx").on(table.tenantId, table.status, table.dueAt),
    index("approvals_assigned_status_due_idx").on(table.assignedTo, table.status, table.dueAt)
  ]
);

export const reviews = app.table(
  "reviews",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id").references(() => locations.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    authorName: varchar("author_name", { length: 160 }),
    rating: smallint("rating").notNull(),
    body: text("body"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    updatedExternalAt: timestamp("updated_external_at", { withTimezone: true }),
    sentiment: varchar("sentiment", { length: 16 }),
    sensitiveTheme: boolean("sensitive_theme").notNull().default(false),
    replyStatus: varchar("reply_status", { length: 24 }).notNull().default("none")
  },
  (table) => [
    uniqueIndex("reviews_provider_external_uq").on(table.provider, table.externalId),
    index("reviews_tenant_published_idx").on(table.tenantId, table.publishedAt),
    check("reviews_rating_ck", sql`${table.rating} between 1 and 5`)
  ]
);

export const reviewReplies = app.table(
  "review_replies",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    externalReplyId: varchar("external_reply_id", { length: 255 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 80 })
  },
  (table) => [
    uniqueIndex("review_replies_review_version_uq").on(table.reviewId, table.version),
    index("review_replies_tenant_status_idx").on(table.tenantId, table.status)
  ]
);

export const reports = app.table(
  "reports",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    firstReport: boolean("first_report").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("reports_tenant_period_uq").on(table.tenantId, table.periodStart, table.periodEnd),
    index("reports_tenant_status_period_idx").on(table.tenantId, table.status, table.periodEnd)
  ]
);

export const outboxEvents = app.table(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    aggregateType: varchar("aggregate_type", { length: 80 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 16 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    payload: jsonb("payload").notNull(),
    traceId: varchar("trace_id", { length: 128 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("outbox_idempotency_uq").on(table.idempotencyKey),
    index("outbox_unpublished_idx").on(table.publishedAt, table.occurredAt)
  ]
);

export const inboxMessages = app.table(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    consumer: varchar("consumer", { length: 100 }).notNull(),
    messageId: varchar("message_id", { length: 160 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    result: jsonb("result")
  },
  (table) => [uniqueIndex("inbox_consumer_message_uq").on(table.consumer, table.messageId)]
);

export const deadLetters = app.table(
  "dead_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    queue: varchar("queue", { length: 80 }).notNull(),
    messageId: varchar("message_id", { length: 160 }).notNull(),
    jobType: varchar("job_type", { length: 80 }).notNull(),
    payload: jsonb("payload").notNull(),
    error: jsonb("error").notNull(),
    attempts: smallint("attempts").notNull(),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
    redrivenAt: timestamp("redriven_at", { withTimezone: true })
  },
  (table) => [index("dead_letters_queue_failed_idx").on(table.queue, table.failedAt)]
);

export const auditLogs = app.table(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    actorId: uuid("actor_id").references(() => users.id),
    actorType: varchar("actor_type", { length: 24 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: uuid("target_id"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    traceId: varchar("trace_id", { length: 128 }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    previousHash: varchar("previous_hash", { length: 64 }),
    hash: varchar("hash", { length: 64 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("audit_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    uniqueIndex("audit_hash_uq").on(table.hash)
  ]
);

export const seoTargets = app.table(
  "seo_targets",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id").references(() => locations.id),
    url: varchar("url", { length: 2048 }).notNull(),
    normalizedOrigin: varchar("normalized_origin", { length: 512 }).notNull(),
    scope: varchar("scope", { length: 16 }).notNull().default("origin"),
    locale: varchar("locale", { length: 16 }).notNull().default("pt-BR"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    crawlPolicy: jsonb("crawl_policy").notNull().default({})
  },
  (table) => [
    uniqueIndex("seo_targets_tenant_origin_scope_uq").on(
      table.tenantId,
      table.normalizedOrigin,
      table.scope
    ),
    index("seo_targets_tenant_status_idx").on(table.tenantId, table.status)
  ]
);

export const seoMonitoringProfiles = app.table(
  "seo_monitoring_profiles",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    enabledCapabilities: text("enabled_capabilities").array().notNull(),
    cadence: jsonb("cadence").notNull(),
    criticalUrls: text("critical_urls").array().notNull().default([]),
    geogrid: jsonb("geogrid").notNull(),
    monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 4 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    nextDailyAt: timestamp("next_daily_at", { withTimezone: true }),
    nextWeeklyAt: timestamp("next_weekly_at", { withTimezone: true }),
    nextMonthlyAt: timestamp("next_monthly_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("seo_monitoring_profiles_tenant_target_uq").on(table.tenantId, table.targetId),
    index("seo_monitoring_profiles_tenant_due_idx").on(
      table.tenantId,
      table.nextDailyAt,
      table.nextWeeklyAt,
      table.nextMonthlyAt
    )
  ]
);

export const seoAnalysisRuns = app.table(
  "seo_analysis_runs",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    mode: varchar("mode", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    plannerVersion: varchar("planner_version", { length: 64 }).notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    requestedCapabilities: text("requested_capabilities").array().notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestedBy: uuid("requested_by").references(() => users.id),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    actualCost: numeric("actual_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    coverage: numeric("coverage", { precision: 5, scale: 4 }).notNull().default("0"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    reportHtmlKey: varchar("report_html_key", { length: 512 }),
    reportPdfKey: varchar("report_pdf_key", { length: 512 }),
    error: jsonb("error")
  },
  (table) => [
    uniqueIndex("seo_analysis_runs_tenant_idempotency_uq").on(table.tenantId, table.idempotencyKey),
    index("seo_analysis_runs_tenant_target_created_idx").on(
      table.tenantId,
      table.targetId,
      table.createdAt
    ),
    index("seo_analysis_runs_tenant_status_idx").on(table.tenantId, table.status)
  ]
);

export const seoCapabilityRuns = app.table(
  "seo_capability_runs",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    capabilityCode: varchar("capability_code", { length: 40 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    skipReason: varchar("skip_reason", { length: 40 }),
    ruleVersion: varchar("rule_version", { length: 64 }).notNull(),
    inputSha256: varchar("input_sha256", { length: 64 }),
    outputSha256: varchar("output_sha256", { length: 64 }),
    attempt: smallint("attempt").notNull().default(0),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    actualCost: numeric("actual_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: jsonb("error")
  },
  (table) => [
    uniqueIndex("seo_capability_runs_tenant_run_code_uq").on(
      table.tenantId,
      table.analysisRunId,
      table.capabilityCode
    ),
    index("seo_capability_runs_tenant_status_idx").on(table.tenantId, table.status)
  ]
);

export const seoPages = app.table(
  "seo_pages",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    normalizedUrl: varchar("normalized_url", { length: 2048 }).notNull(),
    discoverySource: varchar("discovery_source", { length: 40 }).notNull(),
    pageType: varchar("page_type", { length: 40 }),
    critical: boolean("critical").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("seo_pages_tenant_target_url_uq").on(
      table.tenantId,
      table.targetId,
      table.normalizedUrl
    ),
    index("seo_pages_tenant_target_seen_idx").on(table.tenantId, table.targetId, table.lastSeenAt)
  ]
);

export const seoPageSnapshots = app.table(
  "seo_page_snapshots",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    pageId: uuid("page_id")
      .notNull()
      .references(() => seoPages.id),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    rawImportId: uuid("raw_import_id").references(() => rawImports.id),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    statusCode: smallint("status_code"),
    mimeType: varchar("mime_type", { length: 120 }),
    responseHeaders: jsonb("response_headers").notNull().default({}),
    title: text("title"),
    description: text("description"),
    canonicalUrl: text("canonical_url"),
    robots: text("robots").array().notNull().default([]),
    headings: jsonb("headings").notNull().default({}),
    structuredData: jsonb("structured_data").notNull().default([]),
    language: varchar("language", { length: 16 }),
    wordCount: integer("word_count").notNull().default(0),
    renderSuggested: boolean("render_suggested").notNull().default(false),
    htmlSha256: varchar("html_sha256", { length: 64 }),
    contentSha256: varchar("content_sha256", { length: 64 }),
    schemaSha256: varchar("schema_sha256", { length: 64 }),
    renderMode: varchar("render_mode", { length: 24 }).notNull().default("http"),
    quality: varchar("quality", { length: 24 }).notNull().default("complete")
  },
  (table) => [
    uniqueIndex("seo_page_snapshots_tenant_page_run_uq").on(
      table.tenantId,
      table.pageId,
      table.analysisRunId
    ),
    index("seo_page_snapshots_tenant_page_observed_idx").on(
      table.tenantId,
      table.pageId,
      table.observedAt
    )
  ]
);

export const seoFindings = app.table(
  "seo_findings",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    capabilityRunId: uuid("capability_run_id").references(() => seoCapabilityRuns.id),
    pageId: uuid("page_id").references(() => seoPages.id),
    code: varchar("code", { length: 96 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    confidenceCoverage: numeric("confidence_coverage", { precision: 5, scale: 4 }).notNull(),
    confidenceFreshness: numeric("confidence_freshness", { precision: 5, scale: 4 }).notNull(),
    confidenceAgreement: numeric("confidence_agreement", { precision: 5, scale: 4 }).notNull(),
    origin: jsonb("origin").notNull(),
    recommendation: text("recommendation").notNull(),
    impact: jsonb("impact").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    ruleVersion: varchar("rule_version", { length: 64 }).notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
    recommendationId: uuid("recommendation_id").references(() => recommendations.id),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    consecutiveCleanRuns: smallint("consecutive_clean_runs").notNull().default(0),
    dismissedReason: varchar("dismissed_reason", { length: 1000 }),
    dismissedUntil: timestamp("dismissed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("seo_findings_tenant_dedupe_uq").on(table.tenantId, table.dedupeKey),
    index("seo_findings_tenant_target_status_idx").on(table.tenantId, table.targetId, table.status),
    index("seo_findings_tenant_severity_seen_idx").on(
      table.tenantId,
      table.severity,
      table.lastSeenAt
    )
  ]
);

export const seoFindingEvidence = app.table(
  "seo_finding_evidence",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => seoFindings.id),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    position: smallint("position").notNull(),
    claim: varchar("claim", { length: 500 }).notNull(),
    role: varchar("role", { length: 24 }).notNull().default("fact")
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.findingId, table.evidenceId] }),
    uniqueIndex("seo_finding_evidence_tenant_position_uq").on(
      table.tenantId,
      table.findingId,
      table.position
    ),
    index("seo_finding_evidence_tenant_evidence_idx").on(table.tenantId, table.evidenceId)
  ]
);

export const seoBaselines = app.table(
  "seo_baselines",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    status: varchar("status", { length: 24 }).notNull(),
    coverage: numeric("coverage", { precision: 5, scale: 4 }).notNull(),
    ruleVersion: varchar("rule_version", { length: 64 }).notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    establishedAt: timestamp("established_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true })
  },
  (table) => [
    index("seo_baselines_tenant_target_status_idx").on(table.tenantId, table.targetId, table.status)
  ]
);

export const seoComparisons = app.table(
  "seo_comparisons",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    baselineId: uuid("baseline_id")
      .notNull()
      .references(() => seoBaselines.id),
    currentRunId: uuid("current_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    status: varchar("status", { length: 24 }).notNull(),
    summary: jsonb("summary").notNull(),
    comparableCoverage: numeric("comparable_coverage", { precision: 5, scale: 4 }).notNull(),
    comparedAt: timestamp("compared_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("seo_comparisons_tenant_baseline_run_uq").on(
      table.tenantId,
      table.baselineId,
      table.currentRunId
    ),
    index("seo_comparisons_tenant_target_compared_idx").on(
      table.tenantId,
      table.targetId,
      table.comparedAt
    )
  ]
);

export const seoKeywords = app.table(
  "seo_keywords",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    locationId: uuid("location_id").references(() => locations.id),
    keyword: varchar("keyword", { length: 255 }).notNull(),
    intent: varchar("intent", { length: 32 }),
    locale: varchar("locale", { length: 16 }).notNull(),
    device: varchar("device", { length: 16 }).notNull().default("desktop"),
    active: boolean("active").notNull().default(true)
  },
  (table) => [
    uniqueIndex("seo_keywords_tenant_target_keyword_locale_uq").on(
      table.tenantId,
      table.targetId,
      table.keyword,
      table.locale,
      table.device
    ),
    index("seo_keywords_tenant_target_active_idx").on(table.tenantId, table.targetId, table.active)
  ]
);

export const seoCompetitors = app.table(
  "seo_competitors",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    name: varchar("name", { length: 160 }).notNull(),
    domain: varchar("domain", { length: 255 }),
    placeId: varchar("place_id", { length: 255 }),
    source: varchar("source", { length: 40 }).notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({})
  },
  (table) => [
    index("seo_competitors_tenant_target_active_idx").on(
      table.tenantId,
      table.targetId,
      table.active
    )
  ]
);

export const seoGeoGridRuns = app.table(
  "seo_geogrid_runs",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => seoTargets.id),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => seoAnalysisRuns.id),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => seoKeywords.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    gridSize: smallint("grid_size").notNull(),
    radiusMeters: integer("radius_meters").notNull(),
    centerLatitude: numeric("center_latitude", { precision: 10, scale: 7 }).notNull(),
    centerLongitude: numeric("center_longitude", { precision: 10, scale: 7 }).notNull(),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    actualCost: numeric("actual_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    status: varchar("status", { length: 24 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("seo_geogrid_runs_tenant_target_observed_idx").on(
      table.tenantId,
      table.targetId,
      table.observedAt
    )
  ]
);

export const seoGeoGridPoints = app.table(
  "seo_geogrid_points",
  {
    ...mutableColumns,
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    geogridRunId: uuid("geogrid_run_id")
      .notNull()
      .references(() => seoGeoGridRuns.id),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    row: smallint("row").notNull(),
    column: smallint("column").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    position: smallint("position"),
    observed: boolean("observed").notNull().default(true)
  },
  (table) => [
    uniqueIndex("seo_geogrid_points_tenant_run_cell_uq").on(
      table.tenantId,
      table.geogridRunId,
      table.row,
      table.column
    ),
    index("seo_geogrid_points_tenant_evidence_idx").on(table.tenantId, table.evidenceId)
  ]
);
