import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  newApiCredentialRecords,
  newApiKeyMetadata,
  newApiKeyMetadataFingerprint,
} from "~/services/apiAdapters/managedResources/newApi/multiKeyEditor"
import type { NewApiNativeConfig } from "~/services/apiAdapters/managedResources/newApi/nativeConfig"
import { newApiChannelOperations } from "~/services/apiAdapters/managedResources/newApi/operations"
import { throwIfNewApiResourceOperationAborted } from "~/services/apiAdapters/managedResources/newApi/resourceUtils"
import { attributeCreatedNativeResource } from "~/services/apiAdapters/managedResources/shared/createAttribution"
import { resolveCredentialPatch } from "~/services/apiAdapters/managedResources/shared/credentialListEditor"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations/contracts"
import { buildChannelPayload } from "~/services/managedSites/providers/newApi"
import {
  buildNewApiAdvancedPayload,
  buildNewApiUpdatePayload,
  hasNewApiAdvancedValues,
} from "~/services/managedSites/providers/newApi/newApiChannelPayload"
import type { NewApiChannel, UpdateChannelPayload } from "~/types/newApi"
import type { NewApiChannelCommand } from "~/types/newApiChannelEditor"

const channels = newApiChannelOperations

const listCompleteChannelInventory = async (
  nativeConfig: NewApiNativeConfig,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const result = await channels.list(nativeConfig.config, {
    ...options,
    requireCompleteInventory: true,
  })
  throwIfNewApiResourceOperationAborted(options)
  return result
}

export const createChannel = async (
  nativeConfig: NewApiNativeConfig,
  draft: NewApiChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  if (draft.credentialPatch) {
    const keys = await resolveCredentialPatch(draft.credentialPatch, [])
    draft = { ...draft, key: keys.map(({ key }) => key).join("\n") }
  }
  const basePayload = buildChannelPayload(draft)
  if (draft.credentialPatch && draft.credentialPatch.entries.length > 1) {
    basePayload.mode = "multi_to_single"
    basePayload.multi_key_mode = draft.multiKeyMode ?? "random"
  }
  const result = await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.NEW_API}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items,
    create: async () =>
      await channels.create(
        nativeConfig.config,
        {
          ...basePayload,
          channel: {
            ...basePayload.channel,
            ...buildNewApiAdvancedPayload({}, draft.advanced),
          },
        },
        options,
      ),
    identity: (item) => item.id,
  })
  return await verifyAdvancedSave(nativeConfig, draft, result, options)
}

const applyUpdate = (
  detail: NewApiChannel,
  command: UpdateChannelPayload,
  confirmedEffects: readonly { kind: string }[],
) => {
  const statusConfirmed = confirmedEffects.some(
    (effect) =>
      effect.kind === MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
  )
  return {
    ...detail,
    ...command,
    group: command.group ?? detail.group,
    status:
      command.status === undefined || !statusConfirmed
        ? detail.status
        : command.status,
  } as NewApiChannel
}

// Settings and model-detection fields can be ignored by older servers. Reread
// edits before reporting success; never suggest retrying a confirmed creation.
const verifyAdvancedSave = async (
  nativeConfig: NewApiNativeConfig,
  command: NewApiChannelCommand,
  result: ManagedSiteMutationResult<NewApiChannel>,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  if (
    (!command.advanced && !command.credentialPatch && !command.multiKeyMode) ||
    result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
  )
    return result
  try {
    const saved = await channels.get(
      nativeConfig.config,
      result.data.id,
      options,
    )
    // Read back non-secret state only. Saving must not implicitly disclose keys.
    const entries = command.credentialPatch?.entries
    const keysMatch =
      !entries ||
      (entries.length === 1 && !saved.channel_info?.is_multi_key) ||
      (saved.channel_info?.multi_key_size === entries.length &&
        entries.every(
          (entry, index) =>
            entry.fields.enabled === undefined ||
            String(
              (saved.channel_info?.multi_key_status_list?.[index] ?? 1) === 1,
            ) === entry.fields.enabled,
        ))
    if (
      keysMatch &&
      (!command.multiKeyMode ||
        (command.credentialPatch?.entries.length === 1 &&
          !saved.channel_info?.is_multi_key) ||
        saved.channel_info?.multi_key_mode === command.multiKeyMode) &&
      (!command.advanced || hasNewApiAdvancedValues(saved, command.advanced))
    )
      return { ...result, data: saved }
  } catch {
    /* The write was dispatched; preserve uncertainty and confirmed effects. */
  }
  const diagnostic = {
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  }
  const [firstConfirmedEffect, ...restConfirmedEffects] =
    result.confirmedEffects
  if (!firstConfirmedEffect)
    return { outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain, diagnostic }
  return {
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
    completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
    confirmedEffects: [firstConfirmedEffect, ...restConfirmedEffects],
    diagnostic,
  }
}

