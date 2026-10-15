import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { KRILL_ENDPOINTS } from "./constants"
import { fetchKrillIdentity } from "./identity"
import {
  invalidKrillResponse,
  readKrillEnvelope,
  withKrillSession,
} from "./transport"

export type KrillToken = {
  id: number
  name: string
  tokenPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  revoked: boolean
  allowBalanceFallback: boolean
  ipWhitelist: string[] | null
  ipWhitelistGrey: boolean
  ipWhitelistDisabled: boolean
  createdAt: string
}

/** Detail adds the channel selection, which the inventory list does not carry. */
export type KrillTokenDetail = KrillToken & {
  channelIds: readonly number[]
}

export type KrillChannel = {
  id: number
  name: string
  billingMultiplier: number
  defaultRouted: boolean
}

export type KrillTokenUpdate = {
  id: number
  name: string
  allowBalanceFallback: boolean
  ipWhitelist: readonly string[]
  ipWhitelistDisabled?: boolean
  channelIds: readonly number[]
}

const tokenPath = (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return invalidKrillResponse(KRILL_ENDPOINTS.Tokens)
  return `${KRILL_ENDPOINTS.Tokens}/${id}`
}

/** The inventory is the only read model; `GET /api/tokens/{id}` answers 405. */
function parseToken(value: unknown): KrillToken {
  const endpoint = KRILL_ENDPOINTS.Tokens
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    (value.name !== null && typeof value.name !== "string") ||
    typeof value.token_prefix !== "string" ||
    !value.token_prefix.trim() ||
    (value.last_used_at !== null && typeof value.last_used_at !== "string") ||
    (value.revoked_at !== null && typeof value.revoked_at !== "string") ||
    typeof value.allow_balance_fallback !== "boolean" ||
    typeof value.created_at !== "string"
  )
    return invalidKrillResponse(endpoint)
  const whitelist =
    value.ip_whitelist === null
      ? null
      : typeof value.ip_whitelist === "string"
        ? value.ip_whitelist
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : invalidKrillResponse(endpoint)
  return {
    id: Number(value.id),
    name: value.name ?? "",
    tokenPrefix: value.token_prefix,
    lastUsedAt: value.last_used_at,
    revokedAt: value.revoked_at,
    revoked: value.revoked_at !== null,
    allowBalanceFallback: value.allow_balance_fallback,
    ipWhitelist: whitelist,
    ipWhitelistGrey: value.ip_whitelist_grey === true,
    ipWhitelistDisabled: value.ip_whitelist_disabled === true,
    createdAt: value.created_at,
  }
}

/** One unpaginated inventory, as the console itself renders. */
export async function fetchKrillKeys(
  request: ApiServiceRequest,
): Promise<KrillToken[]> {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    const body = await readKrillEnvelope(scoped, KRILL_ENDPOINTS.Tokens)
    if (!Array.isArray(body.data)) invalidKrillResponse(KRILL_ENDPOINTS.Tokens)
    return body.data.map(parseToken)
  })
}

/**
 * Hydrate the channel selection. The console displays its empty sentinel as
 * every default-routed channel being selected.
 */
async function fetchKrillKeyChannels(
  request: ApiServiceRequest,
  id: string,
): Promise<readonly number[]> {
  const path = `${tokenPath(id)}/channels`
  const body = await readKrillEnvelope(request, path)
  const data = body.data
  if (!isRecord(data) || !Array.isArray(data.channel_ids))
    invalidKrillResponse(path)
  return data.channel_ids.map((value) => {
    if (!Number.isSafeInteger(value) || Number(value) <= 0)
      invalidKrillResponse(path)
    return Number(value)
  })
}

/** Hydrate one key from the inventory; the console has no single-key route. */
export async function fetchKrillKey(
  request: ApiServiceRequest,
  id: string,
): Promise<KrillTokenDetail> {
  return withKrillSession(request, async (scoped) => {
    const key = (await fetchKrillKeys(scoped)).find(
      (item) => String(item.id) === id,
    )
    if (!key) throw new AccountKeyResourceError({ code: "not_found" })
    return { ...key, channelIds: await fetchKrillKeyChannels(scoped, id) }
  })
}

/** The console's own create form carries a name and nothing else. */
export async function createKrillKey(
  request: ApiServiceRequest,
  input: { name: string },
): Promise<{ secret: string; item: KrillToken }> {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    const body = await readKrillEnvelope(scoped, KRILL_ENDPOINTS.Tokens, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name.trim() || null }),
    })
    if (
      typeof body.data !== "object" ||
      body.data === null ||
      typeof (body.data as { token?: unknown }).token !== "string" ||
      !(body.data as { token: string }).token.trim()
    )
      invalidKrillResponse(KRILL_ENDPOINTS.Tokens)
    return {
      secret: (body.data as { token: string }).token,
      item: parseToken((body.data as { item?: unknown }).item),
    }
  })
}

/**
 * Settings and channels live on separate routes. Every writable setting is
 * always sent so the write does not depend on replace-vs-merge semantics.
 */
export async function updateKrillKey(
  request: ApiServiceRequest,
  next: KrillTokenUpdate,
): Promise<void> {
  const settingsPath = tokenPath(String(next.id))
  await withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    await readKrillEnvelope(scoped, settingsPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: next.name.trim() || null,
        allow_balance_fallback: next.allowBalanceFallback,
        ip_whitelist: next.ipWhitelist.join(", "),
        ...(next.ipWhitelistDisabled !== undefined
          ? { ip_whitelist_disabled: next.ipWhitelistDisabled }
          : {}),
      }),
    })
    await readKrillEnvelope(scoped, `${settingsPath}/channels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_ids: [...next.channelIds] }),
    })
  })
}

/** Revocation disables the credential while keeping its native record. */
export async function revokeKrillKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const path = tokenPath(id)
  await withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    await readKrillEnvelope(scoped, path, { method: "DELETE" })
  })
}

/** Permanently removes the key record, independently of revocation. */
export async function deleteKrillKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const path = `${tokenPath(id)}/destroy`
  await withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    await readKrillEnvelope(scoped, path, { method: "DELETE" })
  })
}

/** Routable channels with their billing multipliers, as the edit dialog lists them. */
export async function fetchKrillChannels(
  request: ApiServiceRequest,
): Promise<KrillChannel[]> {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    const endpoint = KRILL_ENDPOINTS.Channels
    const body = await readKrillEnvelope(scoped, endpoint)
    if (!Array.isArray(body.data)) invalidKrillResponse(endpoint)
    return body.data.map((value) => {
      if (
        !isRecord(value) ||
        !Number.isSafeInteger(value.id) ||
        Number(value.id) <= 0 ||
        typeof value.name !== "string" ||
        !value.name.trim() ||
        typeof value.default_routed !== "boolean" ||
        typeof value.billing_multiplier !== "string" ||
        !/^\d+(\.\d+)?$/.test(value.billing_multiplier)
      )
        invalidKrillResponse(endpoint)
      const multiplier = Number(value.billing_multiplier)
      if (!Number.isFinite(multiplier) || multiplier < 0)
        invalidKrillResponse(endpoint)
      return {
        id: Number(value.id),
        name: value.name.trim(),
        billingMultiplier: multiplier,
        defaultRouted: value.default_routed,
      }
    })
  })
}
