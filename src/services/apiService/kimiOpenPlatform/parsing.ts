import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import type { KimiOpenPlatformCurrency } from "~/services/kimiOpenPlatform/deployments"

export type KimiUserInfo = {
  uid: string
  name: string
  organizations: Array<{
    organization: { id: string }
    role?: string
  }>
}

export type KimiProject = {
  id: string
  name: string
  is_default?: boolean
}

export type KimiApiKey = {
  key: string
  auth: string
  name: string
  project_id: string
  project_name?: string
  created_at?: string
}

export type KimiAccountInfo = {
  cur: number
  today_consume: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Masked console secrets use an ellipsis and must never be saved as keys. */
export function isMaskedKimiSecret(value: string): boolean {
  return value.includes("...") || value.includes("…")
}

/** Returns the data field of a successful console envelope. */
function readEnvelopeData(payload: unknown): unknown {
  if (!isRecord(payload) || payload.code !== 0 || !("data" in payload)) {
    throw new Error("invalid_kimi_envelope")
  }
  return payload.data
}

/** Parses the signed-in user and organization list. */
export function parseKimiUserInfo(payload: unknown): KimiUserInfo {
  const data = readEnvelopeData(payload)
  if (!isRecord(data) || typeof data.uid !== "string" || !data.uid.trim()) {
    throw new Error("invalid_kimi_user_info")
  }
  const organizations = Array.isArray(data.organizations)
    ? data.organizations.flatMap((entry) => {
        if (!isRecord(entry) || !isRecord(entry.organization)) return []
        const id = entry.organization.id
        return typeof id === "string" && id.trim()
          ? [
              {
                organization: { id: id.trim() },
                role: typeof entry.role === "string" ? entry.role : undefined,
              },
            ]
          : []
      })
    : []
  return {
    uid: data.uid.trim(),
    name: typeof data.name === "string" ? data.name.trim() : "",
    organizations,
  }
}

/** Parses the project list. */
export function parseKimiProjects(payload: unknown): KimiProject[] {
  const data = readEnvelopeData(payload)
  if (!Array.isArray(data)) throw new Error("invalid_kimi_projects")
  return data.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string"
    ) {
      return []
    }
    return [
      {
        id: entry.id,
        name: entry.name,
        ...(entry.is_default === true ? { is_default: true } : {}),
      },
    ]
  })
}

/** Parses the organization key inventory. */
export function parseKimiKeys(payload: unknown): KimiApiKey[] {
  const data = readEnvelopeData(payload)
  if (!Array.isArray(data)) throw new Error("invalid_kimi_keys")
  return data.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.key !== "string" ||
      typeof entry.auth !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.project_id !== "string"
    ) {
      return []
    }
    return [
      {
        key: entry.key,
        auth: entry.auth,
        name: entry.name,
        project_id: entry.project_id,
        ...(typeof entry.project_name === "string"
          ? { project_name: entry.project_name }
          : {}),
        ...(typeof entry.created_at === "string"
          ? { created_at: entry.created_at }
          : {}),
      },
    ]
  })
}

/** Parses a create response and rejects masked secrets. */
export function parseKimiCreatedKey(payload: unknown): KimiApiKey {
  const data = readEnvelopeData(payload)
  if (
    !isRecord(data) ||
    typeof data.key !== "string" ||
    typeof data.auth !== "string" ||
    typeof data.name !== "string" ||
    typeof data.project_id !== "string" ||
    !data.auth.trim() ||
    isMaskedKimiSecret(data.auth)
  ) {
    throw new Error("invalid_kimi_created_key")
  }
  return {
    key: data.key,
    auth: data.auth,
    name: data.name,
    project_id: data.project_id,
  }
}

/** Parses available balance and today's consumption. */
export function parseKimiAccountInfo(payload: unknown): KimiAccountInfo {
  const data = readEnvelopeData(payload)
  if (
    !isRecord(data) ||
    typeof data.cur !== "number" ||
    typeof data.today_consume !== "number"
  ) {
    throw new Error("invalid_kimi_account_info")
  }
  return { cur: data.cur, today_consume: data.today_consume }
}

/** Parses the inference balance endpoint. */
export function parseKimiInferenceBalance(payload: unknown): number {
  // Inference has its own documented status flag, separate from the console BFF.
  if (!isRecord(payload) || payload.status !== true)
    throw new Error("invalid_kimi_balance")
  const data = readEnvelopeData(payload)
  if (
    !isRecord(data) ||
    typeof data.available_balance !== "number" ||
    !Number.isFinite(data.available_balance)
  ) {
    throw new Error("invalid_kimi_balance")
  }
  return data.available_balance
}

/** Parses a refresh response that must contain both tokens. */
export function parseKimiRefresh(payload: unknown): {
  accessToken: string
  refreshToken: string
} {
  const data = readEnvelopeData(payload)
  if (
    !isRecord(data) ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    !data.access_token.trim() ||
    !data.refresh_token.trim()
  ) {
    throw new Error("invalid_kimi_refresh")
  }
  return {
    accessToken: data.access_token.trim(),
    refreshToken: data.refresh_token.trim(),
  }
}

/** One project model entry as served by the console's open gateway. */
export type KimiOpenGatewayModel = {
  id: string
}

/**
 * Parses the console's open-gateway model list.
 *
 * The route answers with the OpenAI `{ object: "list", data: [...] }` envelope
 * nested inside the console's own `{ code, data }` one, so the model array is
 * `data.data`. Entries without an id are dropped rather than defaulted.
 */
export function parseKimiOpenGatewayModels(
  payload: unknown,
): KimiOpenGatewayModel[] {
  const data = readEnvelopeData(payload)
  if (!isRecord(data) || !Array.isArray(data.data))
    throw new Error("invalid_kimi_model_catalog")
  const list = data.data
  return list.flatMap((entry) =>
    isRecord(entry) && typeof entry.id === "string" && entry.id.trim()
      ? [{ id: entry.id.trim() }]
      : [],
  )
}

/** Converts a console or inference amount into the shared USD quota scale. */
export function kimiAmountToQuota(
  amount: number,
  currency: KimiOpenPlatformCurrency,
  exchangeRateCnyPerUsd?: number,
): number {
  const rate =
    typeof exchangeRateCnyPerUsd === "number" && exchangeRateCnyPerUsd > 0
      ? exchangeRateCnyPerUsd
      : DEFAULT_USD_TO_CNY_RATE
  const usd = currency === "USD" ? amount : amount / rate
  return Math.round(usd * QUOTA_PER_USD)
}
