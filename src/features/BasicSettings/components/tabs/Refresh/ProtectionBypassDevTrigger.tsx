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

/** Resolves the localized label for a controlled existing-behavior preset. */
function getPresetLabel(t: TFunction, id: ShieldDevTriggerPresetId) {
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
      clearTimers()
    }
  }, [clearTimers])

  const execute = useCallback(
    async (targetUrl: string) => {
      clearTimers()
      setRemainingSeconds(null)
      setIsRunning(true)
      setFeedback(null)

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
            message:
              response.error ?? t("refresh.shieldDevTriggerFailureFallback"),
          })
        }
      } catch (error) {
        if (!isMountedRef.current) return
        setFeedback({ kind: "error", message: getErrorMessage(error) })
      } finally {
        if (isMountedRef.current) setIsRunning(false)
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
  }, [clearTimers])

  if (!isDevelopmentMode()) return null

  const isWaiting = remainingSeconds !== null
  const isBusy = isWaiting || isRunning

  return (
    <CardItem
      title={t("refresh.shieldDevTriggerTitle")}
      description={t("refresh.shieldDevTriggerDescription")}
      rightContent={
        <div className="grid w-full min-w-0 gap-3 text-left [@container(min-width:42rem)]:min-w-[32rem]">
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
                      {getPresetLabel(t, preset.id)}
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
                  seconds: remainingSeconds,
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
        </div>
      }
    />
  )
}
