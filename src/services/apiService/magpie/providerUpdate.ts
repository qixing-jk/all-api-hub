import type { MagpieProvider } from "~/services/apiService/magpie/providers"

/**
 * The save route replaces ordinary provider fields. Preserve the writable
 * projection of a fresh inventory, while leaving separately owned key pools,
 * account limits and model metadata to their native owners. chosen is the
 * saved model selection; models is the discovered catalog, not a save value.
 * https://github.com/yetone/magpie/blob/ea6f8f89f83143e39b139582e75a1dda1fcff4cf/internal/gui/providers.go
 */
export function buildMagpieProviderSavePayload(
  current: MagpieProvider,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: current.id,
    models: current.chosen ?? [],
  }
  for (const field of [
    "name",
    "icon",
    "preset",
    "chat",
    "responses",
    "anthropic",
    "gemini",
    "decide",
    "catalog",
    "website",
    "keysUrl",
    "headers",
    "baseAPI",
    "searches",
    "pinUpstream",
    "unredacted",
    "proxy",
    "balanceURL",
    "balancePath",
    "modelsURL",
    "fallback",
    "routing",
    "affinity",
    "sink",
    "unlisted",
    "contexts",
  ]) {
    if (Object.hasOwn(current, field)) payload[field] = current[field]
  }
  const primary = current.keyList?.find((key) => key.active)
  if (typeof changes.key === "string" && primary) {
    payload.keyName = primary.name ?? ""
    payload.keyProtocol = primary.protocol ?? ""
    payload.keyWeight = primary.weight ?? 0
  }
  return { ...payload, ...changes }
}
