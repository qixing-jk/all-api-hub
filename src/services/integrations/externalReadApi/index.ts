import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  ACCOUNT_STORAGE_KEYS,
  API_CREDENTIAL_PROFILES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import {
  EXTERNAL_READ_API_EVENT_NAME,
  EXTERNAL_READ_API_NAMESPACE,
} from "~/services/integrations/externalReadApi/constants"
import {
  userPreferences,
  type ExternalReadApiAccessToken,
  type ExternalReadApiPreferences,
} from "~/services/preferences/userPreferences"
import type { AccountStorageConfig, SiteAccount, SiteBookmark } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import {
  getAllTabs,
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ExternalReadApi")

const ACCOUNT_TOPIC = "accounts"
const API_CREDENTIAL_PROFILES_TOPIC = "apiCredentialProfiles"

type ExternalReadApiTopic =
  | typeof ACCOUNT_TOPIC
  | typeof API_CREDENTIAL_PROFILES_TOPIC

type ExternalReadApiChangeType =
  | "account.created"
  | "account.updated"
  | "account.deleted"
  | "bookmark.created"
  | "bookmark.updated"
  | "bookmark.deleted"
  | "accounts.pinned.changed"
  | "accounts.ordered.changed"
  | "apiCredentialProfile.created"
  | "apiCredentialProfile.updated"
  | "apiCredentialProfile.deleted"

type ExternalReadApiChangeDetail = {
  type: ExternalReadApiChangeType
  topic: ExternalReadApiTopic
  changedKeys?: string[]
}

type ExternalReadApiEvent = {
  topics: ExternalReadApiTopic[]
  changedAt: number
  events: ExternalReadApiChangeDetail[]
}

type ExternalReadApiRequest = {
  namespace?: unknown
  method?: unknown
  params?: unknown
}

type ExternalReadApiResponse<TData> = {
  success: boolean
  data: TData | null
  error: string | null
}

type PersistedApiCredentialProfilesConfig = {
  profiles?: ApiCredentialProfile[]
}

let listenersRegistered = false
const processedChangeSignatures = new Map<string, number>()
const PROCESSED_SIGNATURE_TTL_MS = 10_000

/**
 *
 */
function createErrorResponse(error: string): ExternalReadApiResponse<null> {
  return {
    success: false,
    data: null,
    error,
  }
}

/**
 *
 */
function createSuccessResponse<TData>(
  data: TData,
): ExternalReadApiResponse<TData> {
  return {
    success: true,
    data,
    error: null,
  }
}

/**
 *
 */
function pruneProcessedChangeSignatures(now: number) {
  for (const [signature, timestamp] of processedChangeSignatures) {
    if (now - timestamp > PROCESSED_SIGNATURE_TTL_MS) {
      processedChangeSignatures.delete(signature)
    }
  }
}

/**
 *
 */
function buildTrackedChangeSignature(
  storageKey: string,
  newValue: unknown,
): string | null {
  if (!newValue || typeof newValue !== "object") return null

  if (storageKey === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
    const lastUpdated = (newValue as AccountStorageConfig).last_updated
    return typeof lastUpdated === "number"
      ? `${storageKey}:${lastUpdated}`
      : null
  }

  if (
    storageKey === API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES
  ) {
    const lastUpdated = (
      newValue as PersistedApiCredentialProfilesConfig & {
        lastUpdated?: unknown
      }
    ).lastUpdated
    return typeof lastUpdated === "number"
      ? `${storageKey}:${lastUpdated}`
      : null
  }

  return null
}

/**
 *
 */
function markTrackedChangeProcessed(signature: string | null) {
  if (!signature) return
  const now = Date.now()
  pruneProcessedChangeSignatures(now)
  processedChangeSignatures.set(signature, now)
}

/**
 *
 */
function hasProcessedTrackedChange(signature: string | null) {
  if (!signature) return false
  const now = Date.now()
  pruneProcessedChangeSignatures(now)
  return processedChangeSignatures.has(signature)
}

/**
 *
 */
async function getExternalReadApiPreferences(): Promise<ExternalReadApiPreferences> {
  const preferences = await userPreferences.getPreferences()
  return (
    preferences.externalReadApi ?? {
      enabled: false,
      notificationsEnabled: true,
      tokens: [],
    }
  )
}

/**
 *
 */
function getRequestParams(params: unknown): Record<string, unknown> {
  return params && typeof params === "object"
    ? (params as Record<string, unknown>)
    : {}
}

/**
 *
 */
function getRequestedTokenValue(params: unknown): string | null {
  const raw = getRequestParams(params).token
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

/**
 *
 */
function findMatchingToken(
  preferences: ExternalReadApiPreferences,
  tokenValue: string | null,
): ExternalReadApiAccessToken | null {
  if (!tokenValue) return null

  return (
    preferences.tokens.find(
      (entry) =>
        entry.enabled &&
        typeof entry.token === "string" &&
        entry.token === tokenValue,
    ) ?? null
  )
}

/**
 *
 */
async function ensureExternalAccessAllowed(
  params: unknown,
): Promise<ExternalReadApiAccessToken> {
  const preferences = await getExternalReadApiPreferences()
  if (!preferences.enabled) {
    throw new Error("External read API is disabled.")
  }

  const tokenEntry = findMatchingToken(
    preferences,
    getRequestedTokenValue(params),
  )

  if (!tokenEntry) {
    throw new Error("Invalid or disabled external access token.")
  }

  return tokenEntry
}

/**
 *
 */
async function getSnapshotPayload() {
  const [accounts, apiCredentialProfiles] = await Promise.all([
    accountStorage.exportData(),
    apiCredentialProfilesStorage.exportConfig(),
  ])

  return {
    generatedAt: Date.now(),
    accounts,
    apiCredentialProfiles,
  }
}

/**
 *
 */
function getAccountList(config: unknown): SiteAccount[] {
  if (!config || typeof config !== "object") return []
  const raw = (config as AccountStorageConfig).accounts
  return Array.isArray(raw) ? raw : []
}

/**
 *
 */
function getBookmarkList(config: unknown): SiteBookmark[] {
  if (!config || typeof config !== "object") return []
  const raw = (config as AccountStorageConfig).bookmarks
  return Array.isArray(raw) ? raw : []
}

/**
 *
 */
function getAccountConfigIds(
  config: unknown,
  key: "pinnedAccountIds" | "orderedAccountIds",
): string[] {
  if (!config || typeof config !== "object") return []

  const raw = (config as AccountStorageConfig)[key]
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : []
}

/**
 *
 */
function getProfilesList(config: unknown): ApiCredentialProfile[] {
  if (!config || typeof config !== "object") return []
  const raw = (config as PersistedApiCredentialProfilesConfig).profiles
  return Array.isArray(raw) ? raw : []
}

/**
 *
 */
function buildAccountEvent(
  type: ExternalReadApiChangeType,
): ExternalReadApiChangeDetail {
  return {
    type,
    topic: ACCOUNT_TOPIC,
  }
}

/**
 *
 */
function buildBookmarkEvent(
  type: ExternalReadApiChangeType,
): ExternalReadApiChangeDetail {
  return {
    type,
    topic: ACCOUNT_TOPIC,
  }
}

/**
 *
 */
function buildAccountConfigEvent(input: {
  type: Extract<
    ExternalReadApiChangeType,
    "accounts.pinned.changed" | "accounts.ordered.changed"
  >
  changedKeys: string[]
}): ExternalReadApiChangeDetail {
  return {
    type: input.type,
    topic: ACCOUNT_TOPIC,
    changedKeys: input.changedKeys,
  }
}

/**
 *
 */
function buildProfileEvent(
  type: ExternalReadApiChangeType,
): ExternalReadApiChangeDetail {
  return {
    type,
    topic: API_CREDENTIAL_PROFILES_TOPIC,
  }
}

/**
 *
 */
function diffAccountChanges(
  oldValue: unknown,
  newValue: unknown,
): ExternalReadApiChangeDetail[] {
  const oldAccounts = getAccountList(oldValue)
  const newAccounts = getAccountList(newValue)
  const oldMap = new Map(oldAccounts.map((entry) => [entry.id, entry]))
  const newMap = new Map(newAccounts.map((entry) => [entry.id, entry]))
  const changes: ExternalReadApiChangeDetail[] = []

  for (const account of newAccounts) {
    const previous = oldMap.get(account.id)
    if (!previous) {
      changes.push(buildAccountEvent("account.created"))
      continue
    }

    if (JSON.stringify(previous) !== JSON.stringify(account)) {
      changes.push(buildAccountEvent("account.updated"))
    }
  }

  for (const account of oldAccounts) {
    if (!newMap.has(account.id)) {
      changes.push(buildAccountEvent("account.deleted"))
    }
  }

  return changes
}

/**
 *
 */
function diffBookmarkChanges(
  oldValue: unknown,
  newValue: unknown,
): ExternalReadApiChangeDetail[] {
  const oldBookmarks = getBookmarkList(oldValue)
  const newBookmarks = getBookmarkList(newValue)
  const oldMap = new Map(oldBookmarks.map((entry) => [entry.id, entry]))
  const newMap = new Map(newBookmarks.map((entry) => [entry.id, entry]))
  const changes: ExternalReadApiChangeDetail[] = []

  for (const bookmark of newBookmarks) {
    const previous = oldMap.get(bookmark.id)
    if (!previous) {
      changes.push(buildBookmarkEvent("bookmark.created"))
      continue
    }

    if (JSON.stringify(previous) !== JSON.stringify(bookmark)) {
      changes.push(buildBookmarkEvent("bookmark.updated"))
    }
  }

  for (const bookmark of oldBookmarks) {
    if (!newMap.has(bookmark.id)) {
      changes.push(buildBookmarkEvent("bookmark.deleted"))
    }
  }

  return changes
}

/**
 *
 */
function diffProfileChanges(
  oldValue: unknown,
  newValue: unknown,
): ExternalReadApiChangeDetail[] {
  const oldProfiles = getProfilesList(oldValue)
  const newProfiles = getProfilesList(newValue)
  const oldMap = new Map(oldProfiles.map((entry) => [entry.id, entry]))
  const newMap = new Map(newProfiles.map((entry) => [entry.id, entry]))
  const changes: ExternalReadApiChangeDetail[] = []

  for (const profile of newProfiles) {
    const previous = oldMap.get(profile.id)
    if (!previous) {
      changes.push(buildProfileEvent("apiCredentialProfile.created"))
      continue
    }

    if (JSON.stringify(previous) !== JSON.stringify(profile)) {
      changes.push(buildProfileEvent("apiCredentialProfile.updated"))
    }
  }

  for (const profile of oldProfiles) {
    if (!newMap.has(profile.id)) {
      changes.push(buildProfileEvent("apiCredentialProfile.deleted"))
    }
  }

  return changes
}

/**
 *
 */
function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

/**
 *
 */
function diffAccountConfigChanges(
  oldValue: unknown,
  newValue: unknown,
): ExternalReadApiChangeDetail[] {
  const changes: ExternalReadApiChangeDetail[] = []
  const oldPinned = getAccountConfigIds(oldValue, "pinnedAccountIds")
  const newPinned = getAccountConfigIds(newValue, "pinnedAccountIds")

  if (!areStringListsEqual(oldPinned, newPinned)) {
    changes.push(
      buildAccountConfigEvent({
        type: "accounts.pinned.changed",
        changedKeys: ["pinnedAccountIds"],
      }),
    )
  }

  const oldOrdered = getAccountConfigIds(oldValue, "orderedAccountIds")
  const newOrdered = getAccountConfigIds(newValue, "orderedAccountIds")

  if (!areStringListsEqual(oldOrdered, newOrdered)) {
    changes.push(
      buildAccountConfigEvent({
        type: "accounts.ordered.changed",
        changedKeys: ["orderedAccountIds"],
      }),
    )
  }

  return changes
}

/**
 *
 */
async function notifyAllTabs(event: ExternalReadApiEvent): Promise<void> {
  const preferences = await getExternalReadApiPreferences()
  if (!preferences.enabled || !preferences.notificationsEnabled) return

  const tabs = await getAllTabs()

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") return

      try {
        await sendTabMessageWithRetry(tab.id, {
          action: RuntimeActionIds.ExternalReadApiNotifyContent,
          payload: {
            topics: event.topics,
            changedAt: event.changedAt,
            events: event.events,
            eventName: EXTERNAL_READ_API_EVENT_NAME,
          },
        })
      } catch (error) {
        if (isMessageReceiverUnavailableError(error)) {
          return
        }

        logger.warn("Failed to send external read API notification to tab", {
          tabId: tab.id,
          error: getErrorMessage(error),
        })
      }
    }),
  )
}

