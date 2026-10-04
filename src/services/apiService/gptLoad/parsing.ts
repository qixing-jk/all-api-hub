/**
 * gpt-load response readers.
 *
 * The transport already unwraps the `{code,message,data}` envelope, so these
 * readers receive the inner `data` payload and only have to turn untrusted JSON
 * into the shapes this extension projects. Each tolerates a bare array/object so
 * a shape change degrades into "empty" instead of throwing mid-render.
 */

import type {
  GptLoadChannelCatalogEntry,
  GptLoadCredential,
  GptLoadCredentialReveal,
  GptLoadGroup,
  GptLoadGroupModel,
  GptLoadGroupModels,
  GptLoadGroupSettings,
  GptLoadSession,
} from "~/types/gptLoad"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload
  if (isRecord(payload) && Array.isArray(payload.items)) return payload.items
  return []
}

const isGroup = (value: unknown): value is GptLoadGroup => {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === "string"
  )
}

/** Reads the group list from either the modern or classic collection route. */
export function readGptLoadGroups(payload: unknown): GptLoadGroup[] {
  return readItems(payload).filter(isGroup)
}

/** Reads one group from a create/settings response. */
export function readGptLoadGroup(payload: unknown): GptLoadGroup | null {
  if (isGroup(payload)) return payload
  if (!isRecord(payload)) return null
  const group = payload.group
  return isGroup(group) ? group : null
}

/** Reads `GET /api/groups/:id/settings`. */
export function readGptLoadGroupSettings(
  payload: unknown,
): GptLoadGroupSettings | null {
  return isRecord(payload) ? (payload as GptLoadGroupSettings) : null
}

/** Reads the channel catalogue from `GET /api/channels`. */
export function readGptLoadChannelCatalog(
  payload: unknown,
): GptLoadChannelCatalogEntry[] {
  return readItems(payload).filter(
    (value): value is GptLoadChannelCatalogEntry =>
      isRecord(value) &&
      typeof value.channel_id === "string" &&
      value.channel_id.trim().length > 0,
  )
}

/** Reads a credential page from `GET /api/groups/:id/credentials`. */
export function readGptLoadCredentials(payload: unknown): GptLoadCredential[] {
  return readItems(payload).filter(
    (value): value is GptLoadCredential =>
      isRecord(value) &&
      typeof value.credential_id === "number" &&
      Number.isSafeInteger(value.credential_id) &&
      value.credential_id > 0,
  )
}

/** Reads the model list from `GET /api/groups/:id/models`. */
export function readGptLoadGroupModels(payload: unknown): GptLoadGroupModel[] {
  const container = isRecord(payload)
    ? (payload as GptLoadGroupModels)
    : undefined
  const items = Array.isArray(container?.items)
    ? container.items
    : Array.isArray(payload)
      ? payload
      : []
  return items.filter(
    (value): value is GptLoadGroupModel =>
      isRecord(value) &&
      typeof value.id === "string" &&
      value.id.trim().length > 0,
  )
}

/** Reads the credential object from a reveal response. */
export function readGptLoadCredentialReveal(
  payload: unknown,
): GptLoadCredentialReveal | null {
  return isRecord(payload) ? (payload as GptLoadCredentialReveal) : null
}

/** Reads `GET /api/auth/session`. */
export function readGptLoadSession(payload: unknown): GptLoadSession | null {
  if (!isRecord(payload)) return null
  return {
    authenticated: payload.authenticated === true,
    principalType:
      typeof payload.principal_type === "string"
        ? payload.principal_type
        : null,
  }
}
