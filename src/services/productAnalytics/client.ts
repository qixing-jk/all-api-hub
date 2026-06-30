// eslint-disable-next-line import/no-named-as-default
import posthog, { type Properties } from "posthog-js/dist/module.no-external"

import { getExtensionVersion } from "~/utils/browser/browserApi"
import { detectBrowserFamily } from "~/utils/browser/userAgent"
import { isDevBuild } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"
import i18n from "~/utils/i18n/core"

import {
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEventName,
} from "./contracts"
import { productAnalyticsPreferences } from "./preferences"
import { sanitizeProductAnalyticsEvent } from "./privacy"

const logger = createLogger("ProductAnalyticsClient")
const DEVELOPMENT_DISTINCT_ID = "analytics-development"
const PRODUCT_ANALYTICS_POLICY_FLAG_KEY = "aah-product-analytics-policy"

type PostHogConfig = {
  projectToken: string
  host: string
}

type SanitizedCapture = {
  config: PostHogConfig
  properties: Properties
}

type ProductAnalyticsPolicyPayload = {
  disabledEvents?: string[]
  disabledFeatureIds?: string[]
  disabledActionIds?: string[]
}

let initialized = false

/**
 * Reads build-time PostHog configuration and disables analytics when incomplete.
 */
function readConfig(): PostHogConfig | null {
  const projectToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim()
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim()
  if (!projectToken || !host) return null
  return { projectToken, host }
}

/**
 * Initializes the bundled PostHog client once with passive collection disabled.
 */
function initializePostHog(config: PostHogConfig, distinctId: string) {
  if (initialized) return

  posthog.init(config.projectToken, {
    api_host: config.host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    save_referrer: false,
    save_campaign_params: false,
    disable_session_recording: true,
    disable_external_dependency_loading: true,
    disable_persistence: true,
    bootstrap: {
      distinctID: distinctId,
    },
  })
  initialized = true
}

/**
 * Resolves the current UI language; PostHog already sends browser language as
 * $browser_language, so this custom field tracks the app interface language.
 */
function resolveLanguage(): string {
  return (
    i18n.resolvedLanguage ||
    i18n.language ||
    globalThis.navigator?.language ||
    "unknown"
  )
}

/**
 * Builds shared, non-identifying context attached to every analytics event.
 */
function buildSharedContext() {
  return {
    app_version: getExtensionVersion("unknown"),
    browser_family: detectBrowserFamily(),
    ui_language: resolveLanguage(),
  }
}

/**
 * Checks whether sanitized properties are sufficient to emit this event.
 */
function shouldCaptureEvent(
  eventName: ProductAnalyticsEventName,
  properties: Properties,
): boolean {
  return (
    Object.keys(properties).length > 0 ||
    eventName === PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot
  )
}

/**
 * Keeps only string entries from untrusted PostHog feature flag payload fields.
 */
function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

/**
 * Reads the optional PostHog-hosted analytics policy payload.
 */
function readAnalyticsPolicyPayload(): ProductAnalyticsPolicyPayload {
  const payload = posthog.getFeatureFlagPayload(
    PRODUCT_ANALYTICS_POLICY_FLAG_KEY,
  )
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {}
  }

  const policy = payload as Record<string, unknown>
  return {
    disabledEvents: normalizeStringList(policy.disabledEvents),
    disabledFeatureIds: normalizeStringList(policy.disabledFeatureIds),
    disabledActionIds: normalizeStringList(policy.disabledActionIds),
  }
}

/**
 * Checks whether the sanitized event is suppressed by the remote policy.
 */
function isDisabledByPolicy(
  eventName: ProductAnalyticsEventName,
  properties: Properties,
): boolean {
  const policy = readAnalyticsPolicyPayload()
  if (policy.disabledEvents?.includes(eventName)) return true

  const featureId =
    typeof properties.feature_id === "string" ? properties.feature_id : ""
  if (featureId && policy.disabledFeatureIds?.includes(featureId)) return true

  const actionId =
    typeof properties.action_id === "string" ? properties.action_id : ""
  return Boolean(actionId && policy.disabledActionIds?.includes(actionId))
}

/**
 * Collapses local development traffic into one stable PostHog profile.
 */
function resolveDistinctId(anonymousId: string): string {
  if (isDevBuild()) {
    return DEVELOPMENT_DISTINCT_ID
  }

  return anonymousId
}

/**
 * Resolves config and sanitized properties before entering anonymous-id work.
 */
function prepareCapture(
  eventName: ProductAnalyticsEventName,
  rawProperties: unknown,
): SanitizedCapture | null {
  const config = readConfig()
  if (!config) return null

  const properties = sanitizeProductAnalyticsEvent(eventName, rawProperties)
  if (!shouldCaptureEvent(eventName, properties)) return null

  return { config, properties }
}

/**
 * Initializes PostHog and emits the event only after enabled anonymous id lookup.
 */
async function captureWithAnonymousId(
  eventName: ProductAnalyticsEventName,
  capture: SanitizedCapture,
): Promise<boolean> {
  const captured = await productAnalyticsPreferences.withAnonymousIdIfEnabled(
    async (anonymousId) => {
      const distinctId = resolveDistinctId(anonymousId)

      initializePostHog(capture.config, distinctId)

      if (isDisabledByPolicy(eventName, capture.properties)) {
        return false
      }

      posthog.capture(eventName, {
        ...buildSharedContext(),
        ...capture.properties,
      })

      return true
    },
  )

  return captured ?? false
}

/**
 * Captures privacy-filtered product analytics through PostHog when enabled.
 */
class ProductAnalyticsClient {
  /**
   * Sanitizes and captures a product analytics event.
   */
  async capture(
    eventName: ProductAnalyticsEventName,
    rawProperties: unknown,
  ): Promise<boolean> {
    try {
      if (!(await productAnalyticsPreferences.isEnabled())) return false

      const capture = prepareCapture(eventName, rawProperties)
      if (!capture) return false

      return await captureWithAnonymousId(eventName, capture)
    } catch (error) {
      if (isDevBuild()) {
        logger.debug("Failed to capture product analytics event", error)
      }
      return false
    }
  }
}

export const productAnalyticsClient = new ProductAnalyticsClient()
