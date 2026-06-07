import type { ProductAnnouncementView } from "~/services/productAnnouncements/catalog"
import {
  normalizeProductAnnouncementFeed,
  selectProductAnnouncementView,
} from "~/services/productAnnouncements/catalog"
import {
  PRODUCT_ANNOUNCEMENT_REFRESH_ALARM,
  PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
  PRODUCT_ANNOUNCEMENT_REMOTE_URL,
} from "~/services/productAnnouncements/constants"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"
import type { RawProductAnnouncementFeed } from "~/services/productAnnouncements/types"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import {
  createAlarm,
  getAlarm,
  getManifest,
  onAlarm,
} from "~/utils/browser/browserApi"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"
import bundledFeed from "~~/public/product-announcements.json"

import {
  onProductAnnouncementsMessage,
  type ProductAnnouncementsDismissRequest,
  type ProductAnnouncementsGetStateRequest,
  type ProductAnnouncementsMarkSeenRequest,
  type ProductAnnouncementsRestoreRequest,
} from "./messaging"

const logger = createLogger("ProductAnnouncementService")
const REFRESH_INTERVAL_MS =
  PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES * 60 * 1000
const REMOTE_FEED_FETCH_TIMEOUT_MS = 15_000
const INVALID_PRODUCT_ANNOUNCEMENT_STATE_REQUEST_ERROR =
  "Invalid product announcement state request"
const INVALID_PRODUCT_ANNOUNCEMENT_MARK_SEEN_REQUEST_ERROR =
  "Invalid product announcement mark-seen request"
const INVALID_PRODUCT_ANNOUNCEMENT_DISMISS_REQUEST_ERROR =
  "Invalid product announcement dismiss request"
const INVALID_PRODUCT_ANNOUNCEMENT_RESTORE_REQUEST_ERROR =
  "Invalid product announcement restore request"

export interface ProductAnnouncementRuntimeState {
  view: ProductAnnouncementView
  lastFetchedAt?: number
}

interface GetCurrentProductAnnouncementStateOptions {
  locale: string
  currentVersion?: string
  now?: number
}

/**
 * Checks the feed-level shape before trusting remote or persisted catalog data.
 */
function isValidProductAnnouncementFeed(
  feed: RawProductAnnouncementFeed,
): boolean {
  return (
    isPlainObject(feed) &&
    (feed.defaultLocale == null || typeof feed.defaultLocale === "string") &&
    Array.isArray(feed.announcements)
  )
}

/**
 * Adds bundled development examples to the runtime view without persisting them.
 */
function getRuntimeProductAnnouncementFeed(
  feed: RawProductAnnouncementFeed,
): RawProductAnnouncementFeed {
  if (!isDevelopmentMode()) {
    return feed
  }

  const devAnnouncements = Array.isArray(
    bundledFeed._examples?.devAnnouncements,
  )
    ? bundledFeed._examples.devAnnouncements
    : []
  if (devAnnouncements.length === 0) {
    return feed
  }

  return {
    ...feed,
    announcements: [
      ...(Array.isArray(feed.announcements) ? feed.announcements : []),
      ...devAnnouncements,
    ],
  }
}

class ProductAnnouncementService {
  private isInitialized = false
  private refreshPromise: Promise<boolean> | null = null

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    onAlarm(async (alarm) => {
      if (alarm.name !== PRODUCT_ANNOUNCEMENT_REFRESH_ALARM) {
        return
      }

      await this.refreshRemoteFeed()
    })

