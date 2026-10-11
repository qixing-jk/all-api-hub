import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import {
  DAHL_ACCOUNT_ENDPOINT,
  DAHL_KEYS_ENDPOINT,
  DAHL_WEBSITE_NAMES_KEY,
} from "./constants"
import { parseDahlIdentity } from "./identity"
import { isDahlKeyName } from "./keyName"

/** Origin-bound page operation; no generic localStorage write capability is exposed. */
export async function synchronizeDahlWebsiteKeyNames(request: unknown) {
  if (location.origin !== DAHL_WEB_ORIGIN || !isRecord(request))
    return { success: false }
  const { expectedUserId, keyIds, pendingLabels } = request
  if (
    typeof expectedUserId !== "string" ||
    !Array.isArray(keyIds) ||
    !keyIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
    !isRecord(pendingLabels) ||
    Object.entries(pendingLabels).some(
      ([id, name]) =>
        id !== String(Number(id)) ||
        !keyIds.includes(Number(id)) ||
        !isDahlKeyName(name),
    )
  )
    return { success: false }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const accountResponse = await fetch(
      `${DAHL_WEB_ORIGIN}${DAHL_ACCOUNT_ENDPOINT}`,
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    )
    if (!accountResponse.ok) return { success: false }
    const identity = parseDahlIdentity(await accountResponse.json())
    if (identity?.id !== expectedUserId) return { success: false }
    const keysResponse = await fetch(
      `${DAHL_WEB_ORIGIN}${DAHL_KEYS_ENDPOINT}`,
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    )
    if (!keysResponse.ok) return { success: false }
    const keysBody: unknown = await keysResponse.json()
    if (!isRecord(keysBody) || !Array.isArray(keysBody.keys))
      return { success: false }
    const ownedIds = new Set(
      keysBody.keys.filter(isRecord).map((key) => String(key.id)),
    )
    if (
      location.origin !== DAHL_WEB_ORIGIN ||
      keyIds.some((id) => !ownedIds.has(String(id)))
    )
      return { success: false }
    const stored: unknown = JSON.parse(
      localStorage.getItem(DAHL_WEBSITE_NAMES_KEY) ?? "{}",
    )
    if (
      !isRecord(stored) ||
      Object.values(stored).some((name) => !isDahlKeyName(name))
    )
      return { success: false }
    const labels = { ...stored }
    for (const [id, name] of Object.entries(pendingLabels)) {
      const normalized = (name as string).trim()
      if (normalized) labels[id] = normalized
      else delete labels[id]
    }
    // Read and write synchronously after identity/ownership checks; preserve unrelated keys.
    if (Object.keys(pendingLabels).length)
      localStorage.setItem(DAHL_WEBSITE_NAMES_KEY, JSON.stringify(labels))
    return {
      success: true,
      userId: identity.id,
      labels: Object.fromEntries(
        keyIds.map((id) => [
          String(id),
          isDahlKeyName(labels[String(id)])
            ? (labels[String(id)] as string).trim()
            : "",
        ]),
      ),
    }
  } catch {
    return { success: false }
  } finally {
    clearTimeout(timeout)
  }
}
