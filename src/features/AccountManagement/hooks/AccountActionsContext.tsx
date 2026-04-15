import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import toast from "react-hot-toast"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { DisplaySiteData } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { useAccountDataContext } from "./AccountDataContext"

/**
 * Unified logger scoped to account action handlers (refresh, check-in, external flows).
 */
const logger = createLogger("AccountActionsContext")

// 1. 定义 Context 的值类型
interface AccountActionsContextType {
  refreshingAccountId: string | null
  handleRefreshAccount: (
    account: DisplaySiteData,
    force?: boolean,
  ) => Promise<void>
  handleSetAccountDisabled: (
    account: DisplaySiteData,
    disabled: boolean,
  ) => Promise<void>
  handleSetAccountsDisabled: (
    accounts: DisplaySiteData[],
    disabled: boolean,
  ) => Promise<void>
  handleDeleteAccounts: (
    accounts: DisplaySiteData[],
  ) => Promise<{ deletedCount: number }>
  handleDeleteAccount: (account: DisplaySiteData) => void
  handleCopyUrl: (account: DisplaySiteData) => void
  handleMarkCustomCheckInAsCheckedIn: (
    account: DisplaySiteData,
  ) => Promise<void>
  handleOpenExternalCheckIns: (
    accounts: DisplaySiteData[],
    options?: { openAll?: boolean; openInNewWindow?: boolean },
  ) => Promise<void>
}

// 2. 创建 Context
const AccountActionsContext = createContext<
  AccountActionsContextType | undefined
>(undefined)

