import {
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failureCodes,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import {
  fetchChannels,
  fetchInferenceOrigin,
  findFoxCodeChannel,
  type FoxCodeChannel,
} from "./catalog"
import {
  FOXCODE_ENDPOINTS,
  FOXCODE_KEY_MAX_PAGES,
  FOXCODE_KEY_PAGE_SIZE,
  FOXCODE_UNLIMITED_QUOTA,
} from "./constants"
import { fetchUserInfo, foxCodeAmount } from "./index"
import {
  invalidFoxCodeResponse,
  readFoxCode,
  withFoxCodeSession,
} from "./transport"

export type FoxCodeNativeKey = {
  id: string
  userId: string
  name: string
  description: string | null
  key: string
  channelKey: string | null
  isActive: boolean
  quotaLimit: number
  quotaUsed: number
  createdAt: string
  lastUsedAt: string | null
}
export type FoxCodeKey = FoxCodeNativeKey & {
  /** Canonical catalog identity; native channelKey remains the write value. */
  canonicalChannelKey?: string
  modelIds: string[] | null
  baseUrl: string
}
export type FoxCodeRuntimeContext = {
  channels: FoxCodeChannel[]
  baseUrl: string
}
export type FoxCodeKeyInput = Pick<
  FoxCodeKey,
  "name" | "description" | "channelKey" | "quotaLimit"
>
export type FoxCodeKeyUpdate = FoxCodeKeyInput & Pick<FoxCodeKey, "isActive">

/** Verify ownership and project native limits without widening unknown channel access. */
function parseKey(value: unknown, owner: string): FoxCodeNativeKey {
  const endpoint = FOXCODE_ENDPOINTS.Keys
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    value.userId !== owner ||
    typeof value.name !== "string" ||
    typeof value.key !== "string" ||
    !value.key.trim() ||
    /[\s*•…]/u.test(value.key) ||
    typeof value.isActive !== "boolean" ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    (value.description !== null && typeof value.description !== "string") ||
    (value.channelKey !== null && typeof value.channelKey !== "string") ||
    (value.lastUsedAt !== null && typeof value.lastUsedAt !== "string") ||
    (value.quotaLimit !== FOXCODE_UNLIMITED_QUOTA &&
      (typeof value.quotaLimit !== "number" ||
        value.quotaLimit < 0 ||
        !Number.isFinite(value.quotaLimit)))
  )
    throw invalidFoxCodeResponse(endpoint)
  return {
    id: value.id,
    userId: owner,
    name: value.name,
    description: value.description,
    key: value.key,
    channelKey: value.channelKey,
    isActive: value.isActive,
    quotaLimit: value.quotaLimit as number,
    quotaUsed: foxCodeAmount(value.quotaUsed, endpoint),
    createdAt: value.createdAt,
    lastUsedAt: value.lastUsedAt,
  }
}

/** Native inventory is the website's edit baseline; no detail GET exists in this deployment. */
export async function fetchNativeKeys(
  request: ApiServiceRequest,
): Promise<FoxCodeNativeKey[]> {
  return withFoxCodeSession(request, async (request) => {
    const user = await fetchUserInfo(request)
    const keys: FoxCodeNativeKey[] = [],
      ids = new Set<string>()
    for (let page = 1; page <= FOXCODE_KEY_MAX_PAGES; page++) {
      const endpoint = `${FOXCODE_ENDPOINTS.Keys}?page=${page}&limit=${FOXCODE_KEY_PAGE_SIZE}`
      const data = await readFoxCode(request, endpoint)
      if (
        !Array.isArray(data.apiKeys) ||
        !isRecord(data.pagination) ||
        data.pagination.page !== page ||
        typeof data.pagination.pages !== "number" ||
        !Number.isSafeInteger(data.pagination.pages) ||
        data.pagination.pages < 0 ||
        data.pagination.pages > FOXCODE_KEY_MAX_PAGES
      )
        throw invalidFoxCodeResponse(endpoint)
      for (const item of data.apiKeys) {
        const key = parseKey(item, String(user.id))
        if (ids.has(key.id)) throw invalidFoxCodeResponse(endpoint)
        ids.add(key.id)
        keys.push(key)
      }
      if (page >= data.pagination.pages) return keys
      if (data.apiKeys.length === 0) throw invalidFoxCodeResponse(endpoint)
    }
    throw new AccountKeyResourceError({ code: failureCodes.Unavailable })
  })
}

/** Public configuration is requested only when projecting a runtime credential. */
export async function fetchKeyRuntimeContext(
  request: ApiServiceRequest,
): Promise<FoxCodeRuntimeContext> {
  const [channels, baseUrl] = await Promise.all([
    fetchChannels(request),
    fetchInferenceOrigin(request),
  ])
  return { channels, baseUrl }
}
/** Join a native key with a separately loaded runtime configuration snapshot. */
export function projectFoxCodeRuntimeKey(
  key: FoxCodeNativeKey,
  context: FoxCodeRuntimeContext,
): FoxCodeKey {
  const channel = findFoxCodeChannel(context.channels, key.channelKey)
  // A removed/unknown channel cannot imply unrestricted access.
  return {
    ...key,
    canonicalChannelKey: channel?.key,
    modelIds: channel?.models ?? (key.channelKey === null ? null : []),
    baseUrl: context.baseUrl,
  }
}
/** Read owned keys and enrich them only for runtime credential consumers. */
export async function fetchKeys(
  request: ApiServiceRequest,
  context?: FoxCodeRuntimeContext,
): Promise<FoxCodeKey[]> {
  return withFoxCodeSession(request, async (scoped) => {
    const keys = await fetchNativeKeys(scoped)
    const runtime = context ?? (await fetchKeyRuntimeContext(scoped))
    return keys.map((key) => projectFoxCodeRuntimeKey(key, runtime))
  })
}

