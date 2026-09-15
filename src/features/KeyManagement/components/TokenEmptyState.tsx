import { Globe2, KeyRound, Plus, RefreshCw, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"
import type { DisplaySiteData } from "~/types"
import { createTab } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { openSiteSupportRequestPage } from "~/utils/navigation"
import { SITE_SUPPORT_ERROR_TYPES } from "~/utils/navigation/feedbackLinks"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"

const logger = createLogger("TokenList")

/**
 * Empty state content for no tokens or filtered results.
 * @param props Component props container.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.totalCount Known resources before filtering.
 * @param props.handleAddToken Callback to open the add-token flow.
 * @param props.canCreateTokens Whether the current account scope supports token creation.
 * @param props.displayData Account display data used to determine empty states.
 * @param props.currentAccountLoadError Error message shown when the selected account fails to load.
 * @param props.currentAccountUnsupportedKeyManagement Whether the selected account site type lacks a key-management route.
 * @param props.onRetryCurrentAccount Optional callback to retry loading the selected account.
 * @param props.onAddAccount Optional callback to open the add-account flow.
 * @param props.onRequestAccountSelection Optional callback to focus the account selector.
 */
export function TokenEmptyState({
  selectedAccount,
  totalCount,
  handleAddToken,
  canCreateTokens = true,
  displayData,
  currentAccountLoadError,
  currentAccountUnsupportedKeyManagement = false,
  onRetryCurrentAccount,
  onAddAccount,
  onRequestAccountSelection,
}: {
  selectedAccount: string
  totalCount: number
  handleAddToken: () => void
  canCreateTokens?: boolean
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  currentAccountUnsupportedKeyManagement?: boolean
  onRetryCurrentAccount?: () => void
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
}) {
  const { t } = useTranslation(["keyManagement", "account"])
  const currentAccount =
    selectedAccount && selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? displayData.find((account) => account.id === selectedAccount) ?? null
      : null

  const handleOpenCurrentAccountSite = () => {
    const baseUrl = currentAccount?.baseUrl?.trim()
    if (!baseUrl) return
    void createTab(baseUrl, true)
  }

  const handleRequestSiteSupport = () => {
    const baseUrl = currentAccount?.baseUrl?.trim()
    if (!currentAccount || !baseUrl) return

    void openSiteSupportRequestPage({
      siteUrl: baseUrl,
      errorType: SITE_SUPPORT_ERROR_TYPES.KeyManagementUnsupported,
      errorMessage: t(
        "keyManagement:unsupportedSource.supportRequestErrorMessage",
        {
          siteType: currentAccount.siteType,
        },
      ),
    }).catch((error) => {
      logger.error("Failed to open key-management site-support request", error)
    })
  }

  // 如果没有账户
  if (displayData.length === 0) {
    return (
      <EmptyState
        icon={<KeyRound className="h-12 w-12" />}
        title={t("account:emptyState")}
        description={t("keyManagement:pleaseAddAccount")}
        action={
          onAddAccount
            ? {
                label: t("account:addFirstAccount"),
                onClick: onAddAccount,
                variant: "default",
                icon: <Plus className="h-4 w-4" />,
              }
            : undefined
        }
      />
    )
  }

  if (!selectedAccount) {
    return (
      <EmptyState
        icon={<KeyRound className="h-12 w-12" />}
        title={t("keyManagement:pleaseSelectAccount")}
        description={t("keyManagement:selectAccountToContinue")}
        action={
          onRequestAccountSelection
            ? {
                label: t("keyManagement:selectAccount"),
                onClick: onRequestAccountSelection,
                variant: "default",
              }
            : undefined
        }
      />
    )
  }

  if (currentAccountLoadError) {
    return (
      <EmptyState
        variant="destructive"
        icon={<TriangleAlert className="h-12 w-12" />}
        title={t("loadError.title")}
        description={t("loadError.description", {
          error: currentAccountLoadError,
        })}
        descriptionClassName="max-w-xl whitespace-pre-line"
        className="mt-4"
        actions={[
          {
            label: t("refreshTokenList"),
            onClick: () => onRetryCurrentAccount?.(),
            variant: "default",
            icon: <RefreshCw className="h-4 w-4" />,
            disabled: !onRetryCurrentAccount,
          },
          {
            label: t("loadError.openSite"),
            onClick: handleOpenCurrentAccountSite,
            variant: "outline",
            icon: <Globe2 className="h-4 w-4" />,
            disabled: !currentAccount?.baseUrl?.trim(),
          },
        ]}
      />
    )
  }

  if (currentAccountUnsupportedKeyManagement && currentAccount) {
    return (
      <EmptyState
        icon={<KeyRound className="h-12 w-12" />}
        title={t("keyManagement:unsupportedSource.title")}
        description={t("keyManagement:unsupportedSource.description")}
        action={{
          label: t("keyManagement:unsupportedSource.requestSiteSupport"),
          onClick: handleRequestSiteSupport,
          disabled: !currentAccount.baseUrl?.trim(),
        }}
      />
    )
  }

  // 如果没有密钥
  if (totalCount === 0) {
    return (
      <EmptyState
        icon={<KeyRound className="h-12 w-12" />}
        title={t("noKeys")}
        action={{
          label: t("createFirstKey"),
          onClick: handleAddToken,
          variant: "default",
          icon: <Plus className="h-4 w-4" />,
          testId: KEY_MANAGEMENT_TEST_IDS.emptyStateAddTokenButton,
          disabled: !canCreateTokens,
        }}
      />
    )
  }

  // 搜索无结果
  return (
    <EmptyState
      icon={<KeyRound className="h-12 w-12" />}
      title={t("noMatchingKeys")}
    />
  )
}
