import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

export interface ManagedSiteDeploymentLinkProps {
  /** Provider whose connection form or setup prompt is displayed. */
  siteType: ManagedSiteType
  /**
   * Whether to expose the settings search/deep-link target. Only the settings
   * page should own the anchor; other surfaces render the same link without it.
   */
  withSettingsAnchor?: boolean
}

/**
 * Official deployment help for the provider whose connection form is displayed.
 * Doubles as the recovery path for users who do not host that provider yet.
 */
export function ManagedSiteDeploymentLink({
  siteType,
  withSettingsAnchor = true,
}: ManagedSiteDeploymentLinkProps) {
  const { t } = useTranslation("settings")
  const policy = getAccountSiteDefinition(siteType)?.managedResource
  if (!policy) return null

  return (
    <Button
      asChild
      variant="link"
      size="sm"
      className="h-auto min-h-0 max-w-full p-0 text-left whitespace-normal has-[>svg]:px-0"
    >
      <a
        {...(withSettingsAnchor
          ? { id: SETTINGS_ANCHORS.MANAGED_SITE_DEPLOYMENT_DOCS }
          : {})}
        href={policy.getStartedUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("managedSite.deploymentDocsLink", { site: t(policy.labelKey) })}
        <WorkflowTransitionIcon
          className="ml-1 h-3.5 w-3.5 shrink-0"
          aria-hidden
        />
      </a>
    </Button>
  )
}
