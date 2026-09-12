import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui"

import { openGatewayGuidanceOverview } from "./navigation"

/** Takes users to the shared actionable guide without starting setup. */
export function GatewayGuidanceLink() {
  const { t } = useTranslation("optionsOverview")
  return (
    <Button variant="outline" size="sm" onClick={openGatewayGuidanceOverview}>
      {t("unifiedApiGuidance.overview.reopen")}
      <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
    </Button>
  )
}
