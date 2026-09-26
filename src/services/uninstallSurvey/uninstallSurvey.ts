import { Storage } from "@plasmohq/storage"

import { DOCS_BASE_URL } from "~/constants/about"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { productAnalyticsPreferences } from "~/services/productAnalytics/preferences"
import {
  getExtensionVersion,
  setUninstallUrl,
} from "~/utils/browser/browserApi"
import { isDevBuild, isTestMode } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"
import i18n from "~/utils/i18n/core"

/**
 * Unified logger scoped to the uninstall survey URL service.
 */
const logger = createLogger("UninstallSurvey")

/**
 * Chromium caps the uninstall URL at 255 characters.
 */
const MAX_UNINSTALL_URL_LENGTH = 255

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Survey page served next to the docs site when the browser host supports it.
 */
const DEFAULT_SURVEY_PAGE_PATH = "uninstall.html"

/**
 * Resolves the default survey page: a build-time override when present, and the
 * page served next to the docs site otherwise. Exported so the dev panel can
 * show which page the default target resolves to.
 */
export function resolveSurveyPageUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_UNINSTALL_SURVEY_URL?.trim()
  if (configured) return configured
  return `${DOCS_BASE_URL}${DEFAULT_SURVEY_PAGE_PATH}`
}

/** Optional per-call overrides, used by the dev panel's target switch. */
export interface UninstallSurveyUrlOptions {
  /**
   * Survey page to compose against instead of the resolved default, so local
   * testing can point at a dev server or another self-hosted page.
   */
  baseUrl?: string
}

/**
 * Local testing override.
 *
 * Development and test builds skip the automatic background registration so
 * local uninstalls never reach the production survey page. Setting
 * `VITE_PUBLIC_UNINSTALL_SURVEY_DEV=1` re-enables that automatic registration
 * (pair it with `VITE_PUBLIC_UNINSTALL_SURVEY_URL` so the URL points at a
 * local page instead of the deployed one). One-off manual registration is
 * always available through the dev panel regardless of this flag.
 */
function isLocalTestOverrideEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_UNINSTALL_SURVEY_DEV === "1"
}

/**
 * Resolves the current UI language; mirrors the shared analytics context so
 * uninstall responses stay aligned with PostHog event properties.
 */
function resolveUiLanguage(): string {
  return (
    i18n.resolvedLanguage ||
    i18n.language ||
    globalThis.navigator?.language ||
    "unknown"
  )
}

interface UninstallSurveyState {
  firstSeenAt?: number
}

/**
 * Normalizes persisted uninstall survey state.
 */
function normalizeState(value: unknown): UninstallSurveyState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const firstSeenAt = (value as UninstallSurveyState).firstSeenAt
  return typeof firstSeenAt === "number" && Number.isFinite(firstSeenAt)
    ? { firstSeenAt }
    : {}
}

/**
 * Keeps the browser-side uninstall URL pointing at the hosted survey page with
 * compact, privacy-safe context (anonymous analytics id, version, install age,
 * UI language). The browser opens this URL after the extension is removed, so
 * everything the page needs must be encoded before uninstall time.
 */
class UninstallSurveyService {
  private storage = new Storage({ area: "local" })

  /**
   * Recomputes and registers the uninstall survey URL.
   *
   * Safe to call on every service worker startup; each call only reads the
   * first-seen marker and calls the browser API. Skipped for development and
   * test builds unless the local testing override is set, so local traffic
   * never reaches the production survey page.
   */
  async refresh(): Promise<boolean> {
    if (!isLocalTestOverrideEnabled() && (isDevBuild() || isTestMode())) {
      return false
    }
    return (await this.registerNow()) !== null
  }

  /**
   * Composes the survey URL without registering it or persisting anything.
   * Used by the dev panel to inspect the parameters before registration.
   */
  async composeUrl(
    options?: UninstallSurveyUrlOptions,
  ): Promise<string | null> {
    try {
      // A missing marker simply means "installed recently", and an unreadable
      // store previews the same way instead of failing the compose.
      const firstSeenAt = (await this.readState())?.firstSeenAt ?? Date.now()
      return await this.buildSurveyUrl(firstSeenAt, options?.baseUrl)
    } catch (error) {
      logger.warn("Failed to compose uninstall survey URL", error)
      return null
    }
  }

