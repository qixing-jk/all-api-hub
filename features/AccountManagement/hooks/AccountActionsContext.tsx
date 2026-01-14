import i18next from "i18next"
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
import { accountStorage } from "~/services/accountStorage"
import type { DisplaySiteData } from "~/types"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { useAccountDataContext } from "./AccountDataContext"

// 1. 定义 Context 的值类型
interface AccountActionsContextType {
  refreshingAccountId: string | null
  handleRefreshAccount: (
    account: DisplaySiteData,
    force?: boolean,
  ) => Promise<void>
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

      setRefreshingAccountId(account.id)

      const refreshPromise = async () => {
        const result = await accountStorage.refreshAccount(account.id, force)
        if (result) {
          await loadAccountData()
          return result
        } else {
          throw new Error(
            i18next.t("messages:toast.error.refreshAccount", {
              accountName: account.name,
            }),
          )
        }
      }

      try {
        await toast.promise(
          refreshPromise().then((result) => {
            if (!result.refreshed) {
              return i18next.t("messages:toast.success.refreshSkipped")
            }
            return i18next.t("messages:toast.success.refreshAccount", {
              accountName: account.name,
            })
          }),
          {
            loading: i18next.t("messages:toast.loading.refreshingAccount", {
              accountName: account.name,
            }),
            success: (message) => message,
            error: i18next.t("messages:toast.error.refreshAccount", {
              accountName: account.name,
            }),
          },
        )
      } catch (error) {
        console.error("Error refreshing account:", error)
      } finally {
        setRefreshingAccountId(null)
      }
    },
    [refreshingAccountId, loadAccountData],
  )

  const handleDeleteAccount = useCallback(() => {
    // The actual deletion logic is in DelAccountDialog,
    // this just reloads the data after deletion.
    loadAccountData()
  }, [loadAccountData])

  const handleCopyUrl = useCallback((account: DisplaySiteData) => {
    navigator.clipboard.writeText(account.baseUrl)
    toast.success(
      i18next.t("messages:toast.success.urlCopied", {
        accountName: account.name,
      }),
    )
  }, [])

  /**
   * 标记账户为已签到
   */
  const handleMarkCustomCheckInAsCheckedIn = useCallback(
    async (account: DisplaySiteData) => {
      try {
        const success = await accountStorage.markAccountAsCustomCheckedIn(
          account.id,
        )
        if (success) {
          await loadAccountData()
        }
      } catch (error) {
        console.error("Error marking account as checked in:", error)
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
      const accountsToOpen = options?.openAll
        ? accounts
        : accounts.filter(
            (account) => !account.checkIn?.customCheckIn?.isCheckedInToday,
          )

      if (!accountsToOpen.length) {
        toast.error(
          i18next.t("messages:toast.error.externalCheckInNonePending"),
        )
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
            i18next.t("messages:errors.operation.failed", {
              error: `${response.data.failedCount}/${response.data.totalCount} failed`,
            }),
          )
          return
        }
      } catch (error) {
        console.error("Error opening external check-ins:", error)
        toast.error(
          i18next.t("messages:errors.operation.failed", {
            error: getErrorMessage(error),
          }),
        )
        return
      }

      toast.success(
        i18next.t("messages:toast.success.externalCheckInOpened", {
          count: accountsToOpen.length,
          mode: options?.openAll
            ? i18next.t("messages:toast.success.externalCheckInModeAll")
            : i18next.t("messages:toast.success.externalCheckInModeUnchecked"),
        }),
      )
    },
    [loadAccountData],
  )

  const value = useMemo(
    () => ({
      refreshingAccountId,
      handleRefreshAccount,
      handleDeleteAccount,
      handleCopyUrl,
      handleMarkCustomCheckInAsCheckedIn,
      handleOpenExternalCheckIns,
    }),
    [
      refreshingAccountId,
      handleRefreshAccount,
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
