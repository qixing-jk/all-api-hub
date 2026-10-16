import {
  getShieldDevTriggerPreset,
  SHIELD_DEV_TRIGGER_PRESET_IDS,
  type ShieldDevTriggerPresetId,
} from "~/features/BasicSettings/components/tabs/Refresh/automaticFeatureSettings"
import {
  createAutomaticProtectionBypassExecution,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import type { TempWindowFetch } from "~/types/tempWindowFetch"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

export const SHIELD_DEV_TRIGGER_DELAY_SECONDS = {
  Default: 5,
  Min: 0,
  Max: 3_600,
} as const

export const SHIELD_DEV_TRIGGER_DEFAULT_URL = "https://example.com/"
export const SHIELD_DEV_TURNSTILE_DEFAULT_URL = "http://127.0.0.1:8787/"

/** Normalizes the developer-supplied target while rejecting non-HTTP schemes. */
export function normalizeShieldDevTriggerUrl(value: string): string | null {
  return tryParseHttpUrl(value.trim())?.toString() ?? null
}

/** Accepts a bounded whole-second delay suitable for an interactive dev tool. */
export function parseShieldDevTriggerDelay(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isInteger(parsed) &&
    parsed >= SHIELD_DEV_TRIGGER_DELAY_SECONDS.Min &&
    parsed <= SHIELD_DEV_TRIGGER_DELAY_SECONDS.Max
    ? parsed
    : null
}

/** Executes one existing automatic root through its already-permitted fallback task. */
export async function executeShieldDevTrigger(params: {
  presetId: ShieldDevTriggerPresetId
  url: string
}): Promise<TempWindowFetch> {
  if (!isDevelopmentMode()) {
    throw new Error(
      "The protection bypass development trigger is unavailable outside development mode.",
    )
  }

  const preset = getShieldDevTriggerPreset(params.presetId)
  const execution = createAutomaticProtectionBypassExecution(
    preset.feature,
    preset.trigger,
    preset.surface,
  )

  if ("turnstileScenario" in preset) {
    const target = new URL(params.url)
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
      throw new Error(
        "Turnstile development presets require a loopback test server.",
      )
    }
    const count =
      preset.id === SHIELD_DEV_TRIGGER_PRESET_IDS.TurnstileQueue ? 3 : 1
    const firstPort = Number(
      target.port || (target.protocol === "https:" ? 443 : 80),
    )
    if (firstPort + count - 1 > 65535)
      throw new Error("Invalid Turnstile test server port.")
    const results = await Promise.allSettled(
      Array.from({ length: count }, (_, index) => {
        const site = new URL(target.origin)
        site.port = String(firstPort + index)
        return executeProtectionBypassTask({
          execution,
          task: {
            kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
            params: {
              originUrl: site.origin,
              pageUrl: `${site.origin}/?scenario=${preset.turnstileScenario}`,
              fetchUrl: `${site.origin}/verify`,
              fetchOptions: { method: "POST", credentials: "omit", body: "{}" },
              requestId: safeRandomUUID("shield-dev-turnstile"),
              responseType: "json",
              turnstileTokenPlacement: "json-body",
            },
          },
        })
      }),
    )
    if (count === 1) {
      const result = results[0]!
      if (result.status === "rejected") throw result.reason
      return result.value
    }
    const failures = results.flatMap((result, index) => {
      const error =
        result.status === "rejected"
          ? getErrorMessage(result.reason)
          : result.value.success
            ? null
            : result.value.error || "Verification failed"
      return error ? [`${index + 1}: ${error}`] : []
    })
    return failures.length
      ? { success: false, error: failures.join("; ") }
      : { success: true, status: 200 }
  }

  return await executeProtectionBypassTask({
    execution,
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
      params: {
        originUrl: params.url,
        fetchUrl: params.url,
        fetchOptions: {
          credentials: "include",
          method: "GET",
        },
        requestId: safeRandomUUID("shield-dev-trigger"),
        responseType: "text",
      },
    },
  })
}
