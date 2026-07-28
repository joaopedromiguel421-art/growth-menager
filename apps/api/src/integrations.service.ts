import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AuthorizeRequest,
  AuthorizeResponse,
  ConnectionSummary,
  IntegrationProperty,
  Provider,
  PropertySelection,
  SyncJob
} from "@growth-manager/contracts";
import { parseConfig, type AppConfig } from "@growth-manager/config";
import { schema, type Database, type DatabaseClient } from "@growth-manager/database";
import { DomainError, newId, requirePermission, type TenantContext } from "@growth-manager/domain";
import {
  authorizationUrl,
  createPkcePair,
  createStateToken,
  exchangeCode,
  listAnalyticsProperties,
  listBusinessLocations,
  listSearchConsoleSites,
  refreshAccessToken,
  revokeToken,
  type GoogleOAuthConfig,
  type GoogleProvider,
  type PropertyCandidate
} from "@growth-manager/integrations";
import { DATABASE } from "./database.provider.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const PROPERTY_CACHE_TTL_MS = 15 * 60 * 1000;
const GOOGLE_PROVIDERS = new Set<Provider>(["google_business", "search_console", "ga4"]);

export interface CallbackResult {
  readonly redirectUrl: string;
  readonly tenantId: string;
}

interface ClaimedState extends Record<string, unknown> {
  readonly connection_id: string;
  readonly tenant_id: string;
  readonly provider: string;
  readonly code_verifier: string | null;
  readonly redirect_path: string | null;
}

@Injectable()
export class IntegrationsService {
  private readonly config: AppConfig = parseConfig(process.env);

  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public list(context: TenantContext): Promise<readonly ConnectionSummary[]> {
    requirePermission(context, "connections.read");
    return this.client.withTenant(context, async (database) => {
      const connections = await database
        .select()
        .from(schema.integrationConnections)
        .where(eq(schema.integrationConnections.tenantId, context.tenantId));

      const counts = await database
        .select({
          connectionId: schema.integrationProperties.connectionId,
          total: sql<number>`count(*)::int`
        })
        .from(schema.integrationProperties)
        .where(
          and(
            eq(schema.integrationProperties.tenantId, context.tenantId),
            eq(schema.integrationProperties.selected, true)
          )
        )
        .groupBy(schema.integrationProperties.connectionId);

      const selectedByConnection = new Map(counts.map((row) => [row.connectionId, row.total]));
      return connections.map((row) => ({
        provider: row.provider as Provider,
        status: row.status as ConnectionSummary["status"],
        scopes: row.scopes,
        authorized_at: row.authorizedAt?.toISOString() ?? null,
        expires_at: row.expiresAt?.toISOString() ?? null,
        last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
        error_code: row.errorCode,
        selected_properties: selectedByConnection.get(row.id) ?? 0
      }));
    });
  }

  public authorize(
    context: TenantContext,
    provider: Provider,
    request: AuthorizeRequest
  ): Promise<AuthorizeResponse> {
    requirePermission(context, "connections.manage");
    const googleProvider = this.requireGoogleProvider(provider);
    const oauth = this.oauthConfig(googleProvider);

    const state = createStateToken();
    const pkce = createPkcePair();
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);

    return this.client.withTenant(context, async (database) => {
      const pending = {
        state_hash: hashState(state),
        code_verifier: pkce.verifier,
        redirect_path: request.redirect_path,
        expires_at: expiresAt.toISOString()
      };

      await database
        .insert(schema.integrationConnections)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          provider,
          status: "pending_auth",
          authorizedBy: context.userId,
          metadata: { oauth: pending }
        })
        .onConflictDoUpdate({
          target: [schema.integrationConnections.tenantId, schema.integrationConnections.provider],
          set: {
            status: "pending_auth",
            errorCode: null,
            authorizedBy: context.userId,
            metadata: sql`jsonb_set(
              ${schema.integrationConnections.metadata},
              '{oauth}',
              ${JSON.stringify(pending)}::jsonb,
              true
            )`,
            updatedAt: new Date(),
            version: sql`${schema.integrationConnections.version} + 1`
          }
        });