export const updateChannel = async (
  nativeConfig: NewApiNativeConfig,
  detail: NewApiChannel,
  command: NewApiChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  const payload = buildNewApiUpdatePayload(detail, command)
  const keyActions: {
    action: "delete_key" | "enable_key" | "disable_key"
    index: number
  }[] = []
  let keyState: number[] | undefined
  let verificationCommand = command
  if (command.multiKeyMode) payload.multi_key_mode = command.multiKeyMode
  if (command.credentialPatch) {
    if (!detail.channel_info?.is_multi_key)
      throw new ManagedResourceError({ code: "resource_changed" })
    const metadata = newApiKeyMetadata(detail)
    const patch = command.credentialPatch
    if ((await newApiKeyMetadataFingerprint(metadata)) !== patch.baseline)
      throw new ManagedResourceError({ code: "resource_changed" })
    const entries = patch.entries
    const retained = entries.filter((entry) =>
      metadata.some((record) => record.id === entry.id),
    )
    const added = entries.filter(
      (entry) => !metadata.some((record) => record.id === entry.id),
    )
    if (
      retained.some((record, index) => {
        const previousRecord = retained[index - 1]
        return (
          index > 0 &&
          previousRecord !== undefined &&
          Number(record.id) <= Number(previousRecord.id)
        )
      }) ||
      [...retained, ...added].some((record, index) => {
        const entry = entries[index]
        return entry === undefined || record.id !== entry.id
      })
    )
      throw new ManagedResourceError({ code: "validation_failed" })
    const replacesAll = entries.every(
      (entry) => entry.secret.kind === "replace",
    )
    const replacesRetained = retained.some(
      (entry) => entry.secret.kind === "replace",
    )
    // Native append and indexed actions preserve unread keys on the server.
    // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go
    if (replacesAll) {
      payload.key = entries
        .map((entry) =>
          entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
        )
        .join("\n")
      payload.key_mode = "replace"
    } else if (!replacesRetained || !command.disclosedKeys) {
      const unchanged = retained.filter(
        (entry) => entry.secret.kind === "unchanged",
      )
      const appended = [
        ...retained.filter((entry) => entry.secret.kind === "replace"),
        ...added,
      ]
      const newKeys = appended.map((entry) =>
        entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
      )
      if (
        newKeys.some((key) => !key) ||
        new Set(newKeys).size !== newKeys.length
      )
        throw new ManagedResourceError({ code: "validation_failed" })
      if (newKeys.length) {
        payload.key = newKeys.join("\n")
        payload.key_mode = "append"
      }
      // Confirm the native append (which may deduplicate) before any indexed writes.
      keyState = [
        ...metadata.map((record) => Number(record.fields.status)),
        ...appended.map(() => 1),
      ]
      for (const [index, entry] of [...unchanged, ...appended].entries()) {
        const nativeIndex =
          index < unchanged.length
            ? Number(entry.id)
            : metadata.length + index - unchanged.length
        const enabled = entry.fields.enabled !== "false"
        if (enabled !== (keyState[nativeIndex] === 1)) {
          keyActions.push({
            action: enabled ? "enable_key" : "disable_key",
            index: nativeIndex,
          })
        }
      }
      // New keys are in place and configured before old slots are removed.
      for (const record of [...metadata].reverse())
        if (!unchanged.some((entry) => entry.id === record.id))
          keyActions.push({ action: "delete_key", index: Number(record.id) })
      verificationCommand = {
        ...command,
        credentialPatch: { ...patch, entries: [...unchanged, ...appended] },
      }
    } else {
      if (replacesRetained) {
        const secret = command.disclosedKeys.join("\n")
        const current = newApiCredentialRecords(secret, detail)
        if ((await newApiKeyMetadataFingerprint(current)) !== patch.baseline)
          throw new ManagedResourceError({ code: "resource_changed" })
        payload.key = [
          ...current.map((record) => {
            const edit = entries.find((entry) => entry.id === record.id)
            return edit?.secret.kind === "replace"
              ? edit.secret.value.trim()
              : record.key
          }),
          ...added.map((entry) =>
            entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
          ),
        ].join("\n")
        payload.key_mode = "replace"
      } else if (added.length) {
        payload.key = added
          .map((entry) =>
            entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
          )
          .join("\n")
        payload.key_mode = "append"
      }
      for (const record of [...metadata].reverse())
        if (!entries.some((entry) => entry.id === record.id))
          keyActions.push({ action: "delete_key", index: Number(record.id) })
    }
    if (!keyState)
      entries.forEach((entry, index) => {
        const old = metadata.find((record) => record.id === entry.id)
        if (
          entry.fields.enabled !== undefined &&
          entry.fields.enabled !==
            (replacesAll
              ? metadata[index]?.fields.enabled ?? "true"
              : old?.fields.enabled ?? "true")
        )
          keyActions.push({
            action:
              entry.fields.enabled === "false" ? "disable_key" : "enable_key",
            index,
          })
      })
  }
  const result = keyState
    ? await channels.update(
        nativeConfig.config,
        payload,
        options,
        keyActions,
        keyState,
      )
    : keyActions.length
      ? await channels.update(nativeConfig.config, payload, options, keyActions)
      : await channels.update(nativeConfig.config, payload, options)
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return await verifyAdvancedSave(
      nativeConfig,
      verificationCommand,
      {
        ...result,
        data: applyUpdate(detail, payload, result.confirmedEffects),
      },
      options,
    )
  }
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    const { data: _data, ...rest } = result
    return {
      ...rest,
      data: applyUpdate(detail, payload, result.confirmedEffects),
    }
  }
  return result
}

/** Opens the provider-owned native channel operations used by UI and migration. */
