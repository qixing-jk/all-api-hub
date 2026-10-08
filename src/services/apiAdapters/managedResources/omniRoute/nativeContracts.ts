import {
  type ResourceFieldOption,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type OmniRouteConnectionUpdatePayload } from "~/services/apiService/omniroute"
import { type OmniRouteSanitizedConnection } from "~/services/apiService/omniroute/redaction"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import { type OmniRouteConfig } from "~/types/omnirouteConfig"

/**
 * Native OmniRoute channel workspace backing one provider connection.
 *
 * Deliberate non-features, recorded next to the code they constrain (upstream
 * contract verified against the `release/v3.8.51` line on 2026-09-29):
 * - No per-channel model list. Models come from the gateway's provider
 *   catalogue plus gateway-level aliases and a disabled list; a connection only
 *   stores `defaultModel`. There is no write target for AAH's channel model
 *   sync, so this adapter registers no `models` capability.
 * - No gateway API-key workspace. AAH's only managed resource kind is
 *   `Channel`; keys stay reachable through the console route instead.
 * - Import never uses `/api/providers/bulk` or `/api/providers/import`: both
 *   validate every key against the source from the gateway, which would make
 *   the gateway's outbound reachability part of import success. Single
 *   `POST /api/providers` performs no reachability check, so AAH's own
 *   credential verification stays authoritative.
 * - The create editor exposes no status. The create route does not accept
 *   `isActive` and always persists `false`, then fire-and-forgets its own
 *   connection test; status is only editable afterwards.
 * - The import draft's `enabled` flag is not carried: the gateway owns the
 *   initial state for the reason above.
 *
 * Live-validation status: reading the connection inventory, a single-step
 * create with a connection-level `baseUrl`, reading one connection back, the
 * credential-visibility matrix, and delete were exercised against a real
 * deployment while the contract was researched (see
 * `.scratch/router-gateway-sites/research.md`). The partial-update path, the
 * node-backed create, the secret read, and every extension UI flow have only
 * been exercised against mocks, so treat those as unverified on a live
 * deployment.
 */

export type OmniRouteNativeConfig = {
  config: OmniRouteConfig
  scopeKey: string
}

export type OmniRouteNativeCreateCommand = {
  provider: string
  name: string
  apiKey: string
  baseUrl: string
  defaultModel: string
  prefix: string
}

export type OmniRouteNativeUpdateCommand = OmniRouteConnectionUpdatePayload

export type OmniRouteNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: OmniRouteSanitizedConnection[]; total: number }>
  get(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<OmniRouteSanitizedConnection>
  loadSecret(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<string>
  loadProviderOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  create(
    command: OmniRouteNativeCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>>
  update(
    sanitized: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>>
  delete(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}