// 3. 创建 Provider 组件
export const AccountActionsProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const { loadAccountData } = useAccountDataContext()
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | null>(
    null,
  )

  const handleRefreshAccount = useCallback(
    async (account: DisplaySiteData, force: boolean = true) => {
      if (refreshingAccountId) return
      if (account.disabled === true) return

      setRefreshingAccountId(account.id)

      const refreshPromise = async () => {
        const result = await accountStorage.refreshAccount(account.id, force)
        if (result) {
          await loadAccountData()
          return result
        } else {
          throw new Error(
            t("messages:toast.error.refreshAccount", {
              accountName: account.name,
            }),
          )
        }
      }

      try {
        await toast.promise(
          refreshPromise().then((result) => {
            if (!result.refreshed) {
              return t("messages:toast.success.refreshSkipped")
            }
            return t("messages:toast.success.refreshAccount", {
              accountName: account.name,
            })
          }),
          {
            loading: t("messages:toast.loading.refreshingAccount", {
              accountName: account.name,
            }),
            success: (message) => message,
            error: t("messages:toast.error.refreshAccount", {
              accountName: account.name,
            }),
          },
        )
      } catch (error) {
        logger.error("Error refreshing account", error)
      } finally {
        setRefreshingAccountId(null)
      }
    },
    [refreshingAccountId, loadAccountData],
  )

  const handleSetAccountDisabled = useCallback(
    async (account: DisplaySiteData, disabled: boolean) => {
      const success = await accountStorage.setAccountDisabled(
        account.id,
        disabled,
      )
      if (!success) {
        toast.error(
          t("messages:toast.error.operationFailed", {
            error: t("messages:storage.updateFailed", { error: "" }),
          }),
        )
        return
      }

      await loadAccountData()

      toast.success(
        disabled
          ? t("messages:toast.success.accountDisabled", {
              accountName: account.name,
            })
          : t("messages:toast.success.accountEnabled", {
              accountName: account.name,
            }),
      )
    },
    [loadAccountData],
  )

  const handleSetAccountsDisabled = useCallback(
    async (accounts: DisplaySiteData[], disabled: boolean) => {
      const uniqueAccounts = Array.from(
        new Map(accounts.map((account) => [account.id, account])).values(),
      )

      const accountIds = uniqueAccounts
        .filter((account) => account.disabled !== disabled)
        .map((account) => account.id)

      if (accountIds.length === 0) {
        return
      }

      const { updatedCount } = await accountStorage.setAccountsDisabled(
        accountIds,
        disabled,
      )

      if (updatedCount === 0) {
        toast.error(t("messages:toast.error.operationFailedGeneric"))
        return
      }

      await loadAccountData()

      toast.success(
        disabled
          ? t("messages:toast.success.accountsDisabled", {
              count: updatedCount,
            })
          : t("messages:toast.success.accountsEnabled", {
              count: updatedCount,
            }),
      )
    },
    [loadAccountData],
  )

  const handleDeleteAccounts = useCallback(
    async (accounts: DisplaySiteData[]) => {
      const uniqueAccounts = Array.from(
        new Map(accounts.map((account) => [account.id, account])).values(),
      )
      const accountIds = uniqueAccounts
        .map((account) => account.id)
        .filter(Boolean)

      if (accountIds.length === 0) {
        return { deletedCount: 0 }
      }

      const result = await toast.promise(
        accountStorage.deleteAccounts(accountIds),
        {
          loading: t("account:bulk.deleting", { count: accountIds.length }),
          success: (deleteResult) =>
            t("account:bulk.deleteSuccess", {
              count: deleteResult.deletedCount,
            }),
          error: (error) =>
            t("ui:dialog.delete.deleteFailed", {
              error: getErrorMessage(error),
            }),
        },
      )

      await loadAccountData()
      return result
    },
    [loadAccountData],
  )

  const handleDeleteAccount = useCallback(() => {
    // The actual deletion logic is in DelAccountDialog,
    // this just reloads the data after deletion.
    loadAccountData()
  }, [loadAccountData])

  const handleCopyUrl = useCallback((account: DisplaySiteData) => {
    navigator.clipboard.writeText(account.baseUrl)
    toast.success(
      t("messages:toast.success.urlCopied", {
        accountName: account.name,
      }),
    )
  }, [])

  /**
   * 标记账户为已签到
   */
  const handleMarkCustomCheckInAsCheckedIn = useCallback(
    async (account: DisplaySiteData) => {
      if (account.disabled === true) return
      try {
        const success = await accountStorage.markAccountAsCustomCheckedIn(
          account.id,
        )
        if (success) {
          await loadAccountData()
        }
      } catch (error) {
        logger.error("Error marking account as checked in", error)
      }
    },
    [loadAccountData],
  )

  /**
   * Bulk open external check-in sites and mark them as checked in.
   *
   * Note: This must run in the background because the popup UI can close early
   * (including programmatically after opening a tab), which would interrupt any
   * in-flight async work if executed directly in the popup context.
   */
  const handleOpenExternalCheckIns = useCallback(
    async (
      accounts: DisplaySiteData[],
      options?: { openAll?: boolean; openInNewWindow?: boolean },
    ) => {
      const enabledAccounts = accounts.filter((account) => !account.disabled)
      const accountsToOpen = options?.openAll
        ? enabledAccounts
        : enabledAccounts.filter(
            (account) => !account.checkIn?.customCheckIn?.isCheckedInToday,
          )

      if (!accountsToOpen.length) {
        toast.error(t("messages:toast.error.externalCheckInNonePending"))
        return
      }

      try {
        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.ExternalCheckInOpenAndMark,
          accountIds: accountsToOpen.map((account) => account.id),
          openInNewWindow: Boolean(options?.openInNewWindow),
        })

        if (!response?.data) {
          throw new Error(response?.error || "Empty response")
        }

        await loadAccountData()

        if (response.data.failedCount > 0) {
          toast.error(
            t("messages:errors.operation.failed", {
              error: `${response.data.failedCount}/${response.data.totalCount} failed`,
            }),
          )
          return
        }
      } catch (error) {
        logger.error("Error opening external check-ins", error)
        toast.error(
          t("messages:errors.operation.failed", {
            error: getErrorMessage(error),
          }),
        )
        return
      }

      toast.success(
        t("messages:toast.success.externalCheckInOpened", {
          count: accountsToOpen.length,
          mode: options?.openAll
            ? t("messages:toast.success.externalCheckInModeAll")
            : t("messages:toast.success.externalCheckInModeUnchecked"),
        }),
      )
    },
    [loadAccountData],
  )

  const value = useMemo(
    () => ({
      refreshingAccountId,
      handleRefreshAccount,
      handleSetAccountDisabled,
      handleSetAccountsDisabled,
      handleDeleteAccounts,
      handleDeleteAccount,
      handleCopyUrl,
      handleMarkCustomCheckInAsCheckedIn,
      handleOpenExternalCheckIns,
    }),
    [
      refreshingAccountId,
      handleRefreshAccount,
      handleSetAccountDisabled,
      handleSetAccountsDisabled,
      handleDeleteAccounts,
      handleDeleteAccount,
      handleCopyUrl,
      handleMarkCustomCheckInAsCheckedIn,
      handleOpenExternalCheckIns,
    ],
  )

  return (
    <AccountActionsContext.Provider value={value}>
      {children}
    </AccountActionsContext.Provider>
  )
}

// 4. 创建自定义 Hook
export const useAccountActionsContext = () => {
  const context = useContext(AccountActionsContext)
  if (
    context === undefined ||
    !context.handleRefreshAccount ||
    !context.handleSetAccountDisabled ||
    !context.handleSetAccountsDisabled ||
    !context.handleDeleteAccounts ||
    !context.handleDeleteAccount ||
    !context.handleCopyUrl ||
    !context.handleMarkCustomCheckInAsCheckedIn
  ) {
    throw new Error(
      "useAccountActionsContext 必须在 AccountActionsProvider 中使用，并且必须提供所有必需的函数",
    )
  }
  return context
}