    this.isInitialized = true
    await this.reconcileRefreshAlarm()
    void this.refreshRemoteFeed()
  }

  async reconcileRefreshAlarm(): Promise<void> {
    const existingAlarm = await getAlarm(PRODUCT_ANNOUNCEMENT_REFRESH_ALARM)
    if (existingAlarm) {
      return
    }

    await createAlarm(PRODUCT_ANNOUNCEMENT_REFRESH_ALARM, {
      delayInMinutes: PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
      periodInMinutes: PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
    })
  }

  async getCurrentState(
    options: GetCurrentProductAnnouncementStateOptions,
  ): Promise<ProductAnnouncementRuntimeState> {
    const state = await productAnnouncementStorage.getState()
    const currentVersion =
      options.currentVersion?.trim() || getManifest().version || "0.0.0"
    const now = options.now ?? Date.now()
    const normalizeOptions = {
      currentVersion,
      locale: options.locale,
      now,
      dismissed: state.dismissed,
      seenAt: state.seenAt,
    }
    const bundledRuntimeFeed = getRuntimeProductAnnouncementFeed(bundledFeed)
    const cachedNormalized = state.cachedFeed
      ? isValidProductAnnouncementFeed(state.cachedFeed)
        ? normalizeProductAnnouncementFeed(
            getRuntimeProductAnnouncementFeed(state.cachedFeed),
            normalizeOptions,
          )
        : { notices: [], errors: ["malformed_feed"] }
      : null
    const normalized =
      cachedNormalized && cachedNormalized.errors.length === 0
        ? cachedNormalized
        : normalizeProductAnnouncementFeed(bundledRuntimeFeed, normalizeOptions)

    if (this.shouldRefresh(state.cachedFeed, state.lastFetchedAt, now)) {
      void this.refreshRemoteFeed()
    }

    return {
      view: selectProductAnnouncementView(normalized.notices),
      lastFetchedAt: state.lastFetchedAt,
    }
  }

  async refreshRemoteFeed(now = Date.now()): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this.performRemoteFeedRefresh(now).finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  private shouldRefresh(
    cachedFeed: RawProductAnnouncementFeed | undefined,
    lastFetchedAt: number | undefined,
    now: number,
  ): boolean {
    return (
      !cachedFeed ||
      typeof lastFetchedAt !== "number" ||
      now - lastFetchedAt >= REFRESH_INTERVAL_MS
    )
  }

  private async performRemoteFeedRefresh(now: number): Promise<boolean> {
    const abortController = new AbortController()
    const timeoutId = globalThis.setTimeout(() => {
      abortController.abort()
    }, REMOTE_FEED_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(PRODUCT_ANNOUNCEMENT_REMOTE_URL, {
        cache: "no-store",
        signal: abortController.signal,
      })
      if (!response.ok) {
        logger.warn("Failed to refresh product announcement feed", {
          status: response.status,
        })
        return false
      }

      const feed = (await response.json()) as RawProductAnnouncementFeed
      if (!isValidProductAnnouncementFeed(feed)) {
        logger.warn("Rejected malformed product announcement feed")
        return false
      }

      const normalized = normalizeProductAnnouncementFeed(feed, {
        currentVersion: getManifest().version || "0.0.0",
        locale: "zh-CN",
        now,
        dismissed: {},
        seenAt: {},
      })
      if (normalized.errors.length > 0) {
        logger.warn("Rejected invalid product announcement feed", {
          errors: normalized.errors,
        })
        return false
      }

      await productAnnouncementStorage.updateState((state) => {
        state.cachedFeed = feed
        state.lastFetchedAt = now
      })
      return true
    } catch (error) {
      logger.warn("Failed to refresh product announcement feed", error)
      return false
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  async markSeen(ids: string[], now = Date.now()): Promise<void> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) {
      return
    }

    await productAnnouncementStorage.updateState((state) => {
      for (const id of uniqueIds) {
        state.seenAt[id] = now
      }
    })
  }

  async dismiss(id: string, revision: number): Promise<void> {
    const trimmedId = id.trim()
    if (!trimmedId || !Number.isInteger(revision)) {
      return
    }

    await productAnnouncementStorage.updateState((state) => {
      state.dismissed[trimmedId] = revision
    })
  }

  async restore(id: string): Promise<void> {
    const trimmedId = id.trim()
    if (!trimmedId) {
      return
    }

    await productAnnouncementStorage.updateState((state) => {
      const dismissed = { ...state.dismissed }
      delete dismissed[trimmedId]
      state.dismissed = dismissed
    })
  }
}

export const productAnnouncementService = new ProductAnnouncementService()

let productAnnouncementsMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for product-announcement messages.
 */
export function setupProductAnnouncementMessagingListeners() {
  if (productAnnouncementsMessagingCleanup) {
    return
  }

  productAnnouncementsMessagingCleanup = [
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.GetState,
      ({ data }) => resolveProductAnnouncementGetStateMessage(data),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.Refresh,
      () => resolveProductAnnouncementRefreshMessage(),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.MarkSeen,
      ({ data }) => resolveProductAnnouncementMarkSeenMessage(data),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.Dismiss,
      ({ data }) => resolveProductAnnouncementDismissMessage(data),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.Restore,
      ({ data }) => resolveProductAnnouncementRestoreMessage(data),
    ),
  ]
}

/**
 * Accepts omitted timestamps and rejects non-finite runtime payload numbers.
 */
function isFiniteOptionalNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === "number" && Number.isFinite(value))
  )
}

/**
 * Validates and normalizes get-state requests from untrusted runtime messages.
 */
function normalizeProductAnnouncementGetStateRequest(
  request: ProductAnnouncementsGetStateRequest,
): ProductAnnouncementsGetStateRequest | null {
  if (!isPlainObject(request)) {
    return null
  }

  const locale = typeof request.locale === "string" ? request.locale.trim() : ""
  if (!locale) {
    return null
  }

  if (
    request.currentVersion !== undefined &&
    typeof request.currentVersion !== "string"
  ) {
    return null
  }

  if (!isFiniteOptionalNumber(request.now)) {
    return null
  }

  return {
    locale,
    ...(request.currentVersion !== undefined
      ? { currentVersion: request.currentVersion }
      : {}),
    ...(request.now !== undefined ? { now: request.now } : {}),
  }
}