/**
 *
 */
function filterTrackedStorageChanges(
  changes: Record<string, browser.storage.StorageChange>,
) {
  const filtered: Record<string, browser.storage.StorageChange> = {}

  for (const [storageKey, change] of Object.entries(changes)) {
    const signature = buildTrackedChangeSignature(storageKey, change.newValue)
    if (hasProcessedTrackedChange(signature)) {
      continue
    }

    filtered[storageKey] = change
  }

  return filtered
}

/**
 *
 */
async function handleTrackedStorageChange(
  changes: Record<string, browser.storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== "local") return

  const trackedChanges = filterTrackedStorageChanges(changes)

  const topics: ExternalReadApiTopic[] = []
  const details: ExternalReadApiChangeDetail[] = []

  const accountChange = trackedChanges[ACCOUNT_STORAGE_KEYS.ACCOUNTS]
  if (accountChange) {
    topics.push(ACCOUNT_TOPIC)
    details.push(
      ...diffAccountChanges(accountChange.oldValue, accountChange.newValue),
      ...diffBookmarkChanges(accountChange.oldValue, accountChange.newValue),
      ...diffAccountConfigChanges(
        accountChange.oldValue,
        accountChange.newValue,
      ),
    )
  }

  const profileChange =
    trackedChanges[API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES]
  if (profileChange) {
    topics.push(API_CREDENTIAL_PROFILES_TOPIC)
    details.push(
      ...diffProfileChanges(profileChange.oldValue, profileChange.newValue),
    )
  }

  if (topics.length === 0 || details.length === 0) return

  markTrackedChangeProcessed(
    buildTrackedChangeSignature(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      accountChange?.newValue,
    ),
  )
  markTrackedChangeProcessed(
    buildTrackedChangeSignature(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      profileChange?.newValue,
    ),
  )

  const event: ExternalReadApiEvent = {
    topics: Array.from(new Set(topics)),
    changedAt: Date.now(),
    events: details,
  }
  await notifyAllTabs(event)
}

