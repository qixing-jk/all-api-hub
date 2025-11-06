import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/features/ChannelManagement"
import {
  autoDetectAccount,
  getSiteName,
  isValidAccount,
  validateAndSaveAccount,
  validateAndUpdateAccount
} from "~/services/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import { AuthTypeEnum, type CheckInConfig, type DisplaySiteData } from "~/types"
import { AutoDetectError } from "~/utils/autoDetectUtils"

interface UseAccountDialogProps {
  mode: "add" | "edit"
  account?: DisplaySiteData | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (data: any) => void
}

export function useAccountDialog({
  mode,
  account,
  isOpen,
  onClose,
  onSuccess
}: UseAccountDialogProps) {
  const { t } = useTranslation("accountDialog")

  const [url, setUrl] = useState("")
  const [isDetecting, setIsDetecting] = useState(false)
  const [siteName, setSiteName] = useState("")
  const [username, setUsername] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [userId, setUserId] = useState("")
  const [isDetected, setIsDetected] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(
    null
  )
  const [showManualForm, setShowManualForm] = useState(mode === "edit")
  const [exchangeRate, setExchangeRate] = useState("")
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [checkIn, setCheckIn] = useState<CheckInConfig>({
    enableDetection: false,
    isCheckedInToday: false,
    customCheckInUrl: "",
    customRedeemUrl: "",
    openRedeemWithCheckIn: true
  })
  const [siteType, setSiteType] = useState("unknown")
  const [authType, setAuthType] = useState(AuthTypeEnum.AccessToken)
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false)

  // useRef 保存跨渲染引用
  const newAccountRef = useRef<any>(null)
  const targetAccountRef = useRef<any>(null)

  const { openWithAccount: openChannelDialog } = useChannelDialog()

  const resetForm = useCallback(() => {
    setUrl("")
    setIsDetected(false)
    setSiteName("")
    setUsername("")
    setAccessToken("")
    setUserId("")
    setShowAccessToken(false)
    setDetectionError(null)
    setShowManualForm(mode === "edit")
    setExchangeRate("")
    setCurrentTabUrl(null)
    setNotes("")
    setCheckIn({
      enableDetection: false,
      autoCheckInEnabled: true,
      isCheckedInToday: false,
      customCheckInUrl: "",
      customRedeemUrl: "",
      openRedeemWithCheckIn: true
    })
    setSiteType("unknown")
    setAuthType(AuthTypeEnum.AccessToken)
    setIsAutoConfiguring(false)
    targetAccountRef.current = null
  }, [mode])

  const loadAccountData = useCallback(
    async (accountId: string) => {
      try {
        const siteAccount = await accountStorage.getAccountById(accountId)
        if (siteAccount) {
          setUrl(siteAccount.site_url)
          setSiteName(siteAccount.site_name)
          setUsername(siteAccount.account_info.username)
          setAccessToken(siteAccount.account_info.access_token)
          setUserId(siteAccount.account_info.id.toString())
          setExchangeRate(siteAccount.exchange_rate.toString())
          setNotes(siteAccount.notes || "")
          setCheckIn({
            enableDetection: siteAccount.checkIn?.enableDetection ?? false,
            autoCheckInEnabled: siteAccount.checkIn?.autoCheckInEnabled ?? true,
            isCheckedInToday: siteAccount.checkIn?.isCheckedInToday ?? false,
            customCheckInUrl: siteAccount.checkIn?.customCheckInUrl ?? "",
            customRedeemUrl: siteAccount.checkIn?.customRedeemUrl ?? "",
            openRedeemWithCheckIn:
              siteAccount.checkIn?.openRedeemWithCheckIn ?? true
          })
          setSiteType(siteAccount.site_type || "")
          setAuthType(siteAccount.authType || AuthTypeEnum.AccessToken)
        }
      } catch (error) {
        console.error(t("messages.loadFailed"), error)
        toast.error(t("messages.loadFailed"))
      }
    },
    [t]
  )

  useEffect(() => {
    if (isOpen) {
      resetForm()
      if (mode === "edit" && account) {
        loadAccountData(account.id)
      } else {
        // Get current tab URL for add mode
        ;(async () => {
          try {
            const tabs = await browser.tabs.query({
              active: true,
              currentWindow: true
            })
            const tab = tabs[0]
            if (tab.url) {
              try {
                const urlObj = new URL(tab.url)
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`
                if (!baseUrl.startsWith("http")) {
                  return
                }
                setCurrentTabUrl(baseUrl)
                setSiteName(await getSiteName(tab))
              } catch (error) {
                console.log(
                  t("messages.urlParseError", {
                    error: (error as Error).message
                  })
                )
                setCurrentTabUrl(null)
                setSiteName("")
              }
            }
          } catch (error) {
            console.error(error)
            // Fallback for Firefox Android
            try {
              const tabs = await browser.tabs.query({ active: true })
              const tab = tabs[0]
              if (tab.url) {
                const urlObj = new URL(tab.url)
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`
                if (baseUrl.startsWith("http")) {
                  setCurrentTabUrl(baseUrl)
                  setSiteName(await getSiteName(tab))
                }
              }
            } catch (fallbackError) {
              console.log("Failed to get current tab:", fallbackError)
            }
          }
        })()
      }
    }
  }, [isOpen, mode, account, resetForm, loadAccountData, t])

  const handleUseCurrentTabUrl = () => {
    if (currentTabUrl) {
      setUrl(currentTabUrl)
    }
  }

  const handleAutoDetect = async () => {
    if (!url.trim()) {
      return
    }

    setIsDetecting(true)
    setDetectionError(null)

    try {
      const result = await autoDetectAccount(url.trim(), authType)

      if (!result.success) {
        setDetectionError(result.detailedError || null)
        setShowManualForm(true)
        return
      }

      const resultData = result.data
      if (resultData) {
        setUsername(resultData.username)
        setAccessToken(resultData.accessToken)
        setUserId(resultData.userId)
        setCheckIn({
          enableDetection: resultData.checkIn?.enableDetection ?? false,
          autoCheckInEnabled: resultData.checkIn?.autoCheckInEnabled ?? true,
          isCheckedInToday: resultData.checkIn?.isCheckedInToday ?? false,
          customCheckInUrl: resultData.checkIn?.customCheckInUrl ?? "",
          customRedeemUrl: resultData.checkIn?.customRedeemUrl ?? "",
          openRedeemWithCheckIn:
            resultData.checkIn?.openRedeemWithCheckIn ?? true
        })

        if (resultData.exchangeRate) {
          setExchangeRate(resultData.exchangeRate.toString())
        } else if (mode === "add") {
          setExchangeRate("")
        }

        if (resultData.siteType) {
          setSiteType(resultData.siteType)
        }

        setIsDetected(true)
        setSiteName(resultData.siteName)
        if (mode === "edit") {
          toast.success(t("messages.autoDetectSuccess"))
        }
      }
    } catch (error) {
      console.error(t("messages.autoDetectFailed"), error)
      const errorMessage = getErrorMessage(error)
      setDetectionError({
        type: "unknown" as any,
        message: t("messages.autoDetectFailed", {
          error: errorMessage
        }),
        helpDocUrl: "#"
      })
      setShowManualForm(true)
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSaveAccount = async () => {
    setIsSaving(true)
    try {
      const result =
        mode === "add"
          ? await validateAndSaveAccount(
              url.trim(),
              siteName.trim(),
              username.trim(),
              accessToken.trim(),
              userId.trim(),
              exchangeRate,
              notes.trim(),
              checkIn,
              siteType,
              authType
            )
          : await validateAndUpdateAccount(
              account!.id,
              url.trim(),
              siteName.trim(),
              username.trim(),
              accessToken.trim(),
              userId.trim(),
              exchangeRate,
              notes.trim(),
              checkIn,
              siteType,
              authType
            )

      if (result.success) {
        toast.success(
          t(mode === "add" ? "messages.addSuccess" : "messages.updateSuccess", {
            name: siteName
          })
        )
        return result
      } else {
        toast.error(
          t("messages.operationFailed", {
            error: result.message || t("messages.saveFailed")
          })
        )
        throw new Error(result.message || t("messages.saveFailed"))
      }
    } catch (error: any) {
      toast.error(t("messages.operationFailed", { error: error.message }))
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  const handleAutoConfig = async () => {
    setIsAutoConfiguring(true)
    try {
      let targetAccount: DisplaySiteData | null | string | undefined =
        account || newAccountRef.current
      // 如果是新增（account 不存在），就先保存
      if (!targetAccount) {
        targetAccount = (await handleSaveAccount()).accountId
        if (!targetAccount) {
          toast.error(t("messages.saveAccountFailed"))
          return
        }
        // 缓存到 ref，避免重复保存
        newAccountRef.current = targetAccount
      }

      // 缓存目标账户
      targetAccountRef.current = targetAccount
      let displaySiteData

      if (typeof targetAccount === "string") {
        // 获取账户详细信息
        const siteAccount = await accountStorage.getAccountById(targetAccount)
        if (!siteAccount) {
          toast.error(t("messages:toast.error.findAccountDetailsFailed"))
          return
        }
        displaySiteData = accountStorage.convertToDisplayData(siteAccount)
      } else {
        displaySiteData = targetAccount
      }

      // 使用 useChannelDialog hook 打开对话框
      await openChannelDialog(displaySiteData, null, () => {
        if (onSuccess && targetAccountRef.current) {
          onSuccess(targetAccountRef.current)
        }
      })
    } catch (error) {
      toast.error(
        t("messages.newApiConfigFailed", {
          error: getErrorMessage(error)
        })
      )
      console.error(error)
    } finally {
      setIsAutoConfiguring(false)
    }
  }

  const handleUrlChange = (newUrl: string) => {
    if (newUrl.trim()) {
      try {
        const urlObj = new URL(newUrl)
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`
        setUrl(baseUrl)
      } catch (error) {
        console.error(error)
        setUrl(newUrl)
      }
    } else {
      setUrl("")
      if (mode === "add") {
        setSiteName("")
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSaveAccount()
  }

  const handleClose = () => {
    targetAccountRef.current = null
    onClose()
  }

  const isFormValid = isValidAccount({
    siteName,
    username,
    userId,
    authType,
    accessToken,
    exchangeRate
  })

  return {
    state: {
      url,
      isDetecting,
      siteName,
      username,
      accessToken,
      userId,
      isDetected,
      isSaving,
      showAccessToken,
      detectionError,
      showManualForm,
      exchangeRate,
      currentTabUrl,
      notes,
      checkIn,
      siteType,
      authType,
      isFormValid,
      isAutoConfiguring
    },
    setters: {
      setUrl,
      setSiteName,
      setUsername,
      setAccessToken,
      setUserId,
      setShowAccessToken,
      setShowManualForm,
      setExchangeRate,
      setNotes,
      setCheckIn,
      setSiteType,
      setAuthType
    },
    handlers: {
      handleUseCurrentTabUrl,
      handleAutoDetect,
      handleSaveAccount,
      handleUrlChange,
      handleSubmit,
      handleAutoConfig,
      handleClose
    }
  }
}

// Helper function to get error message
function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return String(error)
}
