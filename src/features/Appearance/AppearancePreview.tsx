import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { THEME_COLOR, THEME_MODE } from "~/constants/theme"
import type { AppearancePreferences } from "~/types/theme"
import { getAppearanceScopeAttributes } from "~/utils/ui/themePreferences"

/** Show both preset palettes without changing the active appearance scope. */
export function ThemePresetPreview({
  preset,
}: Pick<AppearancePreferences, "preset">) {
  return (
    <span className="flex overflow-hidden rounded-sm" aria-hidden="true">
      {[false, true].map((dark) => (
        <span
          key={String(dark)}
          {...getAppearanceScopeAttributes({ preset, color: THEME_COLOR.BLUE })}
          className={`${dark ? THEME_MODE.DARK : ""} bg-background flex h-16 w-1/2 gap-1 p-2`}
        >
          <span className="bg-sidebar w-3 rounded-xs" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="bg-foreground/60 h-1 w-2/3 rounded-full" />
            <span className="bg-card border-border flex flex-1 items-end rounded-xs border p-1">
              <span className="bg-primary h-2 w-1/2 rounded-xs" />
            </span>
          </span>
        </span>
      ))}
    </span>
  )
}

/** Preview representative controls using the saved appearance. */
export function AppearancePreview({ presetLabel }: { presetLabel: string }) {
  const { t } = useTranslation("settings")

  return (
    <div
      className="bg-muted/40 space-y-3 rounded-lg border p-4"
      aria-label={t("appearance.preview")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("appearance.preview")}</p>
        <Badge>{presetLabel}</Badge>
      </div>
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm">
          {t("appearance.primaryAction")}
        </span>
        <span className="rounded-md border border-(--button-outline-border) bg-(--button-outline-bg) px-3 py-2 text-sm text-(--button-outline-foreground)">
          {t("appearance.secondaryAction")}
        </span>
        <span className="bg-primary ml-auto size-3 shrink-0 rounded-full" />
      </div>
    </div>
  )
}
