import type { TFunction } from "i18next"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Button,
  CardItem,
  Input,
  Label,
  Muted,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  BROWSER_FOCUS_STATES,
  BROWSER_FOCUS_TRANSITIONS,
  createBrowserFocusObservation,
  readBrowserFocusState,
  type BrowserFocusObservation,
  type BrowserFocusObservationController,
  type BrowserFocusState,
  type BrowserFocusTransition,
} from "~/utils/browser/browserFocus"
import { assertNever } from "~/utils/core/assert"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"

import {
  DEFAULT_SHIELD_DEV_TRIGGER_PRESET_ID,
  SHIELD_DEV_TRIGGER_PRESET_IDS,
  SHIELD_DEV_TRIGGER_PRESETS,
  type ShieldDevTriggerPresetId,
} from "./automaticFeatureSettings"
import {
  executeShieldDevTrigger,
  normalizeShieldDevTriggerUrl,
  parseShieldDevTriggerDelay,
  SHIELD_DEV_TRIGGER_DEFAULT_URL,
  SHIELD_DEV_TRIGGER_DELAY_SECONDS,
} from "./protectionBypassDevTriggerRuntime"

type TriggerFeedback =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | null

const UNKNOWN_BROWSER_FOCUS_OBSERVATION = {
  start: BROWSER_FOCUS_STATES.Unknown,
  transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
  end: BROWSER_FOCUS_STATES.Unknown,
} satisfies BrowserFocusObservation

/** Resolves the localized label for a controlled browser-focus state. */
function getBrowserFocusStateLabel(t: TFunction, state: BrowserFocusState) {
  switch (state) {
    case BROWSER_FOCUS_STATES.Focused:
      return t("settings:refresh.shieldDevFocusStateFocused")
    case BROWSER_FOCUS_STATES.Unfocused:
      return t("settings:refresh.shieldDevFocusStateUnfocused")
    case BROWSER_FOCUS_STATES.Unknown:
      return t("settings:refresh.shieldDevFocusStateUnknown")
    default:
      return assertNever(state, `Unexpected browser focus state: ${state}`)
  }
}

/** Resolves the localized label for a controlled browser-focus transition. */
function getBrowserFocusTransitionLabel(
  t: TFunction,
  transition: BrowserFocusTransition,
) {
  switch (transition) {
    case BROWSER_FOCUS_TRANSITIONS.RemainedFocused:
      return t("settings:refresh.shieldDevFocusTransitionRemainedFocused")
    case BROWSER_FOCUS_TRANSITIONS.RemainedUnfocused:
      return t("settings:refresh.shieldDevFocusTransitionRemainedUnfocused")
    case BROWSER_FOCUS_TRANSITIONS.Foregrounded:
      return t("settings:refresh.shieldDevFocusTransitionForegrounded")
    case BROWSER_FOCUS_TRANSITIONS.Backgrounded:
      return t("settings:refresh.shieldDevFocusTransitionBackgrounded")
    case BROWSER_FOCUS_TRANSITIONS.Mixed:
      return t("settings:refresh.shieldDevFocusTransitionMixed")
    case BROWSER_FOCUS_TRANSITIONS.Unknown:
      return t("settings:refresh.shieldDevFocusTransitionUnknown")
    default:
      return assertNever(
        transition,
        `Unexpected browser focus transition: ${transition}`,
      )
  }
}

/** Resolves the localized label for a controlled existing-behavior preset. */
export function getShieldDevTriggerPresetLabel(
  t: TFunction,
  id: ShieldDevTriggerPresetId,
) {
  switch (id) {
    case SHIELD_DEV_TRIGGER_PRESET_IDS.AccountRefreshScheduled:
      return t("settings:refresh.shieldDevTriggerPresetAccountRefreshScheduled")
    case SHIELD_DEV_TRIGGER_PRESET_IDS.BalanceHistoryScheduled:
      return t("settings:refresh.shieldDevTriggerPresetBalanceHistoryScheduled")
    case SHIELD_DEV_TRIGGER_PRESET_IDS.CheckinScheduled:
      return t("settings:refresh.shieldDevTriggerPresetCheckinScheduled")
    case SHIELD_DEV_TRIGGER_PRESET_IDS.RedemptionAssistRecovery:
      return t(
        "settings:refresh.shieldDevTriggerPresetRedemptionAssistRecovery",
      )
    case SHIELD_DEV_TRIGGER_PRESET_IDS.LdohSiteLookupRecovery:
      return t("settings:refresh.shieldDevTriggerPresetLdohSiteLookupRecovery")
    case SHIELD_DEV_TRIGGER_PRESET_IDS.KeyManagementRecovery:
      return t("settings:refresh.shieldDevTriggerPresetKeyManagementRecovery")
    default:
      return assertNever(id, `Unexpected development trigger preset: ${id}`)
  }
}

