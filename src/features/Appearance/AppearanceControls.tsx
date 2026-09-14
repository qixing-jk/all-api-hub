import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  DEFAULT_THEME_MODE,
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  THEME_COLORS,
  THEME_MODES,
  THEME_PRESETS,
  THEME_RADII,
  type AppearancePreferences,
} from "~/types/theme"

import { AppearancePreview, ThemePresetPreview } from "./AppearancePreview"
import { getThemeModeOptions } from "./themeModeOptions"
import { useAppearanceSave } from "./useAppearanceSave"

const RADIUS_PREVIEW_PX = {
  [THEME_RADIUS.NONE]: 0,
  [THEME_RADIUS.SMALL]: 6,
  [THEME_RADIUS.DEFAULT]: 12,
  [THEME_RADIUS.LARGE]: 18,
} satisfies Record<AppearancePreferences["radius"], number>

/** Shared, automatically saved controls for the settings page and appearance drawer. */
export function AppearanceControls({
  anchors = false,
  showMode = false,
}: {
  anchors?: boolean
  showMode?: boolean
}) {
  const { t } = useTranslation("settings")
  const { preferences, themeMode } = useUserPreferencesContext()
  const appearance = normalizeAppearance(preferences?.appearance)
  const id = useId()
  const { save, saving, failed } = useAppearanceSave()
  const themeOptions = getThemeModeOptions(t)
  const presetLabels = {
    [THEME_PRESET.DEFAULT]: t("appearance.presets.default"),
    [THEME_PRESET.ANTHROPIC]: t("appearance.presets.anthropic"),
  } satisfies Record<AppearancePreferences["preset"], string>
  const presetDescriptions = {
    [THEME_PRESET.DEFAULT]: t("appearance.presetDescriptions.default"),
    [THEME_PRESET.ANTHROPIC]: t("appearance.presetDescriptions.anthropic"),
  } satisfies Record<AppearancePreferences["preset"], string>
  const colorLabels = {
    [THEME_COLOR.BLUE]: t("appearance.colors.blue"),
    [THEME_COLOR.VIOLET]: t("appearance.colors.violet"),
    [THEME_COLOR.ROSE]: t("appearance.colors.rose"),
    [THEME_COLOR.ORANGE]: t("appearance.colors.orange"),
    [THEME_COLOR.GREEN]: t("appearance.colors.green"),
    [THEME_COLOR.SLATE]: t("appearance.colors.slate"),
  } satisfies Record<AppearancePreferences["color"], string>
  const radiusLabels = {
    [THEME_RADIUS.NONE]: t("appearance.radii.none"),
    [THEME_RADIUS.SMALL]: t("appearance.radii.small"),
    [THEME_RADIUS.DEFAULT]: t("appearance.radii.default"),
    [THEME_RADIUS.LARGE]: t("appearance.radii.large"),
  } satisfies Record<AppearancePreferences["radius"], string>
  return (
    <div className="space-y-6" aria-busy={saving}>
      {showMode && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            {t("theme.appearance")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {THEME_MODES.map((mode) => (
              <label key={mode} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`${id}-mode`}
                  value={mode}
                  checked={themeMode === mode}
                  onChange={() => void save({ themeMode: mode })}
                />
                <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring block rounded-md border px-2 py-3 text-center text-sm peer-focus-visible:ring-2">
                  {themeOptions[mode].label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_PRESET : undefined}
        className="space-y-3"
      >
        <legend className="text-sm font-medium">
          {t("appearance.preset")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {THEME_PRESETS.map((preset) => (
            <label key={preset} className="min-w-0 cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-preset`}
                value={preset}
                checked={appearance.preset === preset}
                onChange={() => void save({ preset })}
                aria-label={presetLabels[preset]}
              />
              <span className="border-border peer-checked:border-primary peer-checked:ring-primary peer-focus-visible:ring-ring flex h-full flex-col gap-2 rounded-lg border p-3 peer-checked:ring-1 peer-focus-visible:ring-2">
                <ThemePresetPreview preset={preset} />
                <span className="text-sm font-medium">
                  {presetLabels[preset]}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {presetDescriptions[preset]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_COLOR : undefined}
        className="space-y-3"
      >
        <legend className="text-sm font-medium">{t("appearance.color")}</legend>
        {appearance.preset !== THEME_PRESET.DEFAULT ? (
          <p className="text-muted-foreground text-sm">
            {t("appearance.presetColorsHint")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {THEME_COLORS.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`${id}-color`}
                  value={color}
                  checked={appearance.color === color}
                  onChange={() => void save({ color })}
                />
                <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring flex items-center gap-2 rounded-md border p-3 text-sm peer-focus-visible:ring-2">
                  <span
                    aria-hidden="true"
                    {...{ [THEME_ATTRIBUTES.COLOR]: color }}
                    className="bg-theme-600 size-4 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 break-words">
                    {colorLabels[color]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_RADIUS : undefined}
        className="space-y-3"
      >
        <legend className="text-sm font-medium">
          {t("appearance.radius")}
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {THEME_RADII.map((radius) => (
            <label key={radius} className="cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-radius`}
                value={radius}
                checked={appearance.radius === radius}
                onChange={() => void save({ radius })}
              />
              <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring flex flex-col items-center gap-2 rounded-md border p-2 text-xs peer-focus-visible:ring-2">
                <span
                  aria-hidden="true"
                  className="border-primary/70 bg-primary/10 h-9 w-10 border-2"
                  style={{ borderRadius: RADIUS_PREVIEW_PX[radius] }}
                />
                <span className="w-full text-center break-words">
                  {radiusLabels[radius]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <AppearancePreview presetLabel={presetLabels[appearance.preset]} />
      {failed && (
        <p role="alert" className="text-destructive-text text-sm">
          {t("appearance.saveFailed")}
        </p>
      )}
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          void save({ ...DEFAULT_APPEARANCE, themeMode: DEFAULT_THEME_MODE })
        }
      >
        {t("appearance.reset")}
      </Button>
    </div>
  )
}