  /**
   * Explicitly registers the composed URL.
   *
   * Called from the dev panel as a user gesture, so it intentionally bypasses
   * the dev/test skip that gates the automatic background refresh.
   */
  async registerNow(
    options?: UninstallSurveyUrlOptions,
  ): Promise<string | null> {
    try {
      const firstSeenAt = await this.ensureFirstSeenAt()
      if (firstSeenAt === null) return null

      const url = await this.buildSurveyUrl(firstSeenAt, options?.baseUrl)
      if (!(await setUninstallUrl(url))) return null

      if (isDevBuild() || isLocalTestOverrideEnabled()) {
        // The logger strips query strings from URL values, so surface the
        // parameters explicitly for local verification.
        logger.info("Uninstall survey URL registered", {
          surveyParams: new URL(url).searchParams.toString(),
        })
      }
      return url
    } catch (error) {
      logger.warn("Failed to register uninstall survey URL", error)
      return null
    }
  }

  /**
   * Clears the registered uninstall URL (empty string is the documented
   * "open nothing" value on browsers that support the API).
   */
  async clear(): Promise<boolean> {
    return await setUninstallUrl("")
  }

  /**
   * Reads the persisted state without writing.
   *
   * Returns `null` only when storage cannot be read, which callers treat as
   * "unknown" rather than "no install date yet"; an absent or malformed value
   * normalizes to an empty state instead.
   */
  private async readState(): Promise<UninstallSurveyState | null> {
    try {
      return normalizeState(
        await this.storage.get(STORAGE_KEYS.UNINSTALL_SURVEY_STATE),
      )
    } catch (error) {
      logger.warn("Failed to read uninstall survey state", error)
      return null
    }
  }

  /**
   * Resolves the first-seen timestamp, persisting it once as a proxy for the
   * install time. Returns null when storage cannot be read so we never write
   * on top of an unknown base.
   */
  private async ensureFirstSeenAt(): Promise<number | null> {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.UNINSTALL_SURVEY,
      async () => {
        const state = await this.readState()
        if (!state) return null

        if (typeof state.firstSeenAt === "number") {
          return state.firstSeenAt
        }

        const firstSeenAt = Date.now()
        await this.storage.set(STORAGE_KEYS.UNINSTALL_SURVEY_STATE, {
          firstSeenAt,
        })
        return firstSeenAt
      },
    )
  }

  /**
   * Builds the survey page URL with compact context parameters.
   *
   * The anonymous id is only included while product analytics is enabled; when
   * analytics is disabled the URL still carries the non-identifying context so
   * the survey stays functional without linking to prior behavior.
   */
  private async buildSurveyUrl(
    firstSeenAt: number,
    baseUrlOverride?: string,
  ): Promise<string> {
    const base = baseUrlOverride?.trim() || resolveSurveyPageUrl()
    const params = new URLSearchParams()

    const anonymousId =
      await productAnalyticsPreferences.getAnonymousIdIfEnabled()
    if (anonymousId) {
      params.set("uid", anonymousId)
    }

    // Empty fallback on purpose: a version the manifest does not carry is
    // omitted from the URL rather than reported as `0.0.0`.
    const version = getExtensionVersion("")
    if (version) {
      params.set("v", version)
    }

    const daysSinceFirstSeen = Math.max(
      0,
      Math.floor((Date.now() - firstSeenAt) / DAY_MS),
    )
    params.set("d", String(daysSinceFirstSeen))
    params.set("lang", resolveUiLanguage())

    const url = `${base}?${params.toString()}`
    if (url.length > MAX_UNINSTALL_URL_LENGTH) {
      logger.warn(
        "Uninstall survey URL exceeds browser limit; using bare URL",
        {
          length: url.length,
        },
      )
      return base
    }
    return url
  }
}

export const uninstallSurveyService = new UninstallSurveyService()
