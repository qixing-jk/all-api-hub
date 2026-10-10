import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  EditableResourceProjection,
  ResourceSecretListDescriptor,
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"

const protocols = ["", "chat", "responses", "anthropic"]
export type MagpieKeyChanges = {
  name?: string
  protocol?: string
  weight?: number
  on?: boolean
}
export type MagpieKeyPoolPatch = {
  add: (Required<MagpieKeyChanges> & { key: string })[]
  update: (MagpieKeyChanges & { ref: string })[]
  remove: string[]
}
const invalid = () => new ManagedResourceError({ code: "validation_failed" })

/** Saved fingerprints and masks identify rows without reading or rotating credentials. */
export function magpieKeyPoolProjection(
  detail?: MagpieProvider,
): ResourceSecretListValue {
  return {
    kind: "secret-list",
    entries: (detail?.keyList ?? []).map((key) => ({
      id: key.id,
      secret: { kind: "unchanged" },
      fields: {
        name: key.name ?? "",
        on: String(key.on),
        protocol: key.protocol ?? "",
        weight: String(key.weight || 1),
        masked: key.masked,
        primary: String(key.active),
      },
    })),
  }
}

/** Only the primary key has a native read endpoint; saved rows edit metadata without replacing secrets. */
export function magpieKeyPoolField(
  detail?: MagpieProvider,
): ResourceSecretListDescriptor {
  return {
    fieldId: "keyPool",
    type: "secret-list",
    allowBulkPaste: true,
    minEntries: detail?.keyList?.length ? 1 : 0,
    savedEntries: (detail?.keyList ?? []).map((key) => ({
      id: key.id,
      secretState: "masked",
      canReplace: false,
      maskedValue: key.masked,
      ...(key.active ? { loadFieldId: `keyPool:${key.id}` } : {}),
    })),
    entryFields: [
      { fieldId: "name", type: "text" },
      { fieldId: "on", type: "boolean" },
      {
        fieldId: "protocol",
        type: "select",
        options: [
          ...new Set([
            ...protocols,
            ...(detail?.keyList ?? []).map((key) => key.protocol ?? ""),
          ]),
        ].map((value) => ({ value })),
      },
      { fieldId: "weight", type: "number", min: 0, max: 1000 },
    ],
  }
}

/** Build intent per fingerprint; absent and concurrently added rows are never reconstructed. */
export function buildMagpieKeyPoolPatch(
  values: EditableResourceProjection,
  detail?: MagpieProvider,
): MagpieKeyPoolPatch | undefined {
  const pool = values.keyPool
  if (
    !pool ||
    typeof pool !== "object" ||
    !("kind" in pool) ||
    pool.kind !== "secret-list" ||
    !Array.isArray(pool.entries)
  )
    throw invalid()
  const original = new Map(
    magpieKeyPoolProjection(detail).entries.map((row) => [row.id, row]),
  )
  const ids = new Set<string>()
  const patch: MagpieKeyPoolPatch = { add: [], update: [], remove: [] }
  for (const row of pool.entries as readonly ResourceSecretListEntry[]) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.id) ||
      !row.fields ||
      typeof row.fields !== "object" ||
      Array.isArray(row.fields) ||
      Object.values(row.fields).some((value) => typeof value !== "string") ||
      !row.secret
    )
      throw invalid()
    ids.add(row.id)
    const saved = original.get(row.id)
    const name = (row.fields.name ?? "").trim()
    const protocol = row.fields.protocol ?? ""
    const on = row.fields.on !== "false"
    const weight = row.fields.weight?.trim() ? Number(row.fields.weight) : 1
    if (
      (row.fields.on !== undefined &&
        !["true", "false"].includes(row.fields.on)) ||
      (protocol !== saved?.fields.protocol && !protocols.includes(protocol)) ||
      (String(weight) !== saved?.fields.weight &&
        (!Number.isInteger(weight) || weight < 0 || weight > 1000))
    )
      throw invalid()
    if (saved) {
      if (row.secret.kind !== "unchanged") throw invalid()
      const changes: MagpieKeyChanges = {}
      if (name !== saved.fields.name) changes.name = name
      if (protocol !== saved.fields.protocol) changes.protocol = protocol
      if (String(weight) !== saved.fields.weight) changes.weight = weight
      if (String(on) !== saved.fields.on) changes.on = on
      if (Object.keys(changes).length)
        patch.update.push({ ref: row.id, ...changes })
    } else {
      if (
        row.secret.kind !== "replace" ||
        typeof row.secret.value !== "string" ||
        !row.secret.value.trim() ||
        /[,;，；\s]/.test(row.secret.value.trim())
      )
        throw invalid()
      patch.add.push({
        key: row.secret.value.trim(),
        name,
        protocol,
        weight,
        on,
      })
    }
  }
  patch.remove = [...original.keys()].filter((id) => !ids.has(id))
  if (original.size && !pool.entries.some((row) => row.fields.on !== "false"))
    throw invalid()
  const primary = detail?.keyList?.find((key) => key.active)
  if (
    primary &&
    patch.remove.includes(primary.id) &&
    values.key &&
    typeof values.key === "object" &&
    "kind" in values.key &&
    values.key.kind === "replace"
  )
    throw invalid()
  return patch.add.length || patch.update.length || patch.remove.length
    ? patch
    : undefined
}
