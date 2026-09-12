import { NEW_API_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/newApi"
import {
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NewApiChannel } from "~/types/newApi"
import type { NewApiChannelCommand } from "~/types/newApiChannelEditor"

import {
  credentialFingerprint,
  withCredentialListEditor,
} from "./credentialListEditor"
import type { NativeResourceEditorDefinition } from "./factory"

/** New API's multi-key parser accepts newline keys and JSON credential arrays. */
export function newApiCredentialRecords(
  secret: string,
  detail?: NewApiChannel,
) {
  let keys: string[]
  if (secret.trim().startsWith("[")) {
    let value: unknown
    try {
      value = JSON.parse(secret)
    } catch {
      throw new ManagedResourceError({ code: "validation_failed" })
    }
    if (!Array.isArray(value))
      throw new ManagedResourceError({ code: "validation_failed" })
    keys = value.map((key) =>
      typeof key === "string" ? key : JSON.stringify(key),
    )
  } else
    keys = secret
      .trim()
      .split("\n")
      .map((key) => key.trim())
      .filter(Boolean)
  return keys.map((key, index) => ({
    id: String(index),
    key,
    fields: {
      status: String(detail?.channel_info?.multi_key_status_list?.[index] ?? 1),
      reason: detail?.channel_info?.multi_key_disabled_reason?.[index] ?? "",
      enabled: String(
        (detail?.channel_info?.multi_key_status_list?.[index] ?? 1) === 1,
      ),
    },
  }))
}

/** Non-secret channel metadata is sufficient to render and edit native key slots. */
export function newApiKeyMetadata(detail: NewApiChannel) {
  return Array.from(
    { length: detail.channel_info?.multi_key_size ?? 0 },
    (_, index) => ({
      id: String(index),
      key: "********",
      fields: {
        status: String(
          detail.channel_info?.multi_key_status_list?.[index] ?? 1,
        ),
        reason: detail.channel_info?.multi_key_disabled_reason?.[index] ?? "",
        enabled: String(
          (detail.channel_info?.multi_key_status_list?.[index] ?? 1) === 1,
        ),
      },
    }),
  )
}

/** The upstream exposes indices, not stable key identities or a revision token. */
export const newApiKeyMetadataFingerprint = (
  records: Parameters<typeof credentialFingerprint>[0],
) => credentialFingerprint(records.map((record) => ({ ...record, key: "" })))

/** Single-key edits retain their native semantics; multi-key creation is explicit in the wire mode. */
export async function withNewApiMultiKeyEditor(
  base: NativeResourceEditorDefinition<NewApiChannelCommand>,
  detail?: NewApiChannel,
  loadSecret?: (options?: ResourceOperationOptions) => Promise<string>,
  _options?: ResourceOperationOptions,
): Promise<NativeResourceEditorDefinition<NewApiChannelCommand>> {
  if (detail && !detail.channel_info?.is_multi_key) return base
  const records = detail ? newApiKeyMetadata(detail) : []
  // Match the native disclosure UI: one explicit read per open editor, never on mount.
  // https://github.com/QuantumNous/new-api/blob/main/web/src/features/channels/hooks/use-channel-key-disclosure.ts
  let disclosed: ReturnType<typeof newApiCredentialRecords> | undefined
  const readRecords = loadSecret
    ? async (loadOptions?: ResourceOperationOptions) => {
        loadOptions?.signal?.throwIfAborted()
        if (disclosed) return disclosed
        const loaded = newApiCredentialRecords(
          await loadSecret(loadOptions),
          detail,
        )
        loadOptions?.signal?.throwIfAborted()
        disclosed = loaded
        return loaded
      }
    : undefined
  const list = await withCredentialListEditor(
    base,
    fields.Key,
    records,
    Boolean(detail),
    readRecords,
    detail ? [{ fieldId: "enabled", type: "boolean" }] : [],
    detail ? newApiKeyMetadataFingerprint : undefined,
  )
  const mode = detail?.channel_info?.multi_key_mode || "random"
  return {
    ...list,
    fields: [
      ...list.fields,
      {
        fieldId: "multiKeyMode",
        type: "select",
        options: [
          { value: "random" },
          { value: "polling" },
          ...(!["random", "polling"].includes(mode) ? [{ value: mode }] : []),
        ],
      },
    ],
    initialValues: { ...list.initialValues, multiKeyMode: mode },
    validate: (values) => {
      if (
        !["random", "polling", mode].includes(
          String(values.multiKeyMode ?? mode),
        )
      )
        return {
          valid: false,
          issues: [{ fieldId: "multiKeyMode", code: "unsupported_option" }],
        }
      return list.validate(values)
    },
    buildCommand: (values) => {
      const command = list.buildCommand(values)
      const nextMode = String(values.multiKeyMode ?? mode)
      return {
        ...command,
        ...(detail && command.credentialPatch
          ? {
              ...(disclosed
                ? { disclosedKeys: disclosed.map((record) => record.key) }
                : {}),
              credentialPatch: {
                ...command.credentialPatch,
                entries: command.credentialPatch.entries.map((entry) => ({
                  ...entry,
                  fields: {
                    ...entry.fields,
                    enabled:
                      entry.fields.enabled ??
                      records.find((record) => record.id === entry.id)?.fields
                        .enabled ??
                      "true",
                  },
                })),
              },
            }
          : {}),
        ...((!detail && (command.credentialPatch?.entries.length ?? 0) > 1) ||
        (detail && nextMode !== mode)
          ? { multiKeyMode: nextMode }
          : {}),
      }
    },
  }
}
