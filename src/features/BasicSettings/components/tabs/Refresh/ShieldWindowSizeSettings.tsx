import { useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingsResetButton } from "~/components/SettingsResetButton"
import { CardItem, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
import {
  DEFAULT_TEMP_WINDOW_SIZE,
  isValidTempWindowDimension,
  normalizeTempWindowFallbackPreferences,
  TEMP_WINDOW_SIZE_LIMITS,
} from "~/services/preferences/tempWindowFallbackPreferences"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

import { SHIELD_SETTINGS_TARGET_IDS } from "./searchTargets"

/** Valid dimensions save on blur/Enter; reset persists both dimensions together. */
export function ShieldWindowSizeSettings() {
  const { t } = useTranslation("settings")
  const { preferences, tempWindowFallback, updateTempWindowFallback } =
    useUserPreferencesContext()
  const saved = normalizeTempWindowFallbackPreferences(tempWindowFallback)
  const [resetting, setResetting] = useState(false)
  const [failed, setFailed] = useState(false)
  const commitDimension = async (
    key: "windowWidth" | "windowHeight",
    draft: string,
  ) => {
    const value = Number(draft)
    if (!isValidTempWindowDimension(value)) return { ok: false }
    setFailed(false)
    try {
      const result = await updateTempWindowFallback({ [key]: value })
      showUpdateToast(result, t("refresh.shieldWindowSizeTitle"))
      setFailed(!result.ok)
      return { ok: result.ok }
    } catch {
      setFailed(true)
      return { ok: false }
    }
  }
  const width = useDeferredPreferenceField({
    savedValue: String(saved.windowWidth),
    savedVersion: preferences?.lastUpdated ?? 0,
    preserveDraftOnError: true,
    onCommit: (draft) => commitDimension("windowWidth", draft),
  })
  const height = useDeferredPreferenceField({
    savedValue: String(saved.windowHeight),
    savedVersion: preferences?.lastUpdated ?? 0,
    preserveDraftOnError: true,
    onCommit: (draft) => commitDimension("windowHeight", draft),
  })
  const reset = async () => {
    if (resetting) return
    setResetting(true)
    setFailed(false)
    try {
      const result = await updateTempWindowFallback(DEFAULT_TEMP_WINDOW_SIZE)
      showUpdateToast(result, t("refresh.shieldWindowSizeTitle"))
      if (result.ok) {
        width.setDraft(String(DEFAULT_TEMP_WINDOW_SIZE.windowWidth))
        height.setDraft(String(DEFAULT_TEMP_WINDOW_SIZE.windowHeight))
      }
      setFailed(!result.ok)
    } catch {
      setFailed(true)
    } finally {
      setResetting(false)
    }
  }
  return (
    <CardItem
      id={SHIELD_SETTINGS_TARGET_IDS.windowSize}
      title={t("refresh.shieldWindowSizeTitle")}
      description={t("refresh.shieldWindowSizeDesc")}
      rightContent={
        <div>
          <fieldset
            disabled={resetting}
            className="gap-y-density-2 flex flex-wrap items-end justify-end gap-x-2"
          >
            {(
              [
                [width, t("refresh.shieldWindowWidth")],
                [height, t("refresh.shieldWindowHeight")],
              ] as const
            ).map(([field, label]) => (
              <label
                key={label}
                className="gap-y-density-1 flex flex-col gap-x-1 text-sm"
              >
                {label}
                <Input
                  type="number"
                  required
                  min={TEMP_WINDOW_SIZE_LIMITS.min}
                  max={TEMP_WINDOW_SIZE_LIMITS.max}
                  step={1}
                  className="w-24"
                  value={field.draft}
                  disabled={field.isCommitting}
                  onChange={(event) => field.setDraft(event.target.value)}
                  onBlur={(event) => {
                    if (event.currentTarget.reportValidity())
                      void field.commit()
                  }}
                  onKeyDown={field.handleKeyDown}
                />
              </label>
            ))}
            <SettingsResetButton
              label={t("refresh.shieldWindowSizeReset")}
              disabled={
                resetting ||
                width.isCommitting ||
                height.isCommitting ||
                (Number(width.draft) === DEFAULT_TEMP_WINDOW_SIZE.windowWidth &&
                  Number(height.draft) ===
                    DEFAULT_TEMP_WINDOW_SIZE.windowHeight &&
                  saved.windowWidth === DEFAULT_TEMP_WINDOW_SIZE.windowWidth &&
                  saved.windowHeight === DEFAULT_TEMP_WINDOW_SIZE.windowHeight)
              }
              onClick={() => void reset()}
            />
          </fieldset>
          {failed && (
            <p role="alert" className="text-destructive-text text-sm">
              {t("messages.saveSettingsFailed")}
            </p>
          )}
        </div>
      }
    />
  )
}