/** Development-only delayed harness for realistic protection-bypass roots. */
export function ProtectionBypassDevTrigger() {
  const { t } = useTranslation("settings")
  const [presetId, setPresetId] = useState<ShieldDevTriggerPresetId>(
    DEFAULT_SHIELD_DEV_TRIGGER_PRESET_ID,
  )
  const [url, setUrl] = useState(SHIELD_DEV_TRIGGER_DEFAULT_URL)
  const [delay, setDelay] = useState(
    String(SHIELD_DEV_TRIGGER_DELAY_SECONDS.Default),
  )
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [feedback, setFeedback] = useState<TriggerFeedback>(null)
  const [focusObservation, setFocusObservation] =
    useState<BrowserFocusObservation | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const focusObservationControllerRef =
    useRef<BrowserFocusObservationController | null>(null)
  const isMountedRef = useRef(true)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      const focusObservationController = focusObservationControllerRef.current
      focusObservationControllerRef.current = null
      focusObservationController?.cancel()
      clearTimers()
    }
  }, [clearTimers])

  const execute = useCallback(
    async (targetUrl: string) => {
      clearTimers()
      setRemainingSeconds(null)
      setIsRunning(true)
      setFeedback(null)
      const failureFallback = t("refresh.shieldDevTriggerFailureFallback")
      let focusObservationController: BrowserFocusObservationController | null =
        null

      try {
        const start = await readBrowserFocusState()
        if (!isMountedRef.current) return

        focusObservationController = createBrowserFocusObservation(start)
        focusObservationControllerRef.current = focusObservationController
      } catch {
        // Focus diagnostics must never replace the protected request result.
      }

      if (!isMountedRef.current) return

      try {
        const response = await executeShieldDevTrigger({
          presetId,
          url: targetUrl,
        })
        if (!isMountedRef.current) return

        if (response.success) {
          setFeedback({
            kind: "success",
            message: t("refresh.shieldDevTriggerSuccess", {
              status: response.status ?? "-",
            }),
          })
        } else {
          setFeedback({
            kind: "error",
            message: response.error?.trim() || failureFallback,
          })
        }
      } catch (error) {
        if (!isMountedRef.current) return
        setFeedback({
          kind: "error",
          message: getErrorMessage(error, failureFallback),
        })
      } finally {
        let completedObservation: BrowserFocusObservation =
          UNKNOWN_BROWSER_FOCUS_OBSERVATION
        if (focusObservationController) {
          try {
            completedObservation = await focusObservationController.finish()
          } catch {
            // A failed diagnostic remains neutral and does not affect feedback.
          }

          if (
            focusObservationControllerRef.current === focusObservationController
          ) {
            focusObservationControllerRef.current = null
          }
        }

        if (isMountedRef.current) {
          setFocusObservation(completedObservation)
          setIsRunning(false)
        }
      }
    },
    [clearTimers, presetId, t],
  )

  const handleStart = useCallback(() => {
    const normalizedUrl = normalizeShieldDevTriggerUrl(url)
    if (!normalizedUrl) {
      setFeedback({
        kind: "error",
        message: t("refresh.shieldDevTriggerInvalidUrl"),
      })
      return
    }

    const delaySeconds = parseShieldDevTriggerDelay(delay)
    if (delaySeconds === null) {
      setFeedback({
        kind: "error",
        message: t("refresh.shieldDevTriggerInvalidDelay", {
          maxSeconds: SHIELD_DEV_TRIGGER_DELAY_SECONDS.Max,
        }),
      })
      return
    }

    setFeedback(null)
    setFocusObservation(null)
    if (delaySeconds === 0) {
      void execute(normalizedUrl)
      return
    }

    const deadline = Date.now() + delaySeconds * 1_000
    setRemainingSeconds(delaySeconds)
    countdownRef.current = setInterval(() => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)),
      )
    }, 250)
    timeoutRef.current = setTimeout(() => {
      void execute(normalizedUrl)
    }, delaySeconds * 1_000)
  }, [delay, execute, t, url])

  const handleCancel = useCallback(() => {
    clearTimers()
    setRemainingSeconds(null)
    setFeedback(null)
    setFocusObservation(null)
  }, [clearTimers])

  if (!isDevelopmentMode()) return null

  const isWaiting = remainingSeconds !== null
  const isBusy = isWaiting || isRunning

  return (
    <CardItem
      title={t("refresh.shieldDevTriggerTitle")}
      description={t("refresh.shieldDevTriggerDescription")}
      rightContentClassName="sm:flex-1"
      rightContent={
        <div
          data-testid="shield-dev-trigger-form"
          className="grid w-full min-w-0 gap-3 text-left"
        >
          <div className="grid gap-3 [@container(min-width:42rem)]:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="shield-dev-trigger-preset">
                {t("refresh.shieldDevTriggerPresetLabel")}
              </Label>
              <Select
                value={presetId}
                onValueChange={(value) =>
                  setPresetId(value as ShieldDevTriggerPresetId)
                }
                disabled={isBusy}
              >
                <SelectTrigger
                  id="shield-dev-trigger-preset"
                  aria-label={t("refresh.shieldDevTriggerPresetLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIELD_DEV_TRIGGER_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {getShieldDevTriggerPresetLabel(t, preset.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shield-dev-trigger-delay">
                {t("refresh.shieldDevTriggerDelayLabel")}
              </Label>
              <Input
                id="shield-dev-trigger-delay"
                type="number"
                min={SHIELD_DEV_TRIGGER_DELAY_SECONDS.Min}
                max={SHIELD_DEV_TRIGGER_DELAY_SECONDS.Max}
                step={1}
                value={delay}
                onChange={(event) => setDelay(event.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shield-dev-trigger-url">
              {t("refresh.shieldDevTriggerUrlLabel")}
            </Label>
            <Input
              id="shield-dev-trigger-url"
              type="url"
              placeholder="https://example.invalid/protected"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={isBusy}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isWaiting ? (
              <Button size="sm" variant="outline" onClick={handleCancel}>
                {t("refresh.shieldDevTriggerCancel")}
              </Button>
            ) : (
              <Button size="sm" onClick={handleStart} disabled={isRunning}>
                {isRunning
                  ? t("refresh.shieldDevTriggerRunning")
                  : t("refresh.shieldDevTriggerStart")}
              </Button>
            )}
            {isWaiting && (
              <Muted role="status">
                {t("refresh.shieldDevTriggerCountdown", {
                  count: remainingSeconds,
                })}
              </Muted>
            )}
          </div>
          {feedback && (
            <BodySmall
              role={feedback.kind === "error" ? "alert" : "status"}
              className={
                feedback.kind === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-700 dark:text-green-400"
              }
            >
              {feedback.message}
            </BodySmall>
          )}
          {focusObservation && (
            <div
              role="group"
              aria-label={t("refresh.shieldDevFocusTitle")}
              className="grid gap-1"
            >
              <BodySmall className="font-medium">
                {t("refresh.shieldDevFocusTitle")}
              </BodySmall>
              <div className="grid gap-0.5">
                <Muted>
                  {t("refresh.shieldDevFocusStart", {
                    state: getBrowserFocusStateLabel(t, focusObservation.start),
                  })}
                </Muted>
                <Muted>
                  {t("refresh.shieldDevFocusDuring", {
                    transition: getBrowserFocusTransitionLabel(
                      t,
                      focusObservation.transition,
                    ),
                  })}
                </Muted>
                <Muted>
                  {t("refresh.shieldDevFocusEnd", {
                    state: getBrowserFocusStateLabel(t, focusObservation.end),
                  })}
                </Muted>
              </div>
            </div>
          )}
        </div>
      }
    />
  )
}