/**
 * Validates mark-seen runtime payloads and trims every notice id.
 */
function normalizeProductAnnouncementMarkSeenRequest(
  request: ProductAnnouncementsMarkSeenRequest,
): ProductAnnouncementsMarkSeenRequest | null {
  if (!isPlainObject(request) || !Array.isArray(request.ids)) {
    return null
  }

  const ids: string[] = []
  for (const id of request.ids) {
    if (typeof id !== "string") {
      return null
    }

    const trimmedId = id.trim()
    if (!trimmedId) {
      return null
    }

    ids.push(trimmedId)
  }

  if (ids.length === 0) {
    return null
  }

  if (!isFiniteOptionalNumber(request.now)) {
    return null
  }

  return {
    ids,
    ...(request.now !== undefined ? { now: request.now } : {}),
  }
}

/**
 * Validates dismiss runtime payloads and trims the target notice id.
 */
function normalizeProductAnnouncementDismissRequest(
  request: ProductAnnouncementsDismissRequest,
): ProductAnnouncementsDismissRequest | null {
  if (!isPlainObject(request)) {
    return null
  }

  const id = typeof request.id === "string" ? request.id.trim() : ""
  if (!id) {
    return null
  }

  if (!Number.isInteger(request.revision) || request.revision <= 0) {
    return null
  }

  return {
    id,
    revision: request.revision,
  }
}

/**
 * Validates restore runtime payloads and trims the target notice id.
 */
function normalizeProductAnnouncementRestoreRequest(
  request: ProductAnnouncementsRestoreRequest,
): ProductAnnouncementsRestoreRequest | null {
  if (!isPlainObject(request)) {
    return null
  }

  const id = typeof request.id === "string" ? request.id.trim() : ""
  if (!id) {
    return null
  }

  return { id }
}

/**
 * Resolve a typed request for the current product-announcement state.
 */
export async function resolveProductAnnouncementGetStateMessage(
  request: ProductAnnouncementsGetStateRequest,
): Promise<RuntimeMessageResponse<ProductAnnouncementRuntimeState>> {
  try {
    const normalizedRequest =
      normalizeProductAnnouncementGetStateRequest(request)
    if (!normalizedRequest) {
      return createRuntimeMessageFailure(
        INVALID_PRODUCT_ANNOUNCEMENT_STATE_REQUEST_ERROR,
      )
    }

    return {
      success: true,
      data: await productAnnouncementService.getCurrentState(normalizedRequest),
    }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to refresh the product-announcement feed.
 */
export async function resolveProductAnnouncementRefreshMessage(): Promise<
  RuntimeMessageResponse<boolean>
> {
  try {
    return {
      success: true,
      data: await productAnnouncementService.refreshRemoteFeed(),
    }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to mark product announcements as seen.
 */
export async function resolveProductAnnouncementMarkSeenMessage(
  request: ProductAnnouncementsMarkSeenRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    const normalizedRequest =
      normalizeProductAnnouncementMarkSeenRequest(request)
    if (!normalizedRequest) {
      return createRuntimeMessageFailure(
        INVALID_PRODUCT_ANNOUNCEMENT_MARK_SEEN_REQUEST_ERROR,
      )
    }

    await productAnnouncementService.markSeen(
      normalizedRequest.ids,
      normalizedRequest.now,
    )
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to dismiss one product announcement revision.
 */
export async function resolveProductAnnouncementDismissMessage(
  request: ProductAnnouncementsDismissRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    const normalizedRequest =
      normalizeProductAnnouncementDismissRequest(request)
    if (!normalizedRequest) {
      return createRuntimeMessageFailure(
        INVALID_PRODUCT_ANNOUNCEMENT_DISMISS_REQUEST_ERROR,
      )
    }

    await productAnnouncementService.dismiss(
      normalizedRequest.id,
      normalizedRequest.revision,
    )
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to restore one dismissed product announcement.
 */
export async function resolveProductAnnouncementRestoreMessage(
  request: ProductAnnouncementsRestoreRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    const normalizedRequest =
      normalizeProductAnnouncementRestoreRequest(request)
    if (!normalizedRequest) {
      return createRuntimeMessageFailure(
        INVALID_PRODUCT_ANNOUNCEMENT_RESTORE_REQUEST_ERROR,
      )
    }

    await productAnnouncementService.restore(normalizedRequest.id)
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
