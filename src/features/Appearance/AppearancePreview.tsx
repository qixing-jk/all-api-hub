import { useTranslation } from "react-i18next"

import { Badge, Button, Input } from "~/components/ui"
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
          className={`${dark ? THEME_MODE.DARK : ""} bg-background gap-y-density-1 py-density-2 flex h-16 w-1/2 gap-x-1 px-2`}
        >
          <span className="bg-sidebar w-3 rounded-xs" />
          <span className="gap-y-density-1 flex min-w-0 flex-1 flex-col gap-x-1">
            <span className="bg-foreground/60 h-1 w-2/3 rounded-full" />
            <span className="bg-card border-border py-density-1 flex flex-1 items-end rounded-xs border px-1">
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
    <section
      className="bg-muted/40 space-y-density-3 py-density-4 min-w-0 rounded-lg border px-4"
      aria-label={t("appearance.preview")}
    >
      <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-2">
        <p className="text-sm font-medium">{t("appearance.preview")}</p>
        <Badge>{presetLabel}</Badge>
      </div>
      <div className="bg-card space-y-density-3 py-density-3 rounded-md border px-3">
        <div className="gap-density-2 flex flex-wrap items-baseline justify-between">
          <p className="min-w-0 text-base font-medium break-words">
            {t("appearance.previewAccount")}
          </p>
          <p className="text-lg font-semibold tabular-nums">$128.50</p>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("appearance.previewDetails")}
        </p>
        <Input
          aria-label={t("appearance.previewInput")}
          value={t("appearance.previewNote")}
          readOnly
          tabIndex={-1}
        />
        <div className="gap-density-2 flex flex-wrap items-center">
          <Button asChild>
            <span>{t("appearance.primaryAction")}</span>
          </Button>
          <Button asChild variant="outline">
            <span>{t("appearance.secondaryAction")}</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
