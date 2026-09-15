import { ArrowRight, ChevronDown, Workflow } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

/** Introduces optional gateway setup, or resumes a guide the user has collapsed. */
export function GatewayGuidanceDiscovery({
  started,
  completedSteps,
  totalSteps,
  onExpand,
}: {
  started: boolean
  completedSteps: number
  totalSteps: number
  onExpand: () => void
}) {
  const { t } = useTranslation("optionsOverview")
  return (
    <div className="border-border/80 bg-surface-subtle/60 dark:border-foreground/10 dark:bg-foreground/[0.025] gap-y-density-4 py-density-4 flex flex-wrap items-center justify-between gap-x-4 rounded-xl border px-4">
      <div className="gap-y-density-3 flex min-w-0 flex-1 basis-48 items-start gap-x-3">
        <Workflow
          className="text-theme-600 dark:text-theme-400 mt-0.5 h-5 w-5 shrink-0"
          aria-hidden
        />
        <div className="space-y-density-1 min-w-0">
          <h3 className="text-sm font-semibold">
            {t("unifiedApiGuidance.overview.title")}
          </h3>
          <p className="text-muted-foreground text-sm leading-6">
            {started
              ? t("unifiedApiGuidance.overview.progress", {
                  completed: completedSteps,
                  total: totalSteps,
                })
              : t("unifiedApiGuidance.overview.description")}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onExpand}
        aria-expanded={false}
      >
        {started
          ? t("unifiedApiGuidance.overview.resume")
          : t("unifiedApiGuidance.overview.start")}
        {started ? (
          <ChevronDown className="h-4 w-4" aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  )
}
