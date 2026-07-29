import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { EmptyState } from "~/components/ui"
import { openSettingsTab } from "~/utils/navigation"

interface ManagedSiteConfigRequiredStateProps {
  description: string
  className?: string
  settingsTarget?: {
    tabId: "managedSite"
    anchor?: string
  }
  onRetry?: () => void
  isRetrying?: boolean
}

/**
 * Shared empty state shown when a managed-site page is available but the
 * currently selected managed-site backend has not been configured yet.
 */
export default function ManagedSiteConfigRequiredState({
  description,
  className,
  settingsTarget = { tabId: "managedSite" },
  onRetry,
  isRetrying = false,
}: ManagedSiteConfigRequiredStateProps) {
  const { t } = useTranslation("common")

  return (
    <EmptyState
      className={className}
      icon={<ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />}
      title={t("status.configurationRequired")}
      description={description}
      actions={[
        ...(onRetry
          ? [
              {
                label: t("actions.retry"),
                loadingLabel: t("status.retrying"),
                onClick: onRetry,
                loading: isRetrying,
                disabled: isRetrying,
              },
            ]
          : []),
        {
          label: t("actions.goToSettings"),
          variant: "outline" as const,
          rightIcon: <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />,
          onClick: () => {
            void openSettingsTab(settingsTarget.tabId, {
              ...(settingsTarget.anchor
                ? { anchor: settingsTarget.anchor }
                : {}),
              preserveHistory: true,
            })
          },
        },
      ]}
    />
  )
}