      return {
        authorization_url: authorizationUrl({
          config: oauth,
          provider: googleProvider,
          state,
          challenge: pkce.challenge
        }),
        state_expires_at: expiresAt.toISOString()
      };
    });
  }

  public async callback(provider: Provider, code: string, state: string): Promise<CallbackResult> {
    const googleProvider = this.requireGoogleProvider(provider);
    const oauth = this.oauthConfig(googleProvider);

    const claimed = await this.claimState(state);
    if (claimed?.provider !== provider) {
      throw new DomainError(
        "GM-OAUTH-STATE-INVALID",
        "A autorização expirou ou já foi usada. Tente conectar novamente.",
        false
      );
    }
    if (claimed.code_verifier === null) {
      throw new DomainError("GM-OAUTH-STATE-INVALID", "Autorização incompleta.", false);
    }

    const context = this.systemContext(claimed.tenant_id);
    try {
      const tokens = await exchangeCode({
        config: oauth,
        code,
        verifier: claimed.code_verifier
      });
      const refreshToken = tokens.refreshToken;
      if (refreshToken === null) {
        throw new DomainError(
          "GM-OAUTH-NO-REFRESH",
          "O Google não devolveu um refresh token. Remova o acesso do app na conta Google e tente de novo.",
          false
        );
      }

      await this.client.withTenant(context, async (database) => {
        const secretRef = await this.storeSecret(database, claimed.connection_id, refreshToken);
        await database
          .update(schema.integrationConnections)
          .set({
            status: "active",
            secretRef,
            scopes: [...tokens.scopes],
            authorizedAt: new Date(),
            expiresAt: tokens.expiresAt,
            errorCode: null,
            consentVersion: "1",
            updatedAt: new Date(),
            version: sql`${schema.integrationConnections.version} + 1`
          })
          .where(eq(schema.integrationConnections.id, claimed.connection_id));
      });
    } catch (error) {
      await this.markFailed(context, claimed.connection_id);
      throw error;
    }

    const path = claimed.redirect_path ?? "/app/connections";
    return {
      redirectUrl: `${this.config.PUBLIC_APP_URL}${path}?connected=${provider}`,
      tenantId: claimed.tenant_id
    };
  }

  public listProperties(
    context: TenantContext,
    provider: Provider
  ): Promise<readonly IntegrationProperty[]> {
    requirePermission(context, "connections.read");
    return this.client.withTenant(context, async (database) => {
      const connection = await this.activeConnection(database, context, provider);
      return this.cachedProperties(database, context, connection, false);
    });
  }

  public refreshProperties(
    context: TenantContext,
    provider: Provider
  ): Promise<readonly IntegrationProperty[]> {
    requirePermission(context, "connections.manage");
    return this.client.withTenant(context, async (database) => {
      const connection = await this.activeConnection(database, context, provider);
      return this.cachedProperties(database, context, connection, true);
    });
  }

  public selectProperties(
    context: TenantContext,
    provider: Provider,
    selection: PropertySelection
  ): Promise<readonly IntegrationProperty[]> {
    requirePermission(context, "connections.manage");
    return this.client.withTenant(context, async (database) => {
      const connection = await this.activeConnection(database, context, provider);
      const candidates = await this.cachedProperties(database, context, connection, false);
      const byId = new Map(candidates.map((candidate) => [candidate.external_id, candidate]));

      const unknown = selection.property_ids.filter((id) => !byId.has(id));
      if (unknown.length > 0) {
        throw new DomainError(
          "GM-INTEGRATION-PROPERTY-UNKNOWN",
          "Uma das propriedades escolhidas não está disponível nesta conta.",
          false
        );
      }

      // Rows are kept rather than deleted so historical metrics keep a valid
      // foreign key; deselecting simply stops future syncs from reading them.
      await database
        .update(schema.integrationProperties)
        .set({ selected: false, updatedAt: new Date() })
        .where(eq(schema.integrationProperties.connectionId, connection.id));

      for (const externalId of selection.property_ids) {
        const candidate = byId.get(externalId);
        if (candidate === undefined) continue;
        await database
          .insert(schema.integrationProperties)
          .values({
            id: newId(),
            connectionId: connection.id,
            tenantId: context.tenantId,
            kind: candidate.kind,
            externalId: candidate.external_id,
            name: candidate.name,
            selected: true
          })
          .onConflictDoUpdate({
            target: [
              schema.integrationProperties.connectionId,
              schema.integrationProperties.kind,
              schema.integrationProperties.externalId
            ],
            set: { selected: true, name: candidate.name, updatedAt: new Date() }
          });
      }

      if (selection.property_ids.length === 0) return [];

      const rows = await database
        .select()
        .from(schema.integrationProperties)
        .where(
          and(
            eq(schema.integrationProperties.connectionId, connection.id),
            inArray(schema.integrationProperties.externalId, [...selection.property_ids])
          )
        );

      return rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenantId,
        kind: row.kind,
        external_id: row.externalId,
        name: row.name,
        selected: row.selected
      }));
    });
  }

  public disconnect(context: TenantContext, provider: Provider): Promise<void> {
    requirePermission(context, "connections.manage");
    return this.client.withTenant(context, async (database) => {
      const connection = await this.connection(database, context, provider);
      if (connection === undefined) return;

      const refreshToken = await this.readSecret(database, connection.id);
      if (refreshToken !== null) {
        await revokeToken(refreshToken);
        await database.execute(sql`select app.delete_integration_secret(${connection.id}::uuid)`);
      }

      await database
        .update(schema.integrationConnections)
        .set({
          status: "revoked",
          secretRef: null,
          scopes: [],
          expiresAt: null,
          updatedAt: new Date(),
          version: sql`${schema.integrationConnections.version} + 1`
        })
        .where(eq(schema.integrationConnections.id, connection.id));

      await database
        .update(schema.integrationProperties)
        .set({ selected: false, updatedAt: new Date() })
        .where(eq(schema.integrationProperties.connectionId, connection.id));
    });
  }

  public requestSync(
    context: TenantContext,
    provider: Provider,
    idempotencyKey: string
  ): Promise<SyncJob> {
    requirePermission(context, "connections.manage");
    return this.client.withTenant(context, async (database) => {
      const connection = await this.activeConnection(database, context, provider);
      const records = await database
        .insert(schema.syncJobs)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          connectionId: connection.id,
          provider,
          jobType: "sync",
          status: "queued",
          idempotencyKey,
          requestedBy: context.userId
        })
        .onConflictDoNothing({
          target: [schema.syncJobs.tenantId, schema.syncJobs.idempotencyKey]
        })
        .returning();

      const job = records[0] ?? (await this.jobByKey(database, context, idempotencyKey));
      if (job === undefined) {
        throw new DomainError("GM-SYNC-ENQUEUE", "Não foi possível agendar a sincronização.", true);
      }

      await database.insert(schema.outboxEvents).values({
        id: newId(),
        tenantId: context.tenantId,
        aggregateType: "integration",
        aggregateId: connection.id,
        eventType: "sync_requested",
        schemaVersion: "1",
        idempotencyKey,
        payload: { provider, sync_job_id: job.id, connection_id: connection.id },
        traceId: context.traceId
      });

      return toSyncJob(job);
    });
  }

  public getSync(context: TenantContext, jobId: string): Promise<SyncJob> {
    requirePermission(context, "connections.read");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .select()
        .from(schema.syncJobs)
        .where(and(eq(schema.syncJobs.id, jobId), eq(schema.syncJobs.tenantId, context.tenantId)))
        .limit(1);
      const job = records[0];
      if (job === undefined) {
        throw new DomainError("GM-SYNC-NOT-FOUND", "Sincronização não encontrada.", false);
      }
      return toSyncJob(job);
    });
  }

  private async claimState(state: string): Promise<ClaimedState | undefined> {
    const rows = await this.client.database.execute<ClaimedState>(
      sql`select * from app.claim_oauth_state(${hashState(state)})`
    );
    return rows[0];
  }

  private async markFailed(context: TenantContext, connectionId: string): Promise<void> {
    await this.client.withTenant(context, async (database) => {
      await database
        .update(schema.integrationConnections)
        .set({
          status: "disconnected",
          errorCode: "GM-OAUTH-EXCHANGE",
          updatedAt: new Date(),
          version: sql`${schema.integrationConnections.version} + 1`
        })
        .where(eq(schema.integrationConnections.id, connectionId));
    });
  }

  private async fetchCandidates(
    provider: GoogleProvider,
    accessToken: string
  ): Promise<readonly PropertyCandidate[]> {
    if (provider === "google_business") return listBusinessLocations(accessToken);
    if (provider === "search_console") return listSearchConsoleSites(accessToken);
    return listAnalyticsProperties(accessToken);
  }

  private async cachedProperties(
    database: Database,
    context: TenantContext,
    connection: typeof schema.integrationConnections.$inferSelect,
    forceRefresh: boolean
  ): Promise<readonly IntegrationProperty[]> {
    const stored = await database
      .select()
      .from(schema.integrationProperties)
      .where(eq(schema.integrationProperties.connectionId, connection.id));
    const refreshedAt = connection.propertiesRefreshedAt?.getTime() ?? 0;
    const cacheFresh = Date.now() - refreshedAt < PROPERTY_CACHE_TTL_MS;
    if (!forceRefresh && cacheFresh) return stored.map(toIntegrationProperty);

    const googleProvider = this.requireGoogleProvider(connection.provider as Provider);
    const accessToken = await this.accessToken(database, connection);
    const candidates = await this.fetchCandidates(googleProvider, accessToken);
    const selectedIds = new Set(
      stored.filter((property) => property.selected).map((property) => property.externalId)
    );

    if (candidates.length > 0) {
      await database
        .insert(schema.integrationProperties)
        .values(
          candidates.map((candidate) => ({
            id: newId(),
            connectionId: connection.id,
            tenantId: context.tenantId,
            kind: candidate.kind,
            externalId: candidate.externalId,
            name: candidate.name,
            selected: selectedIds.has(candidate.externalId)
          }))
        )
        .onConflictDoUpdate({
          target: [
            schema.integrationProperties.connectionId,
            schema.integrationProperties.kind,
            schema.integrationProperties.externalId
          ],
          set: { name: sql`excluded.name`, updatedAt: new Date() }
        });
    }

    await database
      .update(schema.integrationConnections)
      .set({ propertiesRefreshedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.integrationConnections.id, connection.id),
          eq(schema.integrationConnections.tenantId, context.tenantId)
        )
      );

    const refreshed = await database
      .select()
      .from(schema.integrationProperties)
      .where(eq(schema.integrationProperties.connectionId, connection.id));
    return refreshed.map(toIntegrationProperty);
  }

  /**
   * Google access tokens live about an hour, so every call mints a fresh one from
   * the stored refresh token instead of caching a value that is usually expired.
   */
  private async accessToken(
    database: Database,
    connection: typeof schema.integrationConnections.$inferSelect
  ): Promise<string> {
    const refreshToken = await this.readSecret(database, connection.id);
    if (refreshToken === null) {
      throw new DomainError(
        "GM-INTEGRATION-NO-CREDENTIAL",
        "Esta conexão não tem credencial válida. Reconecte o provedor.",
        false
      );
    }
    const googleProvider = this.requireGoogleProvider(connection.provider as Provider);
    const tokens = await refreshAccessToken({
      config: this.oauthConfig(googleProvider),
      refreshToken
    });
    return tokens.accessToken;
  }

  private async storeSecret(
    database: Database,
    connectionId: string,
    secret: string
  ): Promise<string> {
    const rows = await database.execute<{ readonly store_integration_secret: string }>(
      sql`select app.store_integration_secret(${connectionId}::uuid, ${secret})`
    );
    const ref = rows[0]?.store_integration_secret;
    if (ref === undefined) {
      throw new DomainError(
        "GM-INTEGRATION-SECRET",
        "Não foi possível guardar a credencial.",
        true
      );
    }
    return ref;
  }

  private async readSecret(database: Database, connectionId: string): Promise<string | null> {
    const rows = await database.execute<{ readonly read_integration_secret: string | null }>(
      sql`select app.read_integration_secret(${connectionId}::uuid)`
    );
    return rows[0]?.read_integration_secret ?? null;
  }

  private async connection(
    database: Database,
    context: TenantContext,
    provider: Provider
  ): Promise<typeof schema.integrationConnections.$inferSelect | undefined> {
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
    return rows[0];
  }

  private async activeConnection(
    database: Database,
    context: TenantContext,
    provider: Provider
  ): Promise<typeof schema.integrationConnections.$inferSelect> {
    const connection = await this.connection(database, context, provider);
    if (connection?.status !== "active") {
      throw new DomainError(
        "GM-INTEGRATION-NOT-CONNECTED",
        "Conecte este provedor antes de continuar.",
        false
      );
    }
    return connection;
  }

  private async jobByKey(
    database: Database,
    context: TenantContext,
    idempotencyKey: string
  ): Promise<typeof schema.syncJobs.$inferSelect | undefined> {
    const rows = await database
      .select()
      .from(schema.syncJobs)
      .where(
        and(
          eq(schema.syncJobs.tenantId, context.tenantId),
          eq(schema.syncJobs.idempotencyKey, idempotencyKey)
        )
      )
      .orderBy(desc(schema.syncJobs.createdAt))
      .limit(1);
    return rows[0];
  }

  private requireGoogleProvider(provider: Provider): GoogleProvider {
    if (!GOOGLE_PROVIDERS.has(provider)) {
      throw new DomainError(
        "GM-INTEGRATION-UNSUPPORTED",
        "Este provedor ainda não está disponível.",
        false
      );
    }
    return provider as GoogleProvider;
  }

  private oauthConfig(provider: GoogleProvider): GoogleOAuthConfig {
    if (this.config.GOOGLE_CLIENT_ID === "not-configured") {
      throw new DomainError(
        "GM-INTEGRATION-NOT-CONFIGURED",
        "As credenciais OAuth do Google não estão configuradas neste ambiente.",
        false
      );
    }
    return {
      clientId: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      // Google validates the redirect URI byte for byte against the console entry,
      // so it is derived from one place and never from the incoming request.
      redirectUri: `${this.config.API_BASE_URL}/v1/integrations/${provider}/callback`
    };
  }

  /**
   * The OAuth callback arrives without a session, so the write that finalises the
   * connection runs as the system actor for the tenant the state resolved to.
   */
  private systemContext(tenantId: string): TenantContext {
    return {
      tenantId,
      userId: "",
      authUserId: "",
      organizationId: "",
      requestId: newId(),
      traceId: newId(),
      permissions: new Set(),
      systemActor: true
    };
  }
}

function toIntegrationProperty(
  property: typeof schema.integrationProperties.$inferSelect
): IntegrationProperty {
  return {
    id: property.id,
    tenant_id: property.tenantId,
    kind: property.kind,
    external_id: property.externalId,
    name: property.name,
    selected: property.selected
  };
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function toSyncJob(job: typeof schema.syncJobs.$inferSelect): SyncJob {
  return {
    id: job.id,
    provider: job.provider as Provider,
    job_type: job.jobType,
    status: job.status,
    records_read: job.recordsRead,
    records_written: job.recordsWritten,
    records_rejected: job.recordsRejected,
    started_at: job.startedAt?.toISOString() ?? null,
    finished_at: job.finishedAt?.toISOString() ?? null,
    created_at: job.createdAt.toISOString()
  };
}
