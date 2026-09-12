import {
  ManagedResourceError,
  type EditableResourceProjection,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  ResourceSecretListDescriptor,
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"

import type { NativeResourceEditorDefinition } from "./factory"

type CredentialRecord = {
  id: string
  key: string
  fields: Record<string, string>
}

export type CredentialListPatch = {
  baseline: string
  entries: readonly ResourceSecretListEntry[]
}

const invalid = () => new ManagedResourceError({ code: "validation_failed" })

/** Fingerprints stay private to commands; raw saved secrets never enter projections. */
export async function credentialFingerprint(
  records: readonly CredentialRecord[],
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(records.map(({ id, key }) => [id, key])),
  )
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Resolve replacement lists only against the authoritative submission-time keys. */
export async function resolveCredentialPatch(
  patch: CredentialListPatch,
  records: readonly CredentialRecord[],
) {
  if ((await credentialFingerprint(records)) !== patch.baseline)
    throw new ManagedResourceError({ code: "resource_changed" })
  return patch.entries.map((entry) => {
    const saved = records.find(({ id }) => id === entry.id)
    const key =
      entry.secret.kind === "replace" ? entry.secret.value.trim() : saved?.key
    if (!hasUsableManagedSiteChannelKey(key) || entry.secret.kind === "clear")
      throw invalid()
    return {
      id: entry.id,
      key: key!,
      fields: { ...saved?.fields, ...entry.fields },
    }
  })
}

/** Add independent credential rows while preserving the provider's ordinary editor. */
export async function withCredentialListEditor<T extends object>(
  base: NativeResourceEditorDefinition<T>,
  fieldId: string,
  records: readonly CredentialRecord[],
  editing: boolean,
  loadRecords?: (
    options?: ResourceOperationOptions,
  ) => Promise<readonly CredentialRecord[]>,
  entryFields: ResourceSecretListDescriptor["entryFields"] = [],
  fingerprint = credentialFingerprint,
): Promise<
  NativeResourceEditorDefinition<T & { credentialPatch?: CredentialListPatch }>
> {
  const baseline = await fingerprint(records)
  const initial: ResourceSecretListValue = {
    kind: "secret-list",
    entries: editing
      ? records.map(({ id, fields }) => ({
          id,
          fields,
          secret: { kind: "unchanged" },
        }))
      : [{ id: "new", fields: {}, secret: { kind: "replace", value: "" } }],
  }
  const rows = (
    values: EditableResourceProjection,
  ): readonly ResourceSecretListEntry[] => {
    const value = values[fieldId]
    if (value && typeof value === "object" && "kind" in value) {
      if (value.kind === "secret-list") return value.entries
      // Import seeds and existing scalar callers still represent one explicit key.
      if (value.kind === "replace")
        return [{ id: records[0]?.id ?? "new", fields: {}, secret: value }]
      if (value.kind === "unchanged") return initial.entries
    }
    throw invalid()
  }
  const isList = (values: EditableResourceProjection) => {
    const value = values[fieldId]
    return Boolean(
      value &&
        typeof value === "object" &&
        "kind" in value &&
        value.kind === "secret-list",
    )
  }
  const scalarValues = (values: EditableResourceProjection) => {
    if (!isList(values)) return values
    const first = rows(values)[0]
    return {
      ...values,
      [fieldId]: editing
        ? { kind: "unchanged" as const }
        : first?.secret ?? { kind: "unchanged" as const },
    }
  }
  const validateRows = (entries: readonly ResourceSecretListEntry[]) => {
    if (
      !entries.length ||
      new Set(entries.map(({ id }) => id)).size !== entries.length
    )
      throw invalid()
    for (const entry of entries) {
      if (
        !entry.id ||
        !entry.fields ||
        Object.values(entry.fields).some((value) => typeof value !== "string")
      )
        throw invalid()
      for (const field of entryFields) {
        const value = entry.fields[field.fieldId]
        if (
          field.type === "boolean" &&
          value !== undefined &&
          value !== "true" &&
          value !== "false"
        )
          throw invalid()
      }
      if (entry.secret.kind === "replace") {
        if (!entry.secret.value.trim() || /[\r\n]/.test(entry.secret.value))
          throw invalid()
      } else if (
        entry.secret.kind !== "unchanged" ||
        !records.some(({ id }) => id === entry.id)
      )
        throw invalid()
    }
  }
  return {
    ...base,
    fields: base.fields.map((field) =>
      field.fieldId === fieldId
        ? {
            fieldId,
            required: !editing,
            type: "secret-list",
            minEntries: 1,
            entryFields,
            savedEntries: records.map(({ id, key }) => ({
              id,
              secretState: hasUsableManagedSiteChannelKey(key)
                ? "available"
                : key
                  ? "masked"
                  : "unavailable",
              ...(loadRecords ? { loadFieldId: `${fieldId}:${id}` } : {}),
            })),
          }
        : field,
    ),
    initialValues: { ...base.initialValues, [fieldId]: initial },
    validate: (values) => {
      if (!isList(values)) return base.validate(values)
      const result = base.validate(scalarValues(values))
      try {
        validateRows(rows(values))
      } catch {
        return { valid: false, issues: [{ fieldId, code: "invalid_value" }] }
      }
      return result
    },
    buildCommand: (values) => {
      if (!isList(values)) return { ...base.buildCommand(values) }
      const entries = rows(values)
      validateRows(entries)
      const command = base.buildCommand(scalarValues(values))
      if (
        editing &&
        JSON.stringify(entries) === JSON.stringify(initial.entries)
      )
        return { ...command }
      return {
        ...command,
        credentialPatch: {
          baseline,
          entries: entries.map((entry) => ({
            ...entry,
            fields: Object.fromEntries(
              Object.entries(entry.fields).filter(
                ([name, value]) =>
                  value !==
                  records.find(({ id }) => id === entry.id)?.fields[name],
              ),
            ),
          })),
        },
      }
    },
    loadSecret: async (target, options) => {
      if (!target.startsWith(`${fieldId}:`) && base.loadSecret)
        return base.loadSecret(target, options)
      const id = target.startsWith(`${fieldId}:`)
        ? target.slice(fieldId.length + 1)
        : target === fieldId && records.length === 1
          ? records[0].id
          : undefined
      if (id === undefined || !loadRecords || options?.signal?.aborted)
        throw invalid()
      const latest = await loadRecords(options)
      options?.signal?.throwIfAborted()
      if ((await fingerprint(latest)) !== baseline)
        throw new ManagedResourceError({ code: "resource_changed" })
      const key = latest.find((record) => record.id === id)?.key
      if (!hasUsableManagedSiteChannelKey(key))
        throw new ManagedResourceError({ code: "unavailable" })
      return key!
    },
    ...(base.loadOptions
      ? {
          loadOptions: async (target, values, options) => {
            if (!isList(values))
              return base.loadOptions!(target, values, options)
            const descriptor = base.fields.find(
              (field) => field.fieldId === target,
            )
            if (
              descriptor &&
              "optionLoader" in descriptor &&
              !descriptor.optionLoader?.dependsOn.includes(fieldId)
            )
              return base.loadOptions!(target, scalarValues(values), options)
            const first = rows(values)[0]
            if (!first) throw invalid()
            const key =
              first.secret.kind === "replace"
                ? first.secret.value
                : (await loadRecords?.(options))?.find(
                    ({ id }) => id === first.id,
                  )?.key
            return base.loadOptions!(
              target,
              key
                ? { ...values, [fieldId]: { kind: "replace", value: key } }
                : scalarValues(values),
              options,
            )
          },
        }
      : {}),
  }
}
