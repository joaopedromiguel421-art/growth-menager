import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
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
    generatedBy: varchar("generated_by", { length: 20 }).notNull()
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
  (table) => [index("tasks_tenant_status_due_idx").on(table.tenantId, table.status, table.dueAt)]
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
    index("approvals_tenant_status_idx").on(table.tenantId, table.status),
    index("approvals_assigned_status_due_idx").on(table.assignedTo, table.status, table.dueAt)
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
