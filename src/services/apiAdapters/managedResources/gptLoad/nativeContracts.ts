import {
  type ResourceFieldOption,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ResourceSecretListEntry } from "~/services/apiAdapters/contracts/resourceNative"
import { type GptLoadSanitizedGroup } from "~/services/apiService/gptLoad/redaction"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import type { GptLoadCredential } from "~/types/gptLoad"
import { type GptLoadConfig } from "~/types/gptLoadConfig"

/** Editor credential row (id + masked/plaintext value + per-row fields). */
export type CredentialRecord = {
  id: string
  key: string
  fields: Record<string, string>
}

/**
 * Native gpt-load channel workspace backing one group.
 *
 * Deliberate non-features, recorded next to the code they constrain (contract
 * verified against a live v2 control plane on 2026-10-03):
 * - A group owns a credential *pool*, so the editor's key field is a secret
 *   list: rows are added through the gateway's import route and removed through
 *   per-credential DELETE. Plaintext is per-row reveal only; the list is always
 *   masked.
 * - Editing replaces a saved row by importing its new value and deleting the
 *   old row, because the gateway's single-row credential PUT expects the
 *   channel-specific credential object whose field key is descriptor-driven.
 * - The `channel_id` is read-only while editing: repointing a group at another
 *   channel type (`PUT /api/groups/:id/channel`) clears the credential pool
 *   the gateway bound to the previous driver, so the editor does not offer it.
 * - No batch model auto-sync capability is registered; per-group model lists
 *   are edited in place through the workspace (models are written with
 *   `PUT /api/groups/:id/models`).
 * - Import uses `POST /api/groups` (single-step, no gateway reachability check
 *   of the source) exactly like the gateway's own UI, so import success does
 *   not depend on the gateway reaching the source.
 */

export type GptLoadNativeConfig = {
  config: GptLoadConfig
  scopeKey: string
}

/** A group with the read state the native workspace renders. */
export interface GptLoadGroupDetail {
  group: GptLoadSanitizedGroup
  models: readonly string[]
  credentials: readonly GptLoadCredential[]
}

export interface GptLoadGroupCommand {
  name: string
  channelId: string
  baseUrl: string
  models: readonly string[]
  priceMultiplier: string
  enabled?: boolean
  weight?: number | null
}

/**
 * The composed editor's command: the base scalars plus the credential-pool
 * shot. `credentialPatch.entries` is the authoritative full list (the base
 * buildCommand only ever sees the first row's scalar secret).
 */
export type GptLoadGroupEditorCommand = GptLoadGroupCommand & {
  credentialPatch?: {
    baseline: string
    entries: readonly ResourceSecretListEntry[]
  }
}

export type GptLoadNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: GptLoadGroupDetail[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<GptLoadGroupDetail>
  loadChannelOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  loadModelOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<CredentialRecord[]>
  create(
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<GptLoadGroupDetail>>
  update(
    detail: GptLoadGroupDetail,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<GptLoadGroupDetail>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}