const createFields = [
  "name",
  "description",
  "channelKey",
  "quotaLimit",
] as const
const writeFields = [...createFields, "isActive"] as const
/** Keep console write validation consistent across creation and editing. */
function validateInput(input: FoxCodeKeyInput) {
  if (
    !input.name.trim() ||
    !input.channelKey ||
    (input.description !== null && typeof input.description !== "string") ||
    (input.quotaLimit !== FOXCODE_UNLIMITED_QUOTA &&
      (!Number.isFinite(input.quotaLimit) || input.quotaLimit < 0))
  )
    throw new AccountKeyResourceError({ code: failureCodes.ValidationFailed })
}

/** Create once; account identity and the selected channel must be valid before dispatch. */
export async function createKey(
  request: ApiServiceRequest,
  input: FoxCodeKeyInput,
): Promise<FoxCodeKey> {
  validateInput(input)
  return withFoxCodeSession(request, async (request) => {
    const owner = await fetchUserInfo(request)
    const channels = await fetchChannels(request)
    if (
      !channels.some(
        (channel) => channel.enabled && channel.key === input.channelKey,
      )
    )
      throw new AccountKeyResourceError({ code: failureCodes.ValidationFailed })
    const body = await readFoxCode(request, FOXCODE_ENDPOINTS.Keys, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const created = body.apiKey
    if (!isRecord(created) || typeof created.id !== "string")
      throw new AccountKeyResourceError({
        code: failureCodes.MutationStateUncertain,
      })
    const native = parseKey(created, String(owner.id))
    const confirmed = projectFoxCodeRuntimeKey(native, {
      channels,
      baseUrl: await fetchInferenceOrigin(request),
    })
    if (createFields.some((field) => confirmed[field] !== input[field]))
      throw new AccountKeyResourceError({
        code: failureCodes.MutationStateUncertain,
      })
    return confirmed
  })
}

const resourcePath = (id: string) => {
  if (!id.trim() || id.includes("/") || id === "." || id === "..")
    throw new AccountKeyResourceError({ code: failureCodes.ValidationFailed })
  return `${FOXCODE_ENDPOINTS.Keys}/${encodeURIComponent(id)}`
}

/** PATCH preserves untouched fields; conflict detection is as fresh as the supplied baseline. */
export async function updateKey(
  request: ApiServiceRequest,
  baseline: FoxCodeKey,
  next: FoxCodeKeyUpdate,
  prepared?: FoxCodeKey,
): Promise<FoxCodeKey> {
  validateInput(next)
  const path = resourcePath(baseline.id)
  return withFoxCodeSession(request, async (request) => {
    const owner = await fetchUserInfo(request)
    const current =
      prepared ??
      (await fetchNativeKeys(request)).find((key) => key.id === baseline.id)
    if (
      current &&
      (current.id !== baseline.id || current.userId !== String(owner.id))
    )
      throw new AccountKeyResourceError({ code: failureCodes.NotFound })
    if (!current)
      throw new AccountKeyResourceError({ code: failureCodes.NotFound })
    const projectCurrent = async (
      native: FoxCodeNativeKey,
    ): Promise<FoxCodeKey> => {
      const known =
        prepared?.channelKey === native.channelKey
          ? prepared
          : baseline.channelKey === native.channelKey
            ? baseline
            : undefined
      if (known)
        return {
          ...native,
          canonicalChannelKey: known.canonicalChannelKey,
          modelIds: known.modelIds,
          baseUrl: known.baseUrl,
        }
      return projectFoxCodeRuntimeKey(native, {
        channels: await fetchChannels(request),
        baseUrl: baseline.baseUrl,
      })
    }
    const changed = writeFields.filter(
      (field) => next[field] !== baseline[field],
    )
    if (
      changed.some(
        (field) =>
          current[field] !== baseline[field] && current[field] !== next[field],
      )
    )
      throw new AccountKeyResourceError({ code: failureCodes.ResourceChanged })
    if (
      changed.includes("channelKey") &&
      !(await fetchChannels(request)).some(
        (channel) => channel.enabled && channel.key === next.channelKey,
      )
    )
      throw new AccountKeyResourceError({ code: failureCodes.ValidationFailed })
    const patch = Object.fromEntries(
      changed
        .filter((field) => current[field] !== next[field])
        .map((field) => [field, next[field]]),
    )
    if (!Object.keys(patch).length) return projectCurrent(current)
    const response = await readFoxCode(request, path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const confirmed =
      response.apiKey === undefined
        ? { ...current, ...patch }
        : parseKey(response.apiKey, String(owner.id))
    if (
      confirmed.id !== baseline.id ||
      changed.some((field) => confirmed[field] !== next[field])
    )
      throw new AccountKeyResourceError({
        code: failureCodes.MutationStateUncertain,
      })
    return projectCurrent(confirmed)
  })
}

/** Delete once; the authenticated provider owns existence and authorization checks. */
export async function deleteKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const path = resourcePath(id)
  return withFoxCodeSession(request, async (request) => {
    await fetchUserInfo(request)
    await readFoxCode(request, path, { method: "DELETE" })
  })
}
