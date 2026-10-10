import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { MagpieKeyPoolPatch } from "~/services/apiAdapters/managedResources/magpie/keyPoolEditor"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"
import {
  mutateMagpieProviderKey,
  type MagpieKeyInfo,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"
import {
  MagpieApiError,
  type MagpieRequestOptions,
} from "~/services/apiService/magpie/request"
import type { MagpieConfig } from "~/types/magpieConfig"

type KeyAction = Parameters<typeof mutateMagpieProviderKey>[1]
type KeyPayload = Parameters<typeof mutateMagpieProviderKey>[2]
type KeyOperation = { action: KeyAction; payload: KeyPayload; ref: string }

/** Validate every target before the first write; enable replacements before disabling/removing old keys. */
export async function prepareMagpieKeyPool(
  current: Pick<MagpieProvider, "id" | "keyList">,
  patch?: MagpieKeyPoolPatch,
  replacement?: string,
): Promise<KeyOperation[]> {
  if (!patch) return []
  if (!current.keyList) throw new ManagedResourceError({ code: "unavailable" })
  const existing = new Map(current.keyList.map((key) => [key.id, key]))
  for (const ref of [...patch.remove, ...patch.update.map((key) => key.ref)])
    if (!existing.has(ref))
      throw new ManagedResourceError({ code: "resource_changed" })
  const primary = current.keyList.find((key) => key.active)?.id
  const mapRef = (ref: string) =>
    replacement && ref === primary ? replacement : ref
  const operations: KeyOperation[] = []
  const enable: KeyOperation[] = []
  const disable: KeyOperation[] = []
  const finalKeys = new Map(
    current.keyList.map((key) => [mapRef(key.id), key.on]),
  )
  const append = (
    target: KeyOperation[],
    action: KeyAction,
    ref: string,
    fields: Omit<KeyPayload, "id"> = {},
  ) => target.push({ action, ref, payload: { id: current.id, ref, ...fields } })
  for (const key of patch.add) {
    const ref = await magpieKeyFingerprint(key.key)
    // Match native bulk import: already-present keys retain all their settings.
    if (finalKeys.has(ref)) continue
    finalKeys.set(ref, key.on)
    operations.push({
      action: "add",
      ref,
      payload: {
        id: current.id,
        key: key.key,
        name: key.name,
        protocol: key.protocol,
      },
    })
    if (key.weight > 1)
      append(operations, "weight", ref, { weight: key.weight })
    if (!key.on) append(disable, "off", ref)
  }
  for (const change of patch.update) {
    const ref = mapRef(change.ref)
    if (change.name !== undefined)
      append(operations, "rename", ref, { name: change.name })
    if (change.protocol !== undefined)
      append(operations, "protocol", ref, { protocol: change.protocol })
    if (change.weight !== undefined)
      append(operations, "weight", ref, { weight: change.weight })
    if (change.on !== undefined) {
      append(change.on ? enable : disable, change.on ? "on" : "off", ref)
      finalKeys.set(ref, change.on)
    }
  }
  for (const ref of patch.remove) finalKeys.delete(mapRef(ref))
  if (!Array.from(finalKeys.values()).some(Boolean))
    throw new ManagedResourceError({ code: "validation_failed" })
  return [
    ...operations,
    ...enable,
    ...disable,
    ...patch.remove.map((ref) => ({
      action: "remove" as const,
      ref: mapRef(ref),
      payload: { id: current.id, ref: mapRef(ref) },
    })),
  ]
}

const confirms = ({ action, payload }: KeyOperation, key?: MagpieKeyInfo) => {
  if (action === "remove") return !key
  if (!key) return false
  if (action === "rename") return (key.name ?? "") === payload.name
  if (action === "protocol") return (key.protocol ?? "") === payload.protocol
  if (action === "weight") return (key.weight || 1) === (payload.weight || 1)
  if (action === "on" || action === "off") return key.on === (action === "on")
  return (
    key.on &&
    (key.name ?? "") === payload.name &&
    (key.protocol ?? "") === payload.protocol
  )
}

/** Every key request has its own confirmed step; an uncertain response is never replayed. */
export async function applyMagpieKeyPool(
  config: MagpieConfig,
  current: MagpieProvider,
  operations: KeyOperation[],
  step: (run: () => Promise<MagpieProvider>) => Promise<MagpieProvider>,
  options?: MagpieRequestOptions,
) {
  let provider = current
  for (const operation of operations) {
    provider = await step(async () => {
      const items = await mutateMagpieProviderKey(
        config,
        operation.action,
        operation.payload,
        options,
      )
      const saved = items.find((item) => item.id === current.id)
      if (
        !saved?.keyList ||
        !confirms(
          operation,
          saved.keyList.find((key) => key.id === operation.ref),
        )
      )
        throw new MagpieApiError(
          "Magpie key update could not be confirmed",
          200,
          true,
          false,
        )
      return saved
    })
  }
  return provider
}
