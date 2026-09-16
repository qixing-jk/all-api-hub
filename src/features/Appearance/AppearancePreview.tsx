import { useTranslation } from "react-i18next"

import { Badge, Button, Input } from "~/components/ui"

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
