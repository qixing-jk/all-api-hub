import { RotateCcw } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  DEFAULT_THEME_MODE,
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_DENSITY,
  THEME_PRESET,
  THEME_RADIUS,
  THEME_TEXT_SIZE,
} from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  THEME_COLORS,
  THEME_DENSITIES,
  THEME_MODES,
  THEME_PRESETS,
  THEME_RADII,
  THEME_TEXT_SIZES,
  type AppearancePreferences,
} from "~/types/theme"

import { AppearancePreview, ThemePresetPreview } from "./AppearancePreview"
import { AppearanceResetButton } from "./AppearanceResetButton"
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
  const densityLabels = {
    [THEME_DENSITY.COMPACT]: t("appearance.densities.compact"),
    [THEME_DENSITY.DEFAULT]: t("appearance.densities.default"),
    [THEME_DENSITY.COMFORTABLE]: t("appearance.densities.comfortable"),
  } satisfies Record<AppearancePreferences["density"], string>
  const textSizeLabels = {
    [THEME_TEXT_SIZE.DEFAULT]: t("appearance.textSizes.default"),
    [THEME_TEXT_SIZE.LARGE]: t("appearance.textSizes.large"),
    [THEME_TEXT_SIZE.EXTRA_LARGE]: t("appearance.textSizes.extraLarge"),
  } satisfies Record<AppearancePreferences["textSize"], string>
  const radiusLabels = {
    [THEME_RADIUS.NONE]: t("appearance.radii.none"),
    [THEME_RADIUS.SMALL]: t("appearance.radii.small"),
    [THEME_RADIUS.DEFAULT]: t("appearance.radii.default"),
    [THEME_RADIUS.LARGE]: t("appearance.radii.large"),
  } satisfies Record<AppearancePreferences["radius"], string>
  return (
    <div className="space-y-density-6" aria-busy={saving}>
      {showMode && (
        <fieldset
          aria-labelledby={`${id}-mode-label`}
          className="space-y-density-3 min-w-0"
        >
          <legend className="w-full text-sm font-medium">
            <span className="flex items-center justify-between gap-2">
              <span id={`${id}-mode-label`}>{t("theme.mode")}</span>
              <AppearanceResetButton
                label={`${t("common:actions.reset")}: ${t("theme.mode")}`}
                disabled={saving}
                onClick={() => void save({ themeMode: DEFAULT_THEME_MODE })}
              />
            </span>
          </legend>
          <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
            {THEME_MODES.map((mode) => (
              <label key={mode} className="min-w-0 cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`${id}-mode`}
                  value={mode}
                  checked={themeMode === mode}
                  onChange={() => void save({ themeMode: mode })}
                />
                <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring py-density-3 block rounded-md border px-2 text-center text-sm peer-focus-visible:ring-2">
                  {themeOptions[mode].label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_PRESET : undefined}
        aria-labelledby={`${id}-preset-label`}
        className="space-y-density-3 min-w-0"
      >
        <legend className="w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span id={`${id}-preset-label`}>{t("appearance.preset")}</span>
            <AppearanceResetButton
              label={`${t("common:actions.reset")}: ${t("appearance.preset")}`}
              disabled={saving}
              onClick={() => void save({ preset: DEFAULT_APPEARANCE.preset })}
            />
          </span>
        </legend>
        <div className="gap-y-density-3 grid grid-cols-2 gap-x-3">
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
              <span className="border-border peer-checked:border-primary peer-checked:ring-primary peer-focus-visible:ring-ring gap-y-density-2 py-density-3 flex h-full flex-col gap-x-2 rounded-lg border px-3 peer-checked:ring-1 peer-focus-visible:ring-2">
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
        aria-labelledby={`${id}-color-label`}
        className="space-y-density-3 min-w-0"
      >
        <legend className="w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span id={`${id}-color-label`}>{t("appearance.color")}</span>
            <AppearanceResetButton
              label={`${t("common:actions.reset")}: ${t("appearance.color")}`}
              disabled={saving}
              onClick={() => void save({ color: DEFAULT_APPEARANCE.color })}
            />
          </span>
        </legend>
        {appearance.preset !== THEME_PRESET.DEFAULT ? (
          <p className="text-muted-foreground text-sm">
            {t("appearance.presetColorsHint")}
          </p>
        ) : (
          <div className="gap-y-density-3 grid grid-cols-3 gap-x-3">
            {THEME_COLORS.map((color) => (
              <label key={color} className="min-w-0 cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`${id}-color`}
                  value={color}
                  checked={appearance.color === color}
                  onChange={() => void save({ color })}
                />
                <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring gap-y-density-2 py-density-3 flex items-center gap-x-2 rounded-md border px-3 text-sm peer-focus-visible:ring-2">
                  <span
                    aria-hidden="true"
                    {...{ [THEME_ATTRIBUTES.COLOR]: color }}
                    className="bg-theme-600 size-4 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 wrap-anywhere">
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
        aria-labelledby={`${id}-radius-label`}
        className="space-y-density-3 min-w-0"
      >
        <legend className="w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span id={`${id}-radius-label`}>{t("appearance.radius")}</span>
            <AppearanceResetButton
              label={`${t("common:actions.reset")}: ${t("appearance.radius")}`}
              disabled={saving}
              onClick={() => void save({ radius: DEFAULT_APPEARANCE.radius })}
            />
          </span>
        </legend>
        <div className="gap-y-density-2 grid grid-cols-4 gap-x-2">
          {THEME_RADII.map((radius) => (
            <label key={radius} className="min-w-0 cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-radius`}
                value={radius}
                checked={appearance.radius === radius}
                onChange={() => void save({ radius })}
              />
              <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring gap-y-density-2 py-density-2 flex flex-col items-center gap-x-2 rounded-md border px-2 text-xs peer-focus-visible:ring-2">
                <span
                  aria-hidden="true"
                  className="border-primary/70 bg-primary/10 h-9 w-10 border-2"
                  style={{ borderRadius: RADIUS_PREVIEW_PX[radius] }}
                />
                <span className="w-full text-center wrap-anywhere">
                  {radiusLabels[radius]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_DENSITY : undefined}
        aria-labelledby={`${id}-density-label`}
        className="space-y-density-3 min-w-0"
      >
        <legend className="w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span id={`${id}-density-label`}>{t("appearance.density")}</span>
            <AppearanceResetButton
              label={t("appearance.resetDensity")}
              disabled={saving}
              onClick={() => void save({ density: DEFAULT_APPEARANCE.density })}
            />
          </span>
        </legend>
        <p className="text-muted-foreground text-sm">
          {t("appearance.densityDescription")}
        </p>
        <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
          {THEME_DENSITIES.map((density) => (
            <label key={density} className="min-w-0 cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-density`}
                value={density}
                checked={appearance.density === density}
                onChange={() => void save({ density })}
              />
              <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring py-density-2 flex h-full min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm wrap-anywhere peer-focus-visible:ring-2">
                {densityLabels[density]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE : undefined}
        aria-labelledby={`${id}-textSize-label`}
        className="space-y-density-3 min-w-0"
      >
        <legend className="w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span id={`${id}-textSize-label`}>{t("appearance.textSize")}</span>
            <AppearanceResetButton
              label={t("appearance.resetTextSize")}
              disabled={saving}
              onClick={() =>
                void save({ textSize: DEFAULT_APPEARANCE.textSize })
              }
            />
          </span>
        </legend>
        <p className="text-muted-foreground text-sm">
          {t("appearance.textSizeDescription")}
        </p>
        <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
          {THEME_TEXT_SIZES.map((textSize) => (
            <label key={textSize} className="min-w-0 cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-text-size`}
                value={textSize}
                checked={appearance.textSize === textSize}
                onChange={() => void save({ textSize })}
              />
              <span className="border-border peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-ring py-density-2 flex h-full min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm wrap-anywhere peer-focus-visible:ring-2">
                {textSizeLabels[textSize]}
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
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        leftIcon={<RotateCcw aria-hidden="true" />}
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
