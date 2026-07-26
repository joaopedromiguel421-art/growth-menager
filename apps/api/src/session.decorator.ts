import { SetMetadata } from "@nestjs/common";

export const IS_SESSION_SCOPED_KEY = "isSessionScoped";

/**
 * Marks a route that requires a verified Supabase token but no tenant context.
 * Used by identity routes that exist precisely to discover which tenants the
 * caller may enter, so demanding a tenant up front would be circular.
 */
export const SessionScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_SESSION_SCOPED_KEY, true);
