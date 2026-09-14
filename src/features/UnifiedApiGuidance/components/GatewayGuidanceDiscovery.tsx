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
    <div className="border-border/80 bg-surface-subtle/60 dark:border-foreground/10 dark:bg-foreground/[0.025] flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Workflow
          className="text-theme-600 dark:text-theme-400 mt-0.5 h-5 w-5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
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
