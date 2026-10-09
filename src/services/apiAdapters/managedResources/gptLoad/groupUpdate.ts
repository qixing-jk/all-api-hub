import {
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  GptLoadGroupDetail,
  GptLoadNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/gptLoad/nativeContracts"
import {
  gptLoadChannelEffect,
  runGptLoadMutation,
} from "~/services/apiAdapters/managedSites/gptLoad/gptLoadMutation"
import {
  deleteGptLoadGroupCredential,
  importGptLoadGroupCredentials,
  updateGptLoadGroupModels,
  updateGptLoadGroupSettings,
} from "~/services/apiService/gptLoad"
import { type GptLoadConfig } from "~/types/gptLoadConfig"

/** Owns ordered group settings, credential replacement and model updates. */
export function createGptLoadGroupUpdate(
  config: GptLoadConfig,
  readDetail: (
    locator: number,
    options?: ResourceOperationOptions,
  ) => Promise<GptLoadGroupDetail>,
): GptLoadNativeResourceOperations["update"] {
  return async (detail, command, operationOptions) => {
    if (operationOptions?.signal?.aborted) {
      throw (
        operationOptions.signal.reason ??
        new DOMException("Aborted", "AbortError")
      )
    }
    const groupId = detail.group.id

    const steps: (() => Promise<unknown>)[] = []
    const patch: {
      name?: string
      params?: Record<string, unknown>
      enabled?: boolean
      priceMultiplier?: string
      weightManual?: number | null
    } = {}
    if (command.name !== detail.group.name) patch.name = command.name
    if (command.baseUrl !== detail.group.baseUrl) {
      patch.params = command.baseUrl ? { base_url: command.baseUrl } : {}
    }
    const enabledChanged =
      command.enabled !== undefined && command.enabled !== detail.group.enabled
    if (enabledChanged) patch.enabled = command.enabled
    if (command.priceMultiplier !== detail.group.priceMultiplier) {
      patch.priceMultiplier = command.priceMultiplier
    }
    if (command.weight !== null && command.weight !== detail.group.weight) {
      patch.weightManual = command.weight
    }
    if (Object.keys(patch).length > 0) {
      steps.push(() =>
        updateGptLoadGroupSettings(config, groupId, patch, {
          signal: operationOptions?.signal,
        }).then(() => {}),
      )
    }

    const existingIds = new Set(
      detail.credentials.map((credential) => credential.credential_id),
    )
    // The editor's secret-list carries one entry per row. A row whose secret
    // is "unchanged" keeps its gateway credential; a "replace" row is a new
    // key (typed over a saved row or added fresh) and must be imported; a
    // saved row absent from the entries was removed and must be deleted.
    const entries = command.credentialPatch?.entries ?? []
    const entryIds = new Set(
      entries.map((entry) => entry.id).filter((id) => id && id !== "new"),
    )
    const importKeys = entries
      .map((entry) =>
        entry.secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
          ? entry.secret.value.trim()
          : "",
      )
      .filter(Boolean)
    const deleteIds = (command.credentialPatch ? [...existingIds] : []).filter(
      (id) =>
        !entryIds.has(String(id)) ||
        entries.some(
          (entry) =>
            entry.id === String(id) &&
            entry.secret.kind ===
              MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        ),
    )

    if (importKeys.length > 0) {
      steps.push(() =>
        importGptLoadGroupCredentials(config, groupId, importKeys, {
          signal: operationOptions?.signal,
        }).then(() => {}),
      )
    }
    for (const credentialId of deleteIds) {
      steps.push(() =>
        deleteGptLoadGroupCredential(config, groupId, credentialId, {
          signal: operationOptions?.signal,
        }).then(() => {}),
      )
    }

    const oldModelSet = new Set(detail.models)
    const newModelSet = new Set(command.models)
    const modelChanged =
      oldModelSet.size !== newModelSet.size ||
      [...oldModelSet].some((model) => !newModelSet.has(model))
    if (modelChanged) {
      steps.push(() =>
        updateGptLoadGroupModels(config, groupId, command.models, {
          signal: operationOptions?.signal,
        }).then(() => {}),
      )
    }

    return await runGptLoadMutation<GptLoadGroupDetail>({
      effect: gptLoadChannelEffect("resource-updated", groupId),
      steps,
      execute: async () => {
        const updated = await readDetail(groupId, operationOptions)
        return updated
      },
    })
  }
}
