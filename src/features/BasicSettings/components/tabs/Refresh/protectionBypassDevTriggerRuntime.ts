import {
  createAutomaticProtectionBypassExecution,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import type { TempWindowFetch } from "~/types/tempWindowFetch"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import {
  getShieldDevTriggerPreset,
  type ShieldDevTriggerPresetId,
} from "./automaticFeatureSettings"

export const SHIELD_DEV_TRIGGER_DELAY_SECONDS = {
  Default: 5,
  Min: 0,
  Max: 3_600,
} as const

export const SHIELD_DEV_TRIGGER_DEFAULT_URL = "https://example.com/"

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
  const preset = getShieldDevTriggerPreset(params.presetId)
  const execution = createAutomaticProtectionBypassExecution(
    preset.feature,
    preset.trigger,
    preset.surface,
  )

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
