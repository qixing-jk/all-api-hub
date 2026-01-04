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

import { accountStorage } from "~/services/accountStorage"
import type { DisplaySiteData } from "~/types"

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

  const value = useMemo(
    () => ({
      refreshingAccountId,
      handleRefreshAccount,
      handleDeleteAccount,
      handleCopyUrl,
      handleMarkCustomCheckInAsCheckedIn,
    }),
    [
      refreshingAccountId,
      handleRefreshAccount,
      handleDeleteAccount,
      handleCopyUrl,
      handleMarkCustomCheckInAsCheckedIn,
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
