import { useTranslation } from "react-i18next"

import { Button, CardItem, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceDraft } from "~/hooks/useDeferredPreferenceDraft"
import {
  DEFAULT_TEMP_WINDOW_SIZE,
  isValidTempWindowDimension,
  normalizeTempWindowFallbackPreferences,
  TEMP_WINDOW_SIZE_LIMITS,
} from "~/services/preferences/tempWindowFallbackPreferences"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

import { SHIELD_SETTINGS_TARGET_IDS } from "./searchTargets"

/** Edits the initial dimensions shared by verification windows. */
export function ShieldWindowSizeSettings() {
  const { t } = useTranslation("settings")
  const { preferences, tempWindowFallback, updateTempWindowFallback } =
    useUserPreferencesContext()
  const savedPreferences =
    normalizeTempWindowFallbackPreferences(tempWindowFallback)
  const sizeDraft = useDeferredPreferenceDraft({
    savedValue: {
      width: String(savedPreferences.windowWidth),
      height: String(savedPreferences.windowHeight),
    },
    savedVersion: preferences?.lastUpdated ?? 0,
    onCommit: async (draft) => {
      const windowWidth = Number(draft.width)
      const windowHeight = Number(draft.height)
      if (
        !isValidTempWindowDimension(windowWidth) ||
        !isValidTempWindowDimension(windowHeight)
      ) {
        return { ok: false }
      }
      const result = await updateTempWindowFallback({
        windowWidth,
        windowHeight,
      })
      showUpdateToast(result, t("refresh.shieldWindowSizeTitle"))
      return { ok: result.ok }
    },
  })

  return (
    <CardItem
      id={SHIELD_SETTINGS_TARGET_IDS.windowSize}
      title={t("refresh.shieldWindowSizeTitle")}
      description={t("refresh.shieldWindowSizeDesc")}
      rightContent={
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void sizeDraft.commit()
          }}
        >
          <fieldset
            disabled={sizeDraft.isCommitting}
            className="flex flex-wrap items-end justify-end gap-2"
          >
            {(
              [
                ["width", t("refresh.shieldWindowWidth")],
                ["height", t("refresh.shieldWindowHeight")],
              ] as const
            ).map(([dimension, label]) => (
              <label key={dimension} className="flex flex-col gap-1 text-sm">
                {label}
                <Input
                  type="number"
                  required
                  min={TEMP_WINDOW_SIZE_LIMITS.min}
                  max={TEMP_WINDOW_SIZE_LIMITS.max}
                  step={1}
                  className="w-24"
                  value={sizeDraft.draft[dimension]}
                  onChange={(event) =>
                    sizeDraft.setDraft({
                      ...sizeDraft.draft,
                      [dimension]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                sizeDraft.setDraft({
                  width: String(DEFAULT_TEMP_WINDOW_SIZE.windowWidth),
                  height: String(DEFAULT_TEMP_WINDOW_SIZE.windowHeight),
                })
              }
            >
              {t("refresh.shieldWindowSizeReset")}
            </Button>
            <Button type="submit" size="sm" disabled={!sizeDraft.isDirty}>
              {t("common:actions.save")}
            </Button>
          </fieldset>
        </form>
      }
    />
  )
}
