import {
  MagpieApiError,
  requestMagpie,
  type MagpieRequestOptions,
} from "~/services/apiService/magpie/request"
import type { MagpieConfig } from "~/types/magpieConfig"

export interface MagpieKeyInfo {
  id: string
  name?: string
  masked: string
  active: boolean
  on: boolean
  protocol?: string
  weight?: number
}

/** Native inventory; secrets remain masked until the explicit key action. */
export interface MagpieProvider {
  id: string
  name: string
  chat: string
  responses: string
  anthropic: string
  gemini?: string
  key: { set: boolean; masked: string; optional: boolean }
  chosen: string[] | null
  models: { id: string; on?: boolean }[] | null
  off: boolean
  keyList?: MagpieKeyInfo[] | null
  account?: unknown
  [field: string]: unknown
}

/** The Web UI's inventory is not the writable provider representation. */
function parseMagpieInventory(value: unknown): MagpieProvider[] {
  const providers =
    value && typeof value === "object" && "providers" in value
      ? value.providers
      : undefined
  if (
    !Array.isArray(providers) ||
    providers.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.name !== "string" ||
        typeof item.chat !== "string" ||
        typeof item.responses !== "string" ||
        typeof item.anthropic !== "string" ||
        !item.key ||
        typeof item.key.set !== "boolean" ||
        typeof item.off !== "boolean" ||
        (item.keyList != null &&
          (!Array.isArray(item.keyList) ||
            item.keyList.some(
              (key: MagpieKeyInfo) =>
                !key ||
                typeof key.id !== "string" ||
                !key.id ||
                typeof key.masked !== "string" ||
                typeof key.active !== "boolean" ||
                typeof key.on !== "boolean" ||
                (key.name !== undefined && typeof key.name !== "string") ||
                (key.protocol !== undefined &&
                  typeof key.protocol !== "string") ||
                (key.weight !== undefined && !Number.isFinite(key.weight)),
            ) ||
            new Set(item.keyList.map((key: MagpieKeyInfo) => key.id)).size !==
              item.keyList.length)) ||
        (item.gemini !== undefined && typeof item.gemini !== "string") ||
        (item.chosen !== null &&
          (!Array.isArray(item.chosen) ||
            item.chosen.some((model: unknown) => typeof model !== "string"))) ||
        (item.models !== null &&
          (!Array.isArray(item.models) ||
            item.models.some(
              (model: unknown) =>
                !model ||
                typeof model !== "object" ||
                !("id" in model) ||
                typeof model.id !== "string",
            ))),
    )
  )
    throw new MagpieApiError(
      "Invalid Magpie provider inventory",
      200,
      true,
      false,
    )
  return providers
}

/** Read every provider; Magpie has no pagination on this route. */
export async function listMagpieProviders(
  config: MagpieConfig,
  options?: MagpieRequestOptions,
) {
  return parseMagpieInventory(
    await requestMagpie(config, "/api/providers", undefined, options),
  )
}

/** Save once; the caller supplies new=true for creation and owns readback. */
export async function saveMagpieProvider(
  config: MagpieConfig,
  payload: Record<string, unknown>,
  options?: MagpieRequestOptions,
) {
  return parseMagpieInventory(
    await requestMagpie(config, "/api/provider/save", payload, options),
  )
}

/** Native key actions address a fingerprint and never replace the whole pool. */
export async function mutateMagpieProviderKey(
  config: MagpieConfig,
  action: "add" | "rename" | "protocol" | "weight" | "on" | "off" | "remove",
  payload: {
    id: string
    ref?: string
    key?: string
    name?: string
    protocol?: string
    weight?: number
  },
  options?: MagpieRequestOptions,
) {
  return parseMagpieInventory(
    await requestMagpie(config, `/api/keys/${action}`, payload, options),
  )
}

/** Delete only the selected native provider. Magpie may reseat its agent picks. */
export async function deleteMagpieProvider(
  config: MagpieConfig,
  id: string,
  options?: MagpieRequestOptions,
) {
  return parseMagpieInventory(
    await requestMagpie(config, "/api/provider/delete", { id }, options),
  )
}

/** Toggle a provider without rewriting its configuration or credentials. */
export async function setMagpieProviderEnabled(
  config: MagpieConfig,
  id: string,
  enabled: boolean,
  options?: MagpieRequestOptions,
) {
  return parseMagpieInventory(
    await requestMagpie(
      config,
      `/api/provider/${enabled ? "on" : "off"}`,
      { id },
      options,
    ),
  )
}

/** Explicit native reveal; masked inventory values are never credentials. */
export async function readMagpieProviderKey(
  config: MagpieConfig,
  id: string,
  options?: MagpieRequestOptions,
): Promise<string> {
  const result = await requestMagpie(
    config,
    "/api/provider/key",
    { id },
    options,
  )
  if (
    !result ||
    typeof result !== "object" ||
    !("key" in result) ||
    typeof result.key !== "string"
  ) {
    throw new MagpieApiError("Invalid Magpie key response", 200, true, false)
  }
  return result.key
}

/** Read-only model discovery. Unlike /models, /list never prunes saved picks. */
export async function discoverMagpieModels(
  config: MagpieConfig,
  payload: Record<string, unknown>,
  options?: MagpieRequestOptions,
): Promise<string[]> {
  const result = await requestMagpie(
    config,
    "/api/provider/list",
    payload,
    options,
  )
  const models =
    result && typeof result === "object" && "models" in result
      ? result.models
      : undefined
  if (
    !Array.isArray(models) ||
    models.some((item) => !item || typeof item.id !== "string")
  ) {
    throw new MagpieApiError("Invalid Magpie model list", 200, true, false)
  }
  return [...new Set(models.map((item) => item.id as string))]
}
