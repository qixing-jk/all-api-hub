import { KeyRound, Plus, RefreshCw, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"

interface HeaderProps {
  selectedAccount: string
  onAddToken: () => void
  onRepairMissingKeys: () => void
  onRefresh: () => void
  onRefreshManagedSiteStatus?: () => void
  isLoading: boolean
  isManagedSiteStatusRefreshing?: boolean
  isAddTokenDisabled: boolean
  isRepairDisabled: boolean
  isManagedSiteStatusRefreshDisabled?: boolean
}

/**
 * Page header summarizing the key management section with actions.
 */
export function Header({
  onAddToken,
  onRepairMissingKeys,
  onRefresh,
  onRefreshManagedSiteStatus,
  isLoading,
  isManagedSiteStatusRefreshing = false,
  selectedAccount,
  isAddTokenDisabled,
  isRepairDisabled,
  isManagedSiteStatusRefreshDisabled = false,
}: HeaderProps) {
  const { t } = useTranslation("keyManagement")
  return (
    <div className="mb-8">
      <PageHeader
        icon={KeyRound}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button
              onClick={onAddToken}
              disabled={isAddTokenDisabled}
              size="sm"
              variant="success"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("dialog.addToken")}
            </Button>
            <Button
              onClick={onRepairMissingKeys}
              disabled={isRepairDisabled}
              size="sm"
              variant="outline"
              leftIcon={<Wrench className="h-4 w-4" />}
            >
              {t("repairMissingKeys.action")}
            </Button>
            {onRefreshManagedSiteStatus ? (
              <Button
                onClick={onRefreshManagedSiteStatus}
                disabled={isManagedSiteStatusRefreshDisabled}
                size="sm"
                variant="outline"
                loading={isManagedSiteStatusRefreshing}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                {isManagedSiteStatusRefreshing
                  ? t("managedSiteStatus.actions.refreshing")
                  : t("managedSiteStatus.actions.refresh")}
              </Button>
            ) : null}
            <Button onClick={onRefresh} disabled={isLoading} size="sm">
              {isLoading && selectedAccount
                ? t("common:status.refreshing")
                : t("refreshTokenList")}
            </Button>
          </>
        }
      />
    </div>
  )
}