/**
 *
 */
async function handleGetCapabilities() {
  return createSuccessResponse({
    version: 1,
    supportedMethods: ["getCapabilities", "getSnapshot"],
    notificationEventName: EXTERNAL_READ_API_EVENT_NAME,
    exposureMode: "full-readonly" as const,
    authMode: "token" as const,
  })
}

/**
 *
 */
async function handleGetSnapshot() {
  return createSuccessResponse(await getSnapshotPayload())
}

/**
 *
 */
async function handleExternalRequest(
  request: ExternalReadApiRequest,
): Promise<ExternalReadApiResponse<unknown>> {
  try {
    if (request.namespace !== EXTERNAL_READ_API_NAMESPACE) {
      return createErrorResponse("Invalid namespace.")
    }

    await ensureExternalAccessAllowed(request.params)

    switch (request.method) {
      case "getCapabilities":
        return await handleGetCapabilities()
      case "getSnapshot":
        return await handleGetSnapshot()
      default:
        return createErrorResponse("Unsupported method.")
    }
  } catch (error) {
    return createErrorResponse(getErrorMessage(error))
  }
}

type ExternalReadApiStorageChangedRequest = {
  storageKey?: unknown
  oldValue?: unknown
  newValue?: unknown
}

/**
 *
 */
export async function handleExternalReadApiStorageChangedMessage(
  request: ExternalReadApiStorageChangedRequest,
  sendResponse: (response: { success: boolean; error?: string }) => void,
) {
  try {
    const storageKey =
      typeof request.storageKey === "string" ? request.storageKey : ""
    if (
      storageKey !== ACCOUNT_STORAGE_KEYS.ACCOUNTS &&
      storageKey !==
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES
    ) {
      sendResponse({ success: false, error: "Unsupported storage key." })
      return true
    }

    await handleTrackedStorageChange(
      {
        [storageKey]: {
          oldValue: request.oldValue,
          newValue: request.newValue,
        },
      },
      "local",
    )

    sendResponse({ success: true })
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}

/**
 *
 */
export function setupExternalReadApi() {
  if (listenersRegistered) return

  let registeredAnyListener = false

  try {
    browser.runtime.onMessageExternal?.addListener(
      (request, _sender, sendResponse) => {
        void handleExternalRequest(request ?? {}).then(sendResponse)
        return true
      },
    )
    registeredAnyListener = true
  } catch (error) {
    logger.warn(
      "External read API message listener unavailable; skipping registration",
      error,
    )
  }

  try {
    browser.storage.onChanged?.addListener((changes, areaName) => {
      void handleTrackedStorageChange(changes, areaName).catch((error) => {
        logger.error(
          "Failed to process external read API storage change",
          error,
        )
      })
    })
    registeredAnyListener = true
  } catch (error) {
    logger.warn(
      "External read API storage listener unavailable; skipping registration",
      error,
    )
  }

  listenersRegistered = registeredAnyListener
}
/**
 *
 */
export function __resetExternalReadApiForTests() {
  listenersRegistered = false
}
