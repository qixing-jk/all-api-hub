import { Menu, MenuButton, MenuItems } from "@headlessui/react"
import {
  ArrowPathIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CpuChipIcon,
  EllipsisHorizontalIcon,
  KeyIcon,
  LinkIcon,
  ListBulletIcon,
  NoSymbolIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { ChartPieIcon, PinIcon, PinOffIcon } from "lucide-react"
import React, { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { getApiService } from "~/services/apiService"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import {
  openKeysPage,
  openModelsPage,
  openRedeemPage,
  openUsagePage,
} from "~/utils/navigation"

import { AccountActionMenuItem } from "./AccountActionMenuItem"

export interface ActionButtonsProps {
  site: DisplaySiteData
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteAccount: (site: DisplaySiteData) => void
}

/**
 * Primary/secondary action controls for each account card.
 * Provides copy URL/key, edit, refresh, pin, delete, and page navigation shortcuts.
 */
export default function AccountActionButtons({
  site,
  onCopyKey,
  onDeleteAccount,
}: ActionButtonsProps) {
  const { t } = useTranslation("account")
  const {
    refreshingAccountId,
    handleRefreshAccount,
    handleSetAccountDisabled,
  } = useAccountActionsContext()
  const { isAccountPinned, togglePinAccount, isPinFeatureEnabled } =
    useAccountDataContext()
  const { openEditAccount } = useDialogStateContext()
  const [isCheckingTokens, setIsCheckingTokens] = useState(false)

  const isAccountDisabled = site.disabled === true

  const isPinned = isAccountPinned(site.id)
  const pinLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const PinToggleIcon = isPinned ? PinOffIcon : PinIcon

  const handleTogglePin = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const success = await togglePinAccount(site.id)
    if (success) {
      const message = isPinned
        ? t("messages:toast.success.accountUnpinned", {
            accountName: site.name,
          })
        : t("messages:toast.success.accountPinned", {
            accountName: site.name,
          })
      toast.success(message)
    }
  }

  // Smart copy key logic - check token count before deciding action
  const handleSmartCopyKey = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isCheckingTokens) return

    setIsCheckingTokens(true)

    try {
      // Fetch tokens to check count before deciding action
      const tokensResponse = await getApiService(
        site.siteType,
      ).fetchAccountTokens({
        baseUrl: site.baseUrl,
        accountId: site.id,
        auth: {
          authType: site.authType,
          userId: site.userId,
          accessToken: site.token,
          cookie: site.cookieAuthSessionCookie,
        },
      })

      if (Array.isArray(tokensResponse)) {
        if (tokensResponse.length === 1) {
          // Single token - copy directly
          const token = tokensResponse[0]
          await navigator.clipboard.writeText(token.key)
          toast.success(t("actions.keyCopied"))
        } else if (tokensResponse.length > 1) {
          // Multiple tokens - open dialog
          onCopyKey(site)
        } else {
          // No tokens found
          toast.error(t("actions.noKeyFound"))
        }
      } else {
        console.warn("Token response is not an array:", tokensResponse)
        toast.error(t("actions.fetchKeyInfoFailed"))
      }
    } catch (error) {
      console.error("Failed to fetch key list:", error)
      const errorMessage = getErrorMessage(error)
      toast.error(t("actions.fetchKeyListFailed", { errorMessage }))
      // Fallback to opening dialog
      onCopyKey(site)
    } finally {
      setIsCheckingTokens(false)
    }
  }

  const handleCopyUrlLocal = async () => {
    await navigator.clipboard.writeText(site.baseUrl)
    toast.success(t("actions.urlCopied"))
  }

  // Navigation functions for secondary menu items
  const handleNavigateToKeyManagement = () => {
    openKeysPage(site.id)
  }

  const handleNavigateToModelManagement = () => {
    openModelsPage(site.id)
  }

  const handleNavigateToUsageManagement = () => {
    openUsagePage(site)
  }

  const handleNavigateToRedeemPage = () => {
    openRedeemPage(site)
  }

  const handleOpenKeyList = () => {
    onCopyKey(site)
  }

  const handleRefreshLocal = () => {
    handleRefreshAccount(site)
  }

  const handleDeleteLocal = () => {
    onDeleteAccount(site)
  }

  const handleDisableToggle = () => {
    void handleSetAccountDisabled(site, !isAccountDisabled)
  }

  return (
    <div className="grid grid-cols-2 justify-end gap-2 sm:grid-cols-4">
      {/* Primary Level - Three standalone buttons */}
      <IconButton
        onClick={handleCopyUrlLocal}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isAccountDisabled}
        aria-label={t("actions.copyUrl")}
        title={t("actions.copyUrl")}
      >
        <LinkIcon className="h-4 w-4" />
      </IconButton>

      <IconButton
        onClick={handleSmartCopyKey}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isCheckingTokens || isAccountDisabled}
        aria-label={t("actions.copyKey")}
        title={t("actions.copyKey")}
      >
        <KeyIcon className="h-4 w-4" />
      </IconButton>

      <IconButton
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openEditAccount(site)
        }}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isAccountDisabled}
        aria-label={t("actions.edit")}
        title={t("actions.edit")}
      >
        <PencilIcon className="h-4 w-4" />
      </IconButton>

      {/* Secondary Level - Dropdown menu */}
      <Menu as="div" className="relative">
        <MenuButton
          as={IconButton}
          variant="ghost"
          size="sm"
          aria-label={t("common:actions.more")}
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </MenuButton>

        <MenuItems
          anchor="bottom end"
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary z-50 rounded-lg border border-gray-200 bg-white py-1 shadow-lg [--anchor-gap:4px] [--anchor-padding:8px] focus:outline-none"
        >
          {isAccountDisabled ? (
            <AccountActionMenuItem
              onClick={handleDisableToggle}
              icon={CheckCircleIcon}
              label={t("actions.enableAccount")}
              tone="success"
            />
          ) : (
            <>
              {/* Secondary Menu Items */}
              <AccountActionMenuItem
                onClick={handleOpenKeyList}
                icon={ListBulletIcon}
                label={t("actions.keyList")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToKeyManagement}
                icon={KeyIcon}
                label={t("actions.keyManagement")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToModelManagement}
                icon={CpuChipIcon}
                label={t("actions.modelManagement")}
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              <AccountActionMenuItem
                onClick={handleNavigateToUsageManagement}
                icon={ChartPieIcon}
                label={t("actions.usageLog")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToRedeemPage}
                icon={BanknotesIcon}
                label={t("actions.redeemPage")}
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              {/* Pin/Unpin */}
              {isPinFeatureEnabled && (
                <AccountActionMenuItem
                  onClick={handleTogglePin}
                  icon={PinToggleIcon}
                  label={pinLabel}
                />
              )}

              <AccountActionMenuItem
                onClick={handleRefreshLocal}
                icon={ArrowPathIcon}
                label={t("actions.refresh")}
                disabled={refreshingAccountId === site.id}
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              {/* Place Disable immediately above Delete for clarity and consistency. */}
              <AccountActionMenuItem
                onClick={handleDisableToggle}
                icon={NoSymbolIcon}
                label={t("actions.disableAccount")}
                tone="warning"
              />

              <AccountActionMenuItem
                onClick={handleDeleteLocal}
                icon={TrashIcon}
                label={t("actions.delete")}
                isDestructive={true}
              />
            </>
          )}
        </MenuItems>
      </Menu>
    </div>
  )
}
