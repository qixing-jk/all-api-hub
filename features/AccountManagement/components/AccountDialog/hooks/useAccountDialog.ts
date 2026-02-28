import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/ChannelDialog"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SUB2API } from "~/constants/siteType"
import {
  autoDetectAccount,
  getSiteName,
  isValidAccount,
  parseManualQuotaFromUsd,
  validateAndSaveAccount,
  validateAndUpdateAccount,
} from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import {
  AuthTypeEnum,
  type CheckInConfig,
  type DisplaySiteData,
  type Sub2ApiAuthConfig,
} from "~/types"
import {
  analyzeAutoDetectError,
  AutoDetectError,
} from "~/utils/autoDetectUtils"
import {
  getActiveTabs,
  getAllTabs,
  onTabActivated,
  onTabUpdated,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"

const AUTO_DETECT_SLOW_HINT_DELAY_MS = 10_000

/**
 * Logger scoped to the account dialog lifecycle. Ensure we never include raw tokens/cookies in log details.
 */
const logger = createLogger("AccountDialogHook")

interface UseAccountDialogProps {
  mode: DialogMode
  account?: DisplaySiteData | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (data: any) => void
}

/**
 * Hook encapsulating the full lifecycle of the account dialog including detection, validation, and persistence logic.
 * @param props Hook configuration supporting add/edit modes and callbacks.
 * @param props.mode Current dialog mode (add or edit).
 * @param props.account Account record to edit when in edit mode.
 * @param props.isOpen Whether the dialog is currently open.
 * @param props.onClose Handler invoked when dialog closes.
 * @param props.onSuccess Optional handler invoked after successful save.
 * @returns Aggregated state, setters, and handlers powering the dialog UI.
 */
export function useAccountDialog({
  mode,
  account,
  isOpen,
  onClose,
  onSuccess,
}: UseAccountDialogProps) {
  const { t } = useTranslation("accountDialog")

  const [url, setUrl] = useState("")
  const [isDetecting, setIsDetecting] = useState(false)
  const [isDetectingSlow, setIsDetectingSlow] = useState(false)
  const [siteName, setSiteName] = useState("")
  const [username, setUsername] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [userId, setUserId] = useState("")
  const [isDetected, setIsDetected] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(
    null,
  )
  const [showManualForm, setShowManualForm] = useState(
    mode === DIALOG_MODES.EDIT,
  )
  const [exchangeRate, setExchangeRate] = useState("")
  const [manualBalanceUsd, setManualBalanceUsd] = useState("")
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])
  const [excludeFromTotalBalance, setExcludeFromTotalBalance] = useState(false)
  const [checkIn, setCheckIn] = useState<CheckInConfig>({
    enableDetection: false,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  })
  const [siteType, setSiteType] = useState("unknown")
  const [authType, setAuthType] = useState(AuthTypeEnum.AccessToken)
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false)
  const [cookieAuthSessionCookie, setCookieAuthSessionCookie] = useState("")
  const [isImportingCookies, setIsImportingCookies] = useState(false)
  const [isImportingSub2apiSession, setIsImportingSub2apiSession] =
    useState(false)
  const [sub2apiUseRefreshToken, setSub2apiUseRefreshToken] = useState(false)
  const [sub2apiRefreshToken, setSub2apiRefreshToken] = useState("")
  const [sub2apiTokenExpiresAt, setSub2apiTokenExpiresAt] = useState<
    number | null
  >(null)

  // Enforce Sub2API constraints: JWT-only (access token), no built-in check-in.
  useEffect(() => {
    if (siteType !== SUB2API) return

    if (authType !== AuthTypeEnum.AccessToken) {
      setAuthType(AuthTypeEnum.AccessToken)
    }

    if (cookieAuthSessionCookie.trim()) {
      setCookieAuthSessionCookie("")
    }

    setCheckIn((prev) => ({
      ...prev,
      enableDetection: false,
      autoCheckInEnabled: false,
    }))
  }, [authType, cookieAuthSessionCookie, siteType])

  useEffect(() => {
    if (siteType === SUB2API) return

    if (sub2apiUseRefreshToken) {
      setSub2apiUseRefreshToken(false)
    }

    if (sub2apiRefreshToken) {
      setSub2apiRefreshToken("")
    }

    if (sub2apiTokenExpiresAt !== null) {
      setSub2apiTokenExpiresAt(null)
    }
  }, [
    siteType,
    sub2apiRefreshToken,
    sub2apiTokenExpiresAt,
    sub2apiUseRefreshToken,
  ])

  // useRef 保存跨渲染引用
  const newAccountRef = useRef<any>(null)
  const targetAccountRef = useRef<any>(null)
  const detectSlowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

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
    setShowManualForm(mode === DIALOG_MODES.EDIT)
    setExchangeRate("")
    setManualBalanceUsd("")
    setCurrentTabUrl(null)
    setNotes("")
    setTagIds([])
    setExcludeFromTotalBalance(false)
    setCheckIn({
      enableDetection: false,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
        isCheckedInToday: false,
      },
    })
    setSiteType("unknown")
    setAuthType(AuthTypeEnum.AccessToken)
    setIsAutoConfiguring(false)
    setCookieAuthSessionCookie("")
    setIsImportingCookies(false)
    setSub2apiUseRefreshToken(false)
    setSub2apiRefreshToken("")
    setSub2apiTokenExpiresAt(null)
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
          setManualBalanceUsd(siteAccount.manualBalanceUsd ?? "")
          setNotes(siteAccount.notes || "")
          setTagIds(siteAccount.tagIds || [])
          setExcludeFromTotalBalance(
            siteAccount.excludeFromTotalBalance === true,
          )
          setCheckIn({
            enableDetection: siteAccount.checkIn?.enableDetection ?? false,
            autoCheckInEnabled: siteAccount.checkIn?.autoCheckInEnabled ?? true,
            siteStatus: {
              isCheckedInToday:
                siteAccount.checkIn?.siteStatus?.isCheckedInToday ?? false,
              lastCheckInDate: siteAccount.checkIn?.siteStatus?.lastCheckInDate,
            },
            customCheckIn: {
              url: siteAccount.checkIn?.customCheckIn?.url ?? "",
              redeemUrl: siteAccount.checkIn?.customCheckIn?.redeemUrl ?? "",
              openRedeemWithCheckIn:
                siteAccount.checkIn?.customCheckIn?.openRedeemWithCheckIn ??
                true,
              isCheckedInToday:
                siteAccount.checkIn?.customCheckIn?.isCheckedInToday ?? false,
              lastCheckInDate:
                siteAccount.checkIn?.customCheckIn?.lastCheckInDate,
            },
          })
          setSiteType(siteAccount.site_type || "")
          setAuthType(siteAccount.authType || AuthTypeEnum.AccessToken)
          setCookieAuthSessionCookie(
            siteAccount.cookieAuth?.sessionCookie || "",
          )
          const refreshToken = siteAccount.sub2apiAuth?.refreshToken ?? ""
          setSub2apiRefreshToken(refreshToken)
          setSub2apiTokenExpiresAt(
            siteAccount.sub2apiAuth?.tokenExpiresAt ?? null,
          )
          setSub2apiUseRefreshToken(Boolean(refreshToken.trim()))
        }
      } catch (error) {
        logger.error("Failed to load account data", { error, accountId })
        toast.error(t("messages.loadFailed"))
      }
    },
    [t],
  )

  const checkCurrentTab = useCallback(async () => {
    if (mode === DIALOG_MODES.EDIT && account) {
      return
    }
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
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
          logger.warn("Failed to parse current tab URL", {
            error,
            tabUrl: tab.url,
          })
          setCurrentTabUrl(null)
          setSiteName("")
        }
      }
    } catch (error) {
      logger.warn("Failed to query current tab, falling back", { error })
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
        logger.warn("Failed to query current tab in fallback mode", {
          error: fallbackError,
        })
      }
    }
  }, [account, mode])

  useEffect(() => {
    if (isOpen) {
      resetForm()
      if (mode === DIALOG_MODES.EDIT && account) {
        loadAccountData(account.id)
      } else {
        // Get current tab URL for add mode
        checkCurrentTab()
      }
    }
  }, [isOpen, mode, account, resetForm, loadAccountData, checkCurrentTab])

  useEffect(() => {
    // 打开 popup 时立即检测一次
    checkCurrentTab()

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      checkCurrentTab()
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        checkCurrentTab()
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab])

  useEffect(() => {
    if (!isDetecting) {
      setIsDetectingSlow(false)
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
      return
    }

    setIsDetectingSlow(false)
    detectSlowHintTimeoutRef.current = setTimeout(() => {
      setIsDetectingSlow(true)
    }, AUTO_DETECT_SLOW_HINT_DELAY_MS)

    return () => {
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
    }
  }, [isDetecting])

  const handleUseCurrentTabUrl = () => {
    if (currentTabUrl) {
      setUrl(currentTabUrl)
    }
  }

  const handleImportCookieAuthSessionCookie = async () => {
    if (!url.trim()) {
      toast.error(t("messages.urlRequired"))
      return
    }
    setIsImportingCookies(true)
    try {
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: url.trim(),
      })
      if (response?.success && response.data) {
        setCookieAuthSessionCookie(response.data)
        toast.success(t("messages.importCookiesSuccess"))
      } else if (response?.error) {
        toast.error(response.error)
      } else {
        toast.error(t("messages.importCookiesEmpty"))
      }
    } catch (error) {
      logger.warn("Failed to import cookies", { error, url: url.trim() })
      toast.error(t("messages.importCookiesPermissionDenied"))
    } finally {
      setIsImportingCookies(false)
    }
  }

  /**
   * Import Sub2API dashboard session credentials (including refresh_token) into the form.
   *
   * Strategy:
   * 1) Prefer any existing tab with the same origin (least intrusive; supports incognito tabs when allowed).
   * 2) Fall back to the background temp-window auto-detect flow.
   */
  const handleImportSub2apiSession = async () => {
    if (!url.trim()) {
      toast.error(t("messages.urlRequired"))
      return
    }

    setIsImportingSub2apiSession(true)
    try {
      const baseUrl = url.trim()
      const targetOrigin = (() => {
        try {
          return new URL(baseUrl).origin
        } catch {
          return null
        }
      })()

      let imported: any | null = null

      if (targetOrigin && browser?.tabs?.sendMessage) {
        const tabs = await getAllTabs().catch(() => [])
        const candidates = tabs
          .filter((tab) => {
            if (!tab?.id || !tab.url) return false
            try {
              return new URL(tab.url).origin === targetOrigin
            } catch {
              return false
            }
          })
          .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))

        for (const tab of candidates) {
          const tabId = tab.id
          if (typeof tabId !== "number") continue

          try {
            const response = await browser.tabs.sendMessage(tabId, {
              action: RuntimeActionIds.ContentGetUserFromLocalStorage,
              url: baseUrl,
            })
            if (response?.success && response.data) {
              imported = response.data
              break
            }
          } catch {
            // Ignore and continue to the next candidate.
          }
        }
      }

      if (!imported) {
        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.AutoDetectSite,
          url: baseUrl,
          requestId: `account-dialog-sub2api-import-${Date.now()}`,
        })
        if (response?.success && response.data) {
          imported = response.data
        }
      }

      const refreshToken =
        typeof imported?.sub2apiAuth?.refreshToken === "string"
          ? imported.sub2apiAuth.refreshToken.trim()
          : ""
      if (!refreshToken) {
        toast.error(t("messages.importSub2apiSessionMissing"))
        return
      }

      setSub2apiRefreshToken(refreshToken)
      const tokenExpiresAtRaw = imported?.sub2apiAuth?.tokenExpiresAt
      setSub2apiTokenExpiresAt(
        typeof tokenExpiresAtRaw === "number" &&
          Number.isFinite(tokenExpiresAtRaw)
          ? tokenExpiresAtRaw
          : null,
      )

      const importedAccessToken =
        typeof imported?.accessToken === "string"
          ? imported.accessToken.trim()
          : ""
      if (importedAccessToken) {
        setAccessToken(importedAccessToken)
      }

      const importedUserId =
        typeof imported?.userId === "number" && Number.isFinite(imported.userId)
          ? imported.userId
          : null
      if (typeof importedUserId === "number") {
        setUserId(String(importedUserId))
      }

      const importedUsername =
        typeof imported?.user?.username === "string"
          ? imported.user.username.trim()
          : ""
      setUsername(importedUsername)

      toast.success(t("messages.importSub2apiSessionSuccess"))
    } catch (error) {
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setIsImportingSub2apiSession(false)
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

        if (resultData.siteType === SUB2API && resultData.sub2apiAuth) {
          setSub2apiRefreshToken(resultData.sub2apiAuth.refreshToken)
          setSub2apiTokenExpiresAt(
            resultData.sub2apiAuth.tokenExpiresAt ?? null,
          )
        }
        setCheckIn({
          enableDetection: resultData.checkIn?.enableDetection ?? false,
          autoCheckInEnabled: resultData.checkIn?.autoCheckInEnabled ?? true,
          siteStatus: {
            isCheckedInToday:
              resultData.checkIn?.siteStatus?.isCheckedInToday ?? false,
            lastCheckInDate: resultData.checkIn?.siteStatus?.lastCheckInDate,
          },
          customCheckIn: {
            url: resultData.checkIn?.customCheckIn?.url ?? "",
            redeemUrl: resultData.checkIn?.customCheckIn?.redeemUrl ?? "",
            openRedeemWithCheckIn:
              resultData.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true,
            isCheckedInToday:
              resultData.checkIn?.customCheckIn?.isCheckedInToday ?? false,
            lastCheckInDate: resultData.checkIn?.customCheckIn?.lastCheckInDate,
          },
        })

        if (resultData.exchangeRate) {
          setExchangeRate(resultData.exchangeRate.toString())
        } else if (mode === DIALOG_MODES.ADD) {
          setExchangeRate("")
        }

        if (resultData.siteType) {
          setSiteType(resultData.siteType)
          if (resultData.siteType === SUB2API) {
            setAuthType(AuthTypeEnum.AccessToken)
            setCookieAuthSessionCookie("")
            setCheckIn((prev) => ({
              ...prev,
              enableDetection: false,
              autoCheckInEnabled: false,
            }))
          }
        }

        // Attempt to auto-import session cookies after detection for cookie-auth accounts.
        if (
          authType === AuthTypeEnum.Cookie &&
          resultData.siteType !== SUB2API &&
          !cookieAuthSessionCookie.trim() &&
          url.trim()
        ) {
          try {
            const cookieResponse = await sendRuntimeMessage({
              action:
                RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
              url: url.trim(),
            })
            const header =
              typeof cookieResponse?.data === "string"
                ? cookieResponse.data.trim()
                : ""
            if (header) {
              setCookieAuthSessionCookie(header)
            }
          } catch (error) {
            logger.warn("Auto-import cookie failed", {
              error,
              url: url.trim(),
            })
          }
        }

        setIsDetected(true)
        setSiteName(resultData.siteName)
        if (mode === DIALOG_MODES.EDIT) {
          toast.success(t("messages.autoDetectSuccess"))
        }
      }
    } catch (error) {
      logger.error("Auto-detect failed", { error, url: url.trim(), authType })
      setDetectionError(analyzeAutoDetectError(error))
      setShowManualForm(true)
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSaveAccount = async () => {
    setIsSaving(true)
    try {
      const sub2apiAuth: Sub2ApiAuthConfig | undefined =
        siteType === SUB2API &&
        sub2apiUseRefreshToken &&
        sub2apiRefreshToken.trim()
          ? {
              refreshToken: sub2apiRefreshToken.trim(),
              ...(typeof sub2apiTokenExpiresAt === "number"
                ? { tokenExpiresAt: sub2apiTokenExpiresAt }
                : {}),
            }
          : undefined

      const result =
        mode === DIALOG_MODES.ADD
          ? await validateAndSaveAccount(
              url.trim(),
              siteName.trim(),
              username.trim(),
              accessToken.trim(),
              userId.trim(),
              exchangeRate,
              notes.trim(),
              tagIds,
              checkIn,
              siteType,
              authType,
              cookieAuthSessionCookie.trim(),
              manualBalanceUsd,
              excludeFromTotalBalance,
              sub2apiAuth,
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
              tagIds,
              checkIn,
              siteType,
              authType,
              cookieAuthSessionCookie.trim(),
              manualBalanceUsd,
              excludeFromTotalBalance,
              sub2apiAuth,
            )

      if (result.success) {
        toast.success(
          result.message ??
            t(
              mode === DIALOG_MODES.ADD
                ? "messages.addSuccess"
                : "messages.updateSuccess",
              {
                name: siteName,
              },
            ),
        )
        return result
      } else {
        toast.error(
          t("messages.operationFailed", {
            error: result.message || t("messages.saveFailed"),
          }),
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
          error: getErrorMessage(error),
        }),
      )
      logger.error("Auto configuration failed", { error })
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
        logger.warn("Failed to normalize URL input", { error, url: newUrl })
        setUrl(newUrl)
      }
    } else {
      setUrl("")
      if (mode === DIALOG_MODES.ADD) {
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

  const handleSub2apiUseRefreshTokenChange = (enabled: boolean) => {
    setSub2apiUseRefreshToken(enabled)

    // If the user explicitly disables refresh-token mode, clear any captured
    // credentials to avoid accidental persistence.
    if (!enabled) {
      setSub2apiRefreshToken("")
      setSub2apiTokenExpiresAt(null)
    }
  }

  const isFormValid = isValidAccount({
    siteName,
    username,
    userId,
    siteType,
    authType,
    accessToken,
    cookieAuthSessionCookie,
    exchangeRate,
  })
  const isSub2ApiRefreshTokenValid =
    siteType !== SUB2API ||
    !sub2apiUseRefreshToken ||
    !!sub2apiRefreshToken.trim()
  const isManualBalanceUsdInvalid =
    manualBalanceUsd.trim() !== "" &&
    parseManualQuotaFromUsd(manualBalanceUsd) === undefined

  return {
    state: {
      url,
      isDetecting,
      isDetectingSlow,
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
      manualBalanceUsd,
      isManualBalanceUsdInvalid,
      currentTabUrl,
      notes,
      tagIds,
      excludeFromTotalBalance,
      checkIn,
      siteType,
      authType,
      sub2apiUseRefreshToken,
      sub2apiRefreshToken,
      sub2apiTokenExpiresAt,
      isFormValid:
        isFormValid && isSub2ApiRefreshTokenValid && !isManualBalanceUsdInvalid,
      isAutoConfiguring,
      cookieAuthSessionCookie,
      isImportingCookies,
      isImportingSub2apiSession,
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
      setManualBalanceUsd,
      setNotes,
      setTagIds,
      setExcludeFromTotalBalance,
      setCheckIn,
      setSiteType,
      setAuthType,
      setCookieAuthSessionCookie,
      setSub2apiRefreshToken,
      setSub2apiTokenExpiresAt,
    },
    handlers: {
      handleUseCurrentTabUrl,
      handleAutoDetect,
      handleSaveAccount,
      handleUrlChange,
      handleSubmit,
      handleAutoConfig,
      handleClose,
      handleImportCookieAuthSessionCookie,
      handleImportSub2apiSession,
      handleSub2apiUseRefreshTokenChange,
    },
  }
}

/**
 * Normalizes unknown error values into human-readable strings for toast notifications.
 * @param error Unknown error value thrown during account operations.
 * @returns Extracted error message string.
 */
function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return String(error)
}
