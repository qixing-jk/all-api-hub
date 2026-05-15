import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  autoDetectAccount,
  getSiteName,
  isValidAccount,
  parseManualQuotaFromUsd,
  validateAndSaveAccount,
  validateAndUpdateAccount,
} from "~/services/accounts/accountOperations"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
  selectSingleNewApiTokenByIdDiff,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import {
  analyzeAutoDetectError,
  AutoDetectError,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { normalizeAccountSiteUrlForOriginKey } from "~/services/accounts/utils/siteUrlNormalization"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
} from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/events"
import {
  AuthTypeEnum,
  type ApiToken,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount,
  type Sub2ApiAuthConfig,
} from "~/types"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { deepOverride } from "~/utils"
import {
  getActiveTabs,
  getAllTabs,
  onTabActivated,
  onTabUpdated,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { tryParseOrigin } from "~/utils/core/urlParsing"
import { openSettingsTab } from "~/utils/navigation"

import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
  type AccountDialogFormSource,
  type AccountDialogPhase,
} from "../models"

const AUTO_DETECT_SLOW_HINT_DELAY_MS = 10_000

/**
 * Logger scoped to the account dialog lifecycle. Ensure we never include raw tokens/cookies in log details.
 */
const logger = createLogger("AccountDialogHook")

interface CookieImportResponse {
  success?: boolean
  data?: string
  error?: string
  errorCode?: string
}

interface UseAccountDialogProps {
  mode: DialogMode
  account?: DisplaySiteData | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (data: any) => void
}

interface ManagedSiteConfigPromptState {
  isOpen: boolean
  managedSiteLabel: string
  missingMessage: string
}

interface AihubmixPostSaveKeyPromptState {
  isOpen: boolean
  accountId: string | null
  accountName: string
  isCreating: boolean
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
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const {
    warnOnDuplicateAccountAdd,
    managedSiteType,
    autoFillCurrentSiteUrlOnAccountAdd,
    autoProvisionKeyOnAccountAdd,
  } = useUserPreferencesContext()

  const [url, setUrl] = useState("")
  const [isDetecting, setIsDetecting] = useState(false)
  const [isDetectingSlow, setIsDetectingSlow] = useState(false)
  const [draft, setDraft] = useState<AccountDialogDraft>(
    createEmptyAccountDialogDraft,
  )
  const initialFlowState = getInitialFlowState(mode)
  const [phase, setPhase] = useState<AccountDialogPhase>(initialFlowState.phase)
  const [formSource, setFormSource] = useState<AccountDialogFormSource>(
    initialFlowState.formSource,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(
    null,
  )
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null)
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false)
  const [isImportingCookies, setIsImportingCookies] = useState(false)
  const [showCookiePermissionWarning, setShowCookiePermissionWarning] =
    useState(false)
  const [isImportingSub2apiSession, setIsImportingSub2apiSession] =
    useState(false)
  const [accountPostSaveWorkflowStep, setAccountPostSaveWorkflowStep] =
    useState<AccountPostSaveWorkflowStep>(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
  const [postSaveOneTimeToken, setPostSaveOneTimeToken] =
    useState<ApiToken | null>(null)
  const [postSaveSub2ApiAllowedGroups, setPostSaveSub2ApiAllowedGroups] =
    useState<string[] | null>(null)
  const [postSaveSub2ApiAccount, setPostSaveSub2ApiAccount] =
    useState<DisplaySiteData | null>(null)
  const [postSaveSub2ApiDialogSessionId, setPostSaveSub2ApiDialogSessionId] =
    useState<number | null>(null)

  const [duplicateAccountWarning, setDuplicateAccountWarning] = useState<{
    isOpen: boolean
    siteUrl: string
    existingAccountsCount: number
    existingUsername: string | null
    existingUserId: string | number | null
  }>({
    isOpen: false,
    siteUrl: "",
    existingAccountsCount: 0,
    existingUsername: null,
    existingUserId: null,
  })
  const [managedSiteConfigPrompt, setManagedSiteConfigPrompt] =
    useState<ManagedSiteConfigPromptState>({
      isOpen: false,
      managedSiteLabel: "",
      missingMessage: "",
    })
  const [aihubmixPostSaveKeyPrompt, setAihubmixPostSaveKeyPrompt] =
    useState<AihubmixPostSaveKeyPromptState>({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
  const duplicateAccountWarningResolverRef = useRef<
    ((shouldContinue: boolean) => void) | null
  >(null)
  const duplicateAccountWarningAcknowledgedSiteUrlRef = useRef<string | null>(
    null,
  )
  const hasConsumedAutoFillCurrentSiteUrlRef = useRef(false)
  const siteName = draft.siteName
  const username = draft.username
  const accessToken = draft.accessToken
  const userId = draft.userId
  const exchangeRate = draft.exchangeRate
  const manualBalanceUsd = draft.manualBalanceUsd
  const notes = draft.notes
  const tagIds = draft.tagIds
  const excludeFromTotalBalance = draft.excludeFromTotalBalance
  const checkIn = draft.checkIn
  const siteType = draft.siteType
  const authType = draft.authType
  const cookieAuthSessionCookie = draft.cookieAuthSessionCookie
  const sub2apiUseRefreshToken = draft.sub2apiUseRefreshToken
  const sub2apiRefreshToken = draft.sub2apiRefreshToken
  const sub2apiTokenExpiresAt = draft.sub2apiTokenExpiresAt
  const isDetected =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const showManualForm =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

  const updateDraft = useCallback(
    (updater: (prev: AccountDialogDraft) => AccountDialogDraft) => {
      setDraft((prev) => updater(prev))
    },
    [],
  )
  const setSiteName = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, siteName: value }))
    },
    [updateDraft],
  )
  const setUsername = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, username: value }))
    },
    [updateDraft],
  )
  const setAccessToken = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, accessToken: value }))
    },
    [updateDraft],
  )
  const setUserId = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, userId: value }))
    },
    [updateDraft],
  )
  const setExchangeRate = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, exchangeRate: value }))
    },
    [updateDraft],
  )
  const setManualBalanceUsd = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, manualBalanceUsd: value }))
    },
    [updateDraft],
  )
  const setNotes = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, notes: value }))
    },
    [updateDraft],
  )
  const setTagIds = useCallback(
    (value: string[]) => {
      updateDraft((prev) => ({ ...prev, tagIds: value }))
    },
    [updateDraft],
  )
  const setExcludeFromTotalBalance = useCallback(
    (value: boolean) => {
      updateDraft((prev) => ({ ...prev, excludeFromTotalBalance: value }))
    },
    [updateDraft],
  )
  const setCheckIn = useCallback(
    (value: CheckInConfig) => {
      updateDraft((prev) => ({ ...prev, checkIn: value }))
    },
    [updateDraft],
  )
  const setSiteType = useCallback(
    (value: string) => {
      updateDraft((prev) => ({
        ...prev,
        siteType: isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN,
      }))
    },
    [updateDraft],
  )
  const setAuthType = useCallback(
    (value: AuthTypeEnum) => {
      updateDraft((prev) => ({ ...prev, authType: value }))
    },
    [updateDraft],
  )
  const setCookieAuthSessionCookie = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, cookieAuthSessionCookie: value }))
    },
    [updateDraft],
  )
  const setSub2apiUseRefreshToken = useCallback(
    (value: boolean) => {
      updateDraft((prev) => ({ ...prev, sub2apiUseRefreshToken: value }))
    },
    [updateDraft],
  )
  const setSub2apiRefreshToken = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, sub2apiRefreshToken: value }))
    },
    [updateDraft],
  )
  const setSub2apiTokenExpiresAt = useCallback(
    (value: number | null) => {
      updateDraft((prev) => ({ ...prev, sub2apiTokenExpiresAt: value }))
    },
    [updateDraft],
  )
  const setDraftPartial = useCallback(
    (value: Partial<AccountDialogDraft>) => {
      updateDraft((prev) => ({ ...prev, ...value }))
    },
    [updateDraft],
  )
  const enterForm = useCallback((source: AccountDialogFormSource) => {
    setPhase(ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM)
    setFormSource(source)
  }, [])

  const cancelPendingDuplicateAccountWarning = useCallback(() => {
    duplicateAccountWarningResolverRef.current?.(false)
    duplicateAccountWarningResolverRef.current = null
    duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setDuplicateAccountWarning((prev) =>
        prev.isOpen ? { ...prev, isOpen: false } : prev,
      )
    }

    return () => {
      cancelPendingDuplicateAccountWarning()
    }
  }, [cancelPendingDuplicateAccountWarning, isOpen])

  const requestDuplicateAccountAddConfirmation = useCallback(
    (params: {
      siteUrl: string
      existingAccountsCount: number
      existingUsername?: string | null
      existingUserId?: string | number | null
    }) => {
      // If the user triggers the same flow multiple times quickly, cancel the
      // previous pending promise to avoid leaving it unresolved.
      if (duplicateAccountWarningResolverRef.current) {
        duplicateAccountWarningResolverRef.current(false)
      }

      setDuplicateAccountWarning({
        isOpen: true,
        siteUrl: params.siteUrl,
        existingAccountsCount: params.existingAccountsCount,
        existingUsername: params.existingUsername ?? null,
        existingUserId: params.existingUserId ?? null,
      })

      return new Promise<boolean>((resolve) => {
        duplicateAccountWarningResolverRef.current = resolve
      })
    },
    [],
  )

  const ensureDuplicateAccountAddConfirmation = useCallback(async () => {
    if (mode !== DIALOG_MODES.ADD || !warnOnDuplicateAccountAdd) {
      return true
    }

    const baseUrl = url.trim()
    const normalizedBaseUrl = normalizeSiteUrlForDuplicateCheck({
      value: baseUrl,
      siteType,
    })
    const currentUserId = userId.trim()

    if (!baseUrl) {
      return true
    }

    if (
      duplicateAccountWarningAcknowledgedSiteUrlRef.current ===
      normalizedBaseUrl
    ) {
      return true
    }

    const accounts = await accountStorage.getAllAccounts()
    const existingSiteAccounts = accounts.filter(
      (acc) =>
        normalizeSiteUrlForDuplicateCheck({
          value: acc.site_url,
          siteType: acc.site_type,
        }) === normalizedBaseUrl,
    )

    if (existingSiteAccounts.length === 0) {
      return true
    }

    const exactMatch = currentUserId
      ? existingSiteAccounts.find(
          (acc) => String(acc.account_info.id) === currentUserId,
        )
      : undefined

    const shouldContinue = await requestDuplicateAccountAddConfirmation({
      siteUrl: normalizedBaseUrl,
      existingAccountsCount: existingSiteAccounts.length,
      ...(exactMatch
        ? {
            existingUserId: exactMatch.account_info.id,
            existingUsername: exactMatch.account_info.username,
          }
        : {}),
    })

    if (!shouldContinue) {
      return false
    }

    duplicateAccountWarningAcknowledgedSiteUrlRef.current = normalizedBaseUrl
    return true
  }, [
    mode,
    requestDuplicateAccountAddConfirmation,
    siteType,
    url,
    userId,
    warnOnDuplicateAccountAdd,
  ])

  const handleDuplicateAccountWarningCancel = useCallback(() => {
    setDuplicateAccountWarning((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    duplicateAccountWarningResolverRef.current?.(false)
    duplicateAccountWarningResolverRef.current = null
  }, [])

  const handleDuplicateAccountWarningContinue = useCallback(() => {
    setDuplicateAccountWarning((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    duplicateAccountWarningResolverRef.current?.(true)
    duplicateAccountWarningResolverRef.current = null
  }, [])

  // Enforce Sub2API constraints: JWT-only (access token), no built-in check-in.
  useEffect(() => {
    if (siteType !== SITE_TYPES.SUB2API) return

    updateDraft((prev) => applySub2ApiDraftConstraints(prev))
  }, [siteType, updateDraft])

  useEffect(() => {
    if (siteType === SITE_TYPES.SUB2API) return

    updateDraft((prev) => clearSub2ApiRefreshTokenState(prev))
  }, [siteType, updateDraft])

  // useRef 保存跨渲染引用
  const newAccountRef = useRef<any>(null)
  const targetAccountRef = useRef<any>(null)
  const pendingPostSaveChannelRef = useRef<{
    displaySiteData: DisplaySiteData
    token?: ApiToken
    existingTokenIds?: number[]
  } | null>(null)
  const pendingAihubmixPostSaveSuccessRef = useRef<string | null>(null)
  const postSaveAutoConfigRunRef = useRef(0)
  const aihubmixPostSaveKeyRunRef = useRef(0)
  const nextPostSaveSub2ApiDialogSessionIdRef = useRef(0)
  const activePostSaveSub2ApiDialogSessionIdRef = useRef<number | null>(null)
  const detectSlowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const detectedCookieStoreIdRef = useRef<string | null>(null)

  const { openWithAccount: openChannelDialog, openSub2ApiTokenCreationDialog } =
    useChannelDialog()

  const invalidatePostSaveAutoConfigRun = useCallback(() => {
    postSaveAutoConfigRunRef.current += 1
  }, [])

  const openPostSaveSub2ApiDialogSession = useCallback(() => {
    const nextSessionId = nextPostSaveSub2ApiDialogSessionIdRef.current + 1
    nextPostSaveSub2ApiDialogSessionIdRef.current = nextSessionId
    activePostSaveSub2ApiDialogSessionIdRef.current = nextSessionId
    setPostSaveSub2ApiDialogSessionId(nextSessionId)
    return nextSessionId
  }, [])

  const invalidatePostSaveSub2ApiDialogSession = useCallback(() => {
    activePostSaveSub2ApiDialogSessionIdRef.current = null
    setPostSaveSub2ApiDialogSessionId(null)
  }, [])

  const clearPostSaveWorkflowState = useCallback(() => {
    invalidatePostSaveAutoConfigRun()
    invalidatePostSaveSub2ApiDialogSession()
    aihubmixPostSaveKeyRunRef.current += 1
    setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    setPostSaveOneTimeToken(null)
    setPostSaveSub2ApiAllowedGroups(null)
    setPostSaveSub2ApiAccount(null)
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    pendingAihubmixPostSaveSuccessRef.current = null
    pendingPostSaveChannelRef.current = null
  }, [invalidatePostSaveAutoConfigRun, invalidatePostSaveSub2ApiDialogSession])

  const completePendingAihubmixPostSaveSuccess = useCallback(() => {
    const savedAccountId = pendingAihubmixPostSaveSuccessRef.current
    pendingAihubmixPostSaveSuccessRef.current = null
    if (savedAccountId) {
      onSuccess?.(savedAccountId)
    }
  }, [onSuccess])

  const resetForm = useCallback(() => {
    newAccountRef.current = null
    detectedCookieStoreIdRef.current = null
    duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
    hasConsumedAutoFillCurrentSiteUrlRef.current = false
    setUrl("")
    setDraft(createEmptyAccountDialogDraft())
    const nextFlowState = getInitialFlowState(mode)
    setPhase(nextFlowState.phase)
    setFormSource(nextFlowState.formSource)
    setShowAccessToken(false)
    setDetectionError(null)
    setCurrentTabUrl(null)
    setIsAutoConfiguring(false)
    setIsImportingCookies(false)
    setShowCookiePermissionWarning(false)
    setIsImportingSub2apiSession(false)
    clearPostSaveWorkflowState()
    targetAccountRef.current = null
  }, [clearPostSaveWorkflowState, mode])

  const loadAccountData = useCallback(
    async (accountId: string) => {
      try {
        const siteAccount = await accountStorage.getAccountById(accountId)
        if (siteAccount) {
          setUrl(siteAccount.site_url)
          const refreshToken = siteAccount.sub2apiAuth?.refreshToken ?? ""
          const normalizedSiteType = resolveStoredSiteType(
            siteAccount.site_type,
            Boolean(siteAccount.sub2apiAuth),
          )
          setDraft({
            siteName: siteAccount.site_name,
            username: siteAccount.account_info.username,
            accessToken: siteAccount.account_info.access_token,
            userId: siteAccount.account_info.id.toString(),
            exchangeRate: siteAccount.exchange_rate.toString(),
            manualBalanceUsd: siteAccount.manualBalanceUsd ?? "",
            notes: siteAccount.notes || "",
            tagIds: siteAccount.tagIds || [],
            excludeFromTotalBalance:
              siteAccount.excludeFromTotalBalance === true,
            checkIn: {
              enableDetection: siteAccount.checkIn?.enableDetection ?? false,
              autoCheckInEnabled:
                siteAccount.checkIn?.autoCheckInEnabled ?? true,
              siteStatus: {
                isCheckedInToday:
                  siteAccount.checkIn?.siteStatus?.isCheckedInToday ?? false,
                lastCheckInDate:
                  siteAccount.checkIn?.siteStatus?.lastCheckInDate,
              },
              customCheckIn: {
                url: siteAccount.checkIn?.customCheckIn?.url ?? "",
                turnstilePreTrigger:
                  siteAccount.checkIn?.customCheckIn?.turnstilePreTrigger,
                redeemUrl: siteAccount.checkIn?.customCheckIn?.redeemUrl ?? "",
                openRedeemWithCheckIn:
                  siteAccount.checkIn?.customCheckIn?.openRedeemWithCheckIn ??
                  true,
                isCheckedInToday:
                  siteAccount.checkIn?.customCheckIn?.isCheckedInToday ?? false,
                lastCheckInDate:
                  siteAccount.checkIn?.customCheckIn?.lastCheckInDate,
              },
            },
            siteType: normalizedSiteType,
            authType: siteAccount.authType || AuthTypeEnum.AccessToken,
            cookieAuthSessionCookie:
              siteAccount.cookieAuth?.sessionCookie || "",
            sub2apiUseRefreshToken:
              normalizedSiteType === SITE_TYPES.SUB2API &&
              Boolean(refreshToken.trim()),
            sub2apiRefreshToken:
              normalizedSiteType === SITE_TYPES.SUB2API ? refreshToken : "",
            sub2apiTokenExpiresAt:
              normalizedSiteType === SITE_TYPES.SUB2API
                ? siteAccount.sub2apiAuth?.tokenExpiresAt ?? null
                : null,
          })
          enterForm(ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT)
        }
      } catch (error) {
        logger.error("Failed to load account data", { error, accountId })
        toast.error(t("messages.loadFailed"))
      }
    },
    [enterForm, t],
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
  }, [account, mode, setSiteName])

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
    if (!isOpen || mode !== DIALOG_MODES.ADD) {
      return
    }
    if (!autoFillCurrentSiteUrlOnAccountAdd) {
      return
    }
    if (!currentTabUrl || url.trim()) {
      return
    }
    if (hasConsumedAutoFillCurrentSiteUrlRef.current) {
      return
    }

    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    setUrl(currentTabUrl)
  }, [autoFillCurrentSiteUrlOnAccountAdd, currentTabUrl, isOpen, mode, url])

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

  const handleClearUrl = () => {
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    setUrl("")
    if (mode === DIALOG_MODES.ADD) {
      setSiteName("")
    }
  }

  const handleClose = useCallback(() => {
    handleDuplicateAccountWarningCancel()
    cancelPendingDuplicateAccountWarning()
    completePendingAihubmixPostSaveSuccess()
    clearPostSaveWorkflowState()
    setManagedSiteConfigPrompt((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    targetAccountRef.current = null
    onClose()
  }, [
    cancelPendingDuplicateAccountWarning,
    clearPostSaveWorkflowState,
    completePendingAihubmixPostSaveSuccess,
    handleDuplicateAccountWarningCancel,
    onClose,
  ])

  const handleOpenCookiePermissionSettings = useCallback(() => {
    void openSettingsTab("permissions")
  }, [])

  const isAihubmixNormalSaveForegroundKeyFlow = useCallback(
    (options?: {
      skipSub2ApiKeyPrompt?: boolean
      skipAutoProvisionKeyOnAccountAdd?: boolean
    }) =>
      mode === DIALOG_MODES.ADD &&
      siteType === SITE_TYPES.AIHUBMIX &&
      autoProvisionKeyOnAccountAdd &&
      options?.skipAutoProvisionKeyOnAccountAdd !== true,
    [autoProvisionKeyOnAccountAdd, mode, siteType],
  )

  const shouldDeferAccountSaveSuccess = useCallback(
    (result: AccountSaveResponse) =>
      mode === DIALOG_MODES.ADD &&
      siteType === SITE_TYPES.AIHUBMIX &&
      autoProvisionKeyOnAccountAdd &&
      result.success === true &&
      typeof result.accountId === "string" &&
      result.accountId.trim().length > 0,
    [autoProvisionKeyOnAccountAdd, mode, siteType],
  )

  const handleImportCookieAuthSessionCookie = async () => {
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }
    setIsImportingCookies(true)
    try {
      const response = await sendRuntimeMessage<CookieImportResponse>({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: url.trim(),
        ...(detectedCookieStoreIdRef.current
          ? { cookieStoreId: detectedCookieStoreIdRef.current }
          : {}),
      })
      if (response?.success && response.data) {
        setCookieAuthSessionCookie(response.data)
        setShowCookiePermissionWarning(false)
        toast.success(t("messages.importCookiesSuccess"))
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        setShowCookiePermissionWarning(false)

        if (!response?.errorCode) {
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          toast.error(
            response?.error
              ? t("messages.importCookiesFailed", { error: response.error })
              : t("messages.importCookiesEmpty"),
          )
          return
        }

        switch (response.errorCode) {
          case COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied:
            setShowCookiePermissionWarning(true)
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
            })
            toast.error(t("messages.importCookiesPermissionDenied"))
            break
          case COOKIE_IMPORT_FAILURE_REASONS.ReadFailed:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            })
            toast.error(
              response.error
                ? t("messages.importCookiesFailed", { error: response.error })
                : t("messages.importCookiesFailedUnknown"),
            )
            break
          case COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound:
          default:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
            toast.error(t("messages.importCookiesEmpty"))
            break
        }
      }
    } catch (error) {
      logger.warn("Failed to import cookies", { error, url: url.trim() })
      toast.error(
        t("messages.importCookiesFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsImportingCookies(false)
    }
  }

  const handleManagedSiteConfigPromptClose = useCallback(() => {
    setManagedSiteConfigPrompt((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
  }, [])

  const handleOpenManagedSiteSettings = useCallback(() => {
    handleManagedSiteConfigPromptClose()

    void openSettingsTab("managedSite", { preserveHistory: true }).catch(
      (error) => {
        toast.error(
          t("messages.operationFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open managed-site settings", {
          managedSiteType,
          error: getErrorMessage(error),
        })
      },
    )
  }, [handleManagedSiteConfigPromptClose, managedSiteType, t])

  const ensureManagedSiteAutoConfigReady = useCallback(async () => {
    const service = getManagedSiteServiceForType(managedSiteType)
    const managedConfig = await service.getConfig()

    if (managedConfig) {
      return true
    }

    setManagedSiteConfigPrompt({
      isOpen: true,
      managedSiteLabel: getManagedSiteLabel(t, managedSiteType),
      missingMessage: getManagedSiteConfigMissingMessage(
        t,
        service.messagesKey,
      ),
    })

    return false
  }, [managedSiteType, t])

  /**
   * Import Sub2API dashboard session credentials (including refresh_token) into the form.
   *
   * Strategy:
   * 1) Prefer any existing tab with the same origin (least intrusive; supports incognito tabs when allowed).
   * 2) Fall back to the background temp-window auto-detect flow.
   */
  const handleImportSub2apiSession = async () => {
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }

    setIsImportingSub2apiSession(true)
    try {
      const baseUrl = url.trim()
      const targetOrigin = tryParseOrigin(baseUrl)

      let imported: any | null = null

      if (targetOrigin && browser?.tabs?.sendMessage) {
        const tabs = await getAllTabs().catch(() => [])
        const candidates = tabs
          .filter((tab) => {
            if (!tab?.id || !tab.url) return false
            return tryParseOrigin(tab.url) === targetOrigin
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
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
        toast.error(t("messages.importSub2apiSessionMissing"))
        return
      }

      const tokenExpiresAtRaw = imported?.sub2apiAuth?.tokenExpiresAt
      const importedAccessToken =
        typeof imported?.accessToken === "string"
          ? imported.accessToken.trim()
          : ""
      const importedUserId =
        typeof imported?.userId === "number" && Number.isFinite(imported.userId)
          ? imported.userId
          : null
      const importedUsername =
        typeof imported?.user?.username === "string"
          ? imported.user.username.trim()
          : ""
      updateDraft((prev) => ({
        ...prev,
        sub2apiRefreshToken: refreshToken,
        sub2apiTokenExpiresAt:
          typeof tokenExpiresAtRaw === "number" &&
          Number.isFinite(tokenExpiresAtRaw)
            ? tokenExpiresAtRaw
            : null,
        ...(importedAccessToken ? { accessToken: importedAccessToken } : {}),
        ...(typeof importedUserId === "number"
          ? { userId: String(importedUserId) }
          : {}),
        ...(importedUsername ? { username: importedUsername } : {}),
      }))

      toast.success(t("messages.importSub2apiSessionSuccess"))
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsImportingSub2apiSession(false)
    }
  }

  const handleAutoDetect = async () => {
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      return
    }

    try {
      const shouldContinue = await ensureDuplicateAccountAddConfirmation()
      if (!shouldContinue) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
    } catch (error) {
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      return
    }

    setIsDetecting(true)
    setDetectionError(null)
    detectedCookieStoreIdRef.current = null

    try {
      const result = await autoDetectAccount(url.trim(), authType)

      if (!result.success) {
        setDetectionError(result.detailedError || null)
        enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: getAutoDetectAnalyticsErrorCategory(
            result.detailedError?.type,
          ),
        })
        return
      }

      const resultData = result.data
      if (resultData) {
        detectedCookieStoreIdRef.current =
          resultData.fetchContext &&
          typeof resultData.fetchContext.cookieStoreId === "string" &&
          resultData.fetchContext.cookieStoreId.trim()
            ? resultData.fetchContext.cookieStoreId.trim()
            : null

        const detectedCheckIn: CheckInConfig = {
          ...(resultData.checkIn ?? {}),
          enableDetection: resultData.checkIn?.enableDetection ?? false,
          autoCheckInEnabled: resultData.checkIn?.autoCheckInEnabled ?? true,
          siteStatus: {
            ...(resultData.checkIn?.siteStatus ?? {}),
            isCheckedInToday:
              resultData.checkIn?.siteStatus?.isCheckedInToday ?? false,
          },
          customCheckIn: {
            ...(resultData.checkIn?.customCheckIn ?? {}),
            url: resultData.checkIn?.customCheckIn?.url ?? "",
            redeemUrl: resultData.checkIn?.customCheckIn?.redeemUrl ?? "",
            openRedeemWithCheckIn:
              resultData.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true,
            isCheckedInToday:
              resultData.checkIn?.customCheckIn?.isCheckedInToday ?? false,
          },
        }

        const preserveExistingCheckIn =
          mode === DIALOG_MODES.EDIT ||
          formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

        const nextSiteType = isAccountSiteType(resultData.siteType)
          ? resultData.siteType
          : siteType
        const nextCheckIn =
          nextSiteType === SITE_TYPES.SUB2API
            ? {
                ...detectedCheckIn,
                enableDetection: false,
                autoCheckInEnabled: false,
              }
            : detectedCheckIn

        setDraft((prev) =>
          buildDraftFromAutoDetectResult({
            draft: prev,
            resultData,
            nextSiteType,
            nextCheckIn,
            preserveExistingCheckIn,
            mode,
          }),
        )

        // Attempt to auto-import session cookies after detection for cookie-auth
        // accounts. AIHubMix uses cookies only during access-token import, so it
        // should not keep a saved cookie-auth session.
        if (
          authType === AuthTypeEnum.Cookie &&
          resultData.siteType !== SITE_TYPES.SUB2API &&
          resultData.siteType !== SITE_TYPES.AIHUBMIX &&
          !cookieAuthSessionCookie.trim() &&
          url.trim()
        ) {
          try {
            const cookieResponse = await sendRuntimeMessage({
              action:
                RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
              url: url.trim(),
              ...(detectedCookieStoreIdRef.current
                ? { cookieStoreId: detectedCookieStoreIdRef.current }
                : {}),
            })
            const header =
              typeof cookieResponse?.data === "string"
                ? cookieResponse.data.trim()
                : ""
            if (header) {
              setCookieAuthSessionCookie(header)
              setShowCookiePermissionWarning(false)
            } else if (
              cookieResponse?.errorCode ===
              COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied
            ) {
              setShowCookiePermissionWarning(true)
              toast.error(t("messages.importCookiesPermissionDenied"))
              logger.info(
                "Cookie auto-import skipped because cookie permissions were denied",
                { url: url.trim() },
              )
            }
          } catch (error) {
            logger.warn("Auto-import cookie failed", {
              error,
              url: url.trim(),
            })
          }
        }

        enterForm(ACCOUNT_DIALOG_FORM_SOURCES.DETECTED)
        if (mode === DIALOG_MODES.EDIT) {
          toast.success(t("messages.autoDetectSuccess"))
        }
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      }
    } catch (error) {
      logger.error("Auto-detect failed", { error, url: url.trim(), authType })
      const detectionError = analyzeAutoDetectError(error)
      setDetectionError(detectionError)
      enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getAutoDetectAnalyticsErrorCategory(detectionError.type),
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleShowManualForm = async () => {
    try {
      const shouldContinue = await ensureDuplicateAccountAddConfirmation()
      if (!shouldContinue) {
        return
      }
      enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
    } catch (error) {
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }

  const handleSaveAccount = async (options?: {
    skipSub2ApiKeyPrompt?: boolean
    skipAutoProvisionKeyOnAccountAdd?: boolean
  }) => {
    const analyticsAction = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId:
        mode === DIALOG_MODES.ADD
          ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccount
          : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let isAnalyticsActionCompleted = false

    try {
      setIsSaving(true)
      const sub2apiAuth: Sub2ApiAuthConfig | undefined =
        siteType === SITE_TYPES.SUB2API &&
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
              {
                skipAutoProvisionKeyOnAccountAdd:
                  options?.skipAutoProvisionKeyOnAccountAdd === true ||
                  isAihubmixNormalSaveForegroundKeyFlow(options),
              },
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

      if (!result.success) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        isAnalyticsActionCompleted = true
        throw new Error(result.message || t("messages.saveFailed"))
      }

      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      isAnalyticsActionCompleted = true

      const feedbackMessage =
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : mode === DIALOG_MODES.ADD
            ? t("messages.addSuccess", {
                name: siteName,
              })
            : t("messages.updateSuccess", {
                name: siteName,
              })

      if (result.feedbackLevel === "warning") {
        const warningAccountId =
          typeof result.accountId === "string" && result.accountId.trim()
            ? result.accountId.trim()
            : null

        showWarningToast(feedbackMessage, {
          action: warningAccountId
            ? {
                label: t("common:actions.refresh"),
                onClick: async () => {
                  const accountName =
                    siteName.trim() ||
                    t("messages:toast.success.accountSaveSuccess")
                  const toastId = toast.loading(
                    t("messages:toast.loading.refreshingAccount", {
                      accountName,
                    }),
                  )

                  try {
                    const refreshResult = await accountStorage.refreshAccount(
                      warningAccountId,
                      true,
                    )

                    if (!refreshResult?.refreshed) {
                      toast.error(
                        t("messages:toast.error.refreshAccount", {
                          accountName,
                        }),
                        { id: toastId },
                      )
                      return
                    }

                    toast.success(
                      t("messages:toast.success.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                  } catch (error) {
                    toast.error(
                      t("messages:toast.error.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                    logger.error("Post-save warning refresh failed", {
                      accountId: warningAccountId,
                      error: getErrorMessage(error),
                    })
                  }
                },
              }
            : undefined,
        })
      } else {
        toast.success(feedbackMessage)
      }

      if (
        isAihubmixNormalSaveForegroundKeyFlow(options) &&
        typeof result.accountId === "string" &&
        result.accountId.trim().length > 0
      ) {
        const savedAccountId = result.accountId.trim()
        aihubmixPostSaveKeyRunRef.current += 1
        pendingAihubmixPostSaveSuccessRef.current = savedAccountId
        setAihubmixPostSaveKeyPrompt({
          isOpen: true,
          accountId: savedAccountId,
          accountName: siteName.trim() || SITE_TYPES.AIHUBMIX,
          isCreating: false,
        })
      }

      if (
        siteType === SITE_TYPES.SUB2API &&
        !options?.skipSub2ApiKeyPrompt &&
        typeof result.accountId === "string" &&
        result.accountId.trim().length > 0
      ) {
        try {
          const savedDisplaySiteData =
            (await accountStorage.getDisplayDataById(result.accountId)) ?? null

          if (savedDisplaySiteData) {
            await openSub2ApiTokenCreationDialog(savedDisplaySiteData)
          }
        } catch (error) {
          logger.error("Post-save Sub2API token dialog failed", {
            accountId: result.accountId,
            error: getErrorMessage(error),
          })
        }
      }

      return result
    } catch (error: any) {
      if (!isAnalyticsActionCompleted) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  const handleAihubmixPostSaveKeyPromptCancel = useCallback(() => {
    aihubmixPostSaveKeyRunRef.current += 1
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    completePendingAihubmixPostSaveSuccess()
    toast(t("messages:aihubmix.oneTimeKeyPromptCancelled"))
  }, [completePendingAihubmixPostSaveSuccess, t])

  const handleAihubmixPostSaveKeyPromptConfirm = useCallback(async () => {
    const accountId = aihubmixPostSaveKeyPrompt.accountId
    if (!accountId) return

    const runId = aihubmixPostSaveKeyRunRef.current + 1
    aihubmixPostSaveKeyRunRef.current = runId
    const isCurrentRun = () => aihubmixPostSaveKeyRunRef.current === runId

    setAihubmixPostSaveKeyPrompt((prev) => ({
      ...prev,
      isCreating: true,
    }))

    try {
      const savedAccount = await accountStorage.getAccountById(accountId)
      if (!isCurrentRun()) return
      if (!savedAccount) {
        toast.error(t("messages:toast.error.findAccountDetailsFailed"))
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        completePendingAihubmixPostSaveSuccess()
        return
      }

      const displaySiteData =
        (await accountStorage.getDisplayDataById(accountId)) ??
        accountStorage.convertToDisplayData(savedAccount)
      if (!isCurrentRun()) return

      const ensureResult = await ensureAccountTokenForPostSaveWorkflow({
        account: savedAccount,
        displaySiteData,
      })
      if (!isCurrentRun()) return

      if (
        ensureResult.kind === ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created &&
        ensureResult.oneTimeSecret
      ) {
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        setPostSaveOneTimeToken(ensureResult.token)
        return
      }

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAihubmixPostSaveSuccess()
    } catch (error) {
      if (!isCurrentRun()) return

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAihubmixPostSaveSuccess()
      logger.error("AIHubMix post-save one-time key creation failed", {
        accountId,
        error: getErrorMessage(error),
      })
    }
  }, [
    aihubmixPostSaveKeyPrompt.accountId,
    completePendingAihubmixPostSaveSuccess,
    t,
  ])

  const openPostSaveManagedSiteDialog = useCallback(
    async (
      displaySiteData: DisplaySiteData,
      token: ApiToken,
      runId = postSaveAutoConfigRunRef.current,
      targetAccount = targetAccountRef.current,
    ) => {
      if (postSaveAutoConfigRunRef.current !== runId) {
        return
      }
      const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
      )
      try {
        const openResult = await openChannelDialog(
          displaySiteData,
          token,
          () => {
            if (onSuccess && targetAccount && isCurrentRun()) {
              onSuccess(targetAccount)
            }
          },
          { shouldContinue: isCurrentRun },
        )
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
      } catch (error) {
        if (!isCurrentRun()) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open post-save managed-site dialog", {
          error: getErrorMessage(error),
          accountId: targetAccount,
          siteType: displaySiteData.siteType,
        })
      }
    },
    [onSuccess, openChannelDialog, t],
  )

  const handlePostSaveOneTimeTokenClose = useCallback(async () => {
    const runId = postSaveAutoConfigRunRef.current
    setPostSaveOneTimeToken(null)
    const pending = pendingPostSaveChannelRef.current
    pendingPostSaveChannelRef.current = null
    if (!pending?.token) {
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
      completePendingAihubmixPostSaveSuccess()
      return
    }

    await openPostSaveManagedSiteDialog(
      pending.displaySiteData,
      pending.token,
      runId,
    )
  }, [completePendingAihubmixPostSaveSuccess, openPostSaveManagedSiteDialog])

  const handlePostSaveSub2ApiTokenDialogCloseForSession = useCallback(
    (sessionId: number | null) => {
      if (
        sessionId === null ||
        activePostSaveSub2ApiDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveSub2ApiDialogSession()
      pendingPostSaveChannelRef.current = null
      setPostSaveSub2ApiAllowedGroups(null)
      setPostSaveSub2ApiAccount(null)
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    },
    [invalidatePostSaveSub2ApiDialogSession],
  )

  const handlePostSaveSub2ApiTokenDialogClose = useCallback(() => {
    handlePostSaveSub2ApiTokenDialogCloseForSession(
      activePostSaveSub2ApiDialogSessionIdRef.current,
    )
  }, [handlePostSaveSub2ApiTokenDialogCloseForSession])

  const handlePostSaveSub2ApiTokenCreatedForSession = useCallback(
    async (sessionId: number | null, createdToken?: ApiToken) => {
      if (
        sessionId === null ||
        activePostSaveSub2ApiDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveSub2ApiDialogSession()
      const runId = postSaveAutoConfigRunRef.current
      const pending = pendingPostSaveChannelRef.current
      setPostSaveSub2ApiAllowedGroups(null)
      setPostSaveSub2ApiAccount(null)

      if (!pending) {
        pendingPostSaveChannelRef.current = null
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
        return
      }

      pendingPostSaveChannelRef.current = null
      if (createdToken) {
        await openPostSaveManagedSiteDialog(
          pending.displaySiteData,
          createdToken,
          runId,
        )
        return
      }

      try {
        const { service, request } = createDisplayAccountApiContext(
          pending.displaySiteData,
        )
        const fetchedTokens = await service.fetchAccountTokens(request)
        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        const latestToken = Array.isArray(fetchedTokens)
          ? selectSingleNewApiTokenByIdDiff({
              existingTokenIds: pending.existingTokenIds ?? [],
              tokens: fetchedTokens,
            })
          : null

        if (!latestToken) {
          if (postSaveAutoConfigRunRef.current !== runId) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          toast.error(t("messages:accountOperations.createTokenFailed"))
          return
        }

        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        await openPostSaveManagedSiteDialog(
          pending.displaySiteData,
          latestToken,
          runId,
        )
      } catch (error) {
        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to resolve latest Sub2API token after create", {
          accountId: pending.displaySiteData.id,
          error: getErrorMessage(error),
        })
      }
    },
    [invalidatePostSaveSub2ApiDialogSession, openPostSaveManagedSiteDialog, t],
  )

  const handlePostSaveSub2ApiTokenCreated = useCallback(
    async (createdToken?: ApiToken) => {
      await handlePostSaveSub2ApiTokenCreatedForSession(
        activePostSaveSub2ApiDialogSessionIdRef.current,
        createdToken,
      )
    },
    [handlePostSaveSub2ApiTokenCreatedForSession],
  )

  const getPostSaveSub2ApiDialogHandlers = useCallback(
    (sessionId: number | null) => ({
      onClose: () => {
        handlePostSaveSub2ApiTokenDialogCloseForSession(sessionId)
      },
      onSuccess: async (createdToken?: ApiToken) => {
        await handlePostSaveSub2ApiTokenCreatedForSession(
          sessionId,
          createdToken,
        )
      },
    }),
    [
      handlePostSaveSub2ApiTokenCreatedForSession,
      handlePostSaveSub2ApiTokenDialogCloseForSession,
    ],
  )

  const handleAutoConfig = async () => {
    const runId = postSaveAutoConfigRunRef.current + 1
    postSaveAutoConfigRunRef.current = runId
    const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

    try {
      const isManagedSiteReady = await ensureManagedSiteAutoConfigReady()
      if (!isCurrentRun()) {
        return
      }
      if (!isManagedSiteReady) {
        return
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      logger.error(
        "Failed to validate managed-site auto-config prerequisites",
        {
          managedSiteType,
          error: getErrorMessage(error),
        },
      )
      return
    }

    setIsAutoConfiguring(true)
    try {
      let targetAccount: DisplaySiteData | null | string | undefined =
        account || newAccountRef.current
      let savedSiteAccount: SiteAccount | null = null
      // 如果是新增（account 不存在），就先保存
      if (!targetAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount,
        )
        targetAccount = (
          await handleSaveAccount({
            skipSub2ApiKeyPrompt: true,
            skipAutoProvisionKeyOnAccountAdd: true,
          })
        ).accountId
        if (!isCurrentRun()) {
          return
        }
        if (!targetAccount) {
          toast.error(t("messages.saveAccountFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        // 缓存到 ref，避免重复保存
        newAccountRef.current = targetAccount
      }

      // 缓存目标账户
      if (!isCurrentRun()) {
        return
      }
      targetAccountRef.current = targetAccount
      const intendedTargetAccount = targetAccount
      let displaySiteData

      if (typeof targetAccount === "string") {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount,
        )
        // 获取账户详细信息
        const siteAccount = await accountStorage.getAccountById(targetAccount)
        if (!isCurrentRun()) {
          return
        }
        if (!siteAccount) {
          toast.error(t("messages:toast.error.findAccountDetailsFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        savedSiteAccount = siteAccount
        displaySiteData =
          (await accountStorage.getDisplayDataById(siteAccount.id)) ??
          accountStorage.convertToDisplayData(siteAccount)
        if (!isCurrentRun()) {
          return
        }
      } else {
        displaySiteData = targetAccount
      }

      // The current runtime path opens the channel dialog with prefilled data
      // so users can review it before creation. The direct auto-import helpers
      // are kept only as deprecated compatibility shims.
      if (!savedSiteAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
        )
        const openResult = await openChannelDialog(
          displaySiteData,
          null,
          () => {
            if (onSuccess && intendedTargetAccount && isCurrentRun()) {
              onSuccess(intendedTargetAccount)
            }
          },
          { shouldContinue: isCurrentRun },
        )
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
        return
      }

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken,
      )
      const ensureResult = await ensureAccountTokenForPostSaveWorkflow({
        account: savedSiteAccount,
        displaySiteData,
      })
      if (!isCurrentRun()) {
        return
      }

      switch (ensureResult.kind) {
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready:
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created:
          if (
            ensureResult.kind === ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created &&
            ensureResult.oneTimeSecret
          ) {
            pendingPostSaveChannelRef.current = {
              displaySiteData,
              token: ensureResult.token,
            }
            setPostSaveOneTimeToken(ensureResult.token)
            setAccountPostSaveWorkflowStep(
              ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
            )
            return
          }

          await openPostSaveManagedSiteDialog(
            displaySiteData,
            ensureResult.token,
            runId,
            intendedTargetAccount,
          )
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired:
          openPostSaveSub2ApiDialogSession()
          pendingPostSaveChannelRef.current = {
            displaySiteData,
            existingTokenIds: ensureResult.existingTokenIds,
          }
          setPostSaveSub2ApiAccount(displaySiteData)
          setPostSaveSub2ApiAllowedGroups(ensureResult.allowedGroups)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
          )
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked:
          toast.error(ensureResult.message)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.newApiConfigFailed", {
          error: getErrorMessage(error),
        }),
      )
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
      logger.error("Auto configuration failed", { error })
    } finally {
      if (isCurrentRun()) {
        setIsAutoConfiguring(false)
      }
    }
  }

  const handleUrlChange = (newUrl: string) => {
    duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
    detectedCookieStoreIdRef.current = null
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
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

  const handleSub2apiUseRefreshTokenChange = (enabled: boolean) => {
    setSub2apiUseRefreshToken(enabled)

    // If the user explicitly disables refresh-token mode, clear any captured
    // credentials to avoid accidental persistence.
    if (!enabled) {
      setSub2apiRefreshToken("")
      setSub2apiTokenExpiresAt(null)
    }
  }

  const normalizedFormSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN
  const isFormValid = isValidAccount({
    siteName,
    username,
    userId,
    siteType: normalizedFormSiteType,
    authType,
    accessToken,
    cookieAuthSessionCookie,
    exchangeRate,
  })
  const isSub2ApiRefreshTokenValid =
    siteType !== SITE_TYPES.SUB2API ||
    !sub2apiUseRefreshToken ||
    !!sub2apiRefreshToken.trim()
  const isManualBalanceUsdInvalid =
    manualBalanceUsd.trim() !== "" &&
    parseManualQuotaFromUsd(manualBalanceUsd) === undefined
  const isAccountFormValid =
    isFormValid && isSub2ApiRefreshTokenValid && !isManualBalanceUsdInvalid

  return {
    state: {
      url,
      phase,
      formSource,
      draft,
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
      isFormValid: isAccountFormValid,
      isAutoConfiguring,
      cookieAuthSessionCookie,
      isImportingCookies,
      showCookiePermissionWarning,
      isImportingSub2apiSession,
      accountPostSaveWorkflowStep,
      postSaveOneTimeToken,
      postSaveSub2ApiAllowedGroups,
      postSaveSub2ApiAccount,
      postSaveSub2ApiDialogSessionId,
      duplicateAccountWarning,
      managedSiteConfigPrompt,
      aihubmixPostSaveKeyPrompt,
    },
    setters: {
      setUrl,
      setPhase,
      setFormSource,
      setDraft,
      setDraftPartial,
      setSiteName,
      setUsername,
      setAccessToken,
      setUserId,
      setShowAccessToken,
      setShowManualForm: (visible: boolean) => {
        setPhase(
          visible
            ? ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
            : ACCOUNT_DIALOG_PHASES.SITE_INPUT,
        )
        setFormSource(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
      },
      setExchangeRate,
      setManualBalanceUsd,
      setNotes,
      setTagIds,
      setExcludeFromTotalBalance,
      setCheckIn,
      setSiteType,
      setAuthType,
      setCookieAuthSessionCookie,
      setSub2apiUseRefreshToken,
      setSub2apiRefreshToken,
      setSub2apiTokenExpiresAt,
    },
    handlers: {
      handleUseCurrentTabUrl,
      handleAutoDetect,
      handleShowManualForm,
      handleSaveAccount,
      handleClearUrl,
      handleUrlChange,
      handleSubmit,
      handleAutoConfig,
      handleClose,
      handleImportCookieAuthSessionCookie,
      handleOpenCookiePermissionSettings,
      handleImportSub2apiSession,
      handleSub2apiUseRefreshTokenChange,
      handleDuplicateAccountWarningCancel,
      handleDuplicateAccountWarningContinue,
      handleManagedSiteConfigPromptClose,
      handleOpenManagedSiteSettings,
      handleAihubmixPostSaveKeyPromptCancel,
      handleAihubmixPostSaveKeyPromptConfirm,
      shouldDeferAccountSaveSuccess,
      handlePostSaveOneTimeTokenClose,
      handlePostSaveSub2ApiTokenDialogClose,
      handlePostSaveSub2ApiTokenCreated,
      getPostSaveSub2ApiDialogHandlers,
    },
  }
}

/**
 * Normalizes user-supplied site URLs for duplicate-account checks.
 */
function normalizeSiteUrlForDuplicateCheck(params: {
  value: string
  siteType?: AccountSiteType | string
}): string {
  return normalizeAccountSiteUrlForOriginKey({
    url: params.value,
    siteType: params.siteType,
  })
}

/**
 * Starts account-dialog analytics without letting telemetry initialization abort
 * the user flow.
 */
function startAccountDialogAnalyticsAction(actionId: ProductAnalyticsActionId) {
  return startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

/**
 * Maps detailed auto-detect failure kinds to the coarse analytics taxonomy.
 */
function getAutoDetectAnalyticsErrorCategory(
  errorType?: AutoDetectErrorType,
): ProductAnalyticsErrorCategory {
  switch (errorType) {
    case AutoDetectErrorType.UNAUTHORIZED:
    case AutoDetectErrorType.FORBIDDEN:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case AutoDetectErrorType.TIMEOUT:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case AutoDetectErrorType.NETWORK_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case AutoDetectErrorType.INVALID_RESPONSE:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    case AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED:
    case AutoDetectErrorType.NOT_FOUND:
    case AutoDetectErrorType.SERVER_ERROR:
    case AutoDetectErrorType.UNKNOWN:
    default:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}

/**
 * Resolves the initial flow state for add and edit dialog modes.
 */
function getInitialFlowState(mode: DialogMode): {
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
} {
  return mode === DIALOG_MODES.EDIT
    ? {
        phase: ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT,
      }
    : {
        phase: ACCOUNT_DIALOG_PHASES.SITE_INPUT,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      }
}

/**
 * Enforces the runtime constraints required by Sub2API-backed accounts.
 */
function applySub2ApiDraftConstraints(
  draft: AccountDialogDraft,
): AccountDialogDraft {
  const nextDraft: AccountDialogDraft = {
    ...draft,
    authType: AuthTypeEnum.AccessToken,
    cookieAuthSessionCookie: "",
    checkIn: {
      ...draft.checkIn,
      enableDetection: false,
      autoCheckInEnabled: false,
    },
  }

  return areDraftsEquivalent(draft, nextDraft) ? draft : nextDraft
}

/**
 * Clears refresh-token-only fields when the selected site type is no longer Sub2API.
 */
function clearSub2ApiRefreshTokenState(
  draft: AccountDialogDraft,
): AccountDialogDraft {
  if (
    !draft.sub2apiUseRefreshToken &&
    !draft.sub2apiRefreshToken &&
    draft.sub2apiTokenExpiresAt === null
  ) {
    return draft
  }

  return {
    ...draft,
    sub2apiUseRefreshToken: false,
    sub2apiRefreshToken: "",
    sub2apiTokenExpiresAt: null,
  }
}

/**
 * Merges auto-detected account data into the current draft while preserving user-owned fields when requested.
 */
function buildDraftFromAutoDetectResult(params: {
  draft: AccountDialogDraft
  resultData: NonNullable<Awaited<ReturnType<typeof autoDetectAccount>>["data"]>
  nextSiteType: AccountSiteType
  nextCheckIn: CheckInConfig
  preserveExistingCheckIn: boolean
  mode: DialogMode
}): AccountDialogDraft {
  const {
    draft,
    resultData,
    nextSiteType,
    nextCheckIn,
    preserveExistingCheckIn,
    mode,
  } = params

  const nextDraft: AccountDialogDraft = {
    ...draft,
    username: resultData.username,
    accessToken: resultData.accessToken,
    userId: resultData.userId,
    siteName: resultData.siteName,
    exchangeRate: resultData.exchangeRate
      ? resultData.exchangeRate.toString()
      : mode === DIALOG_MODES.ADD
        ? ""
        : draft.exchangeRate,
    siteType: nextSiteType,
    authType:
      resultData.authType ??
      // AIHubMix auto-detect may start from a cookie-auth browser session, but
      // the saved account must use the retrieved access token.
      (nextSiteType === SITE_TYPES.SUB2API ||
      nextSiteType === SITE_TYPES.AIHUBMIX
        ? AuthTypeEnum.AccessToken
        : draft.authType),
    cookieAuthSessionCookie:
      nextSiteType === SITE_TYPES.SUB2API ||
      nextSiteType === SITE_TYPES.AIHUBMIX
        ? ""
        : draft.cookieAuthSessionCookie,
    checkIn: preserveExistingCheckIn
      ? deepOverride(nextCheckIn, draft.checkIn)
      : nextCheckIn,
    sub2apiRefreshToken:
      resultData.siteType === SITE_TYPES.SUB2API && resultData.sub2apiAuth
        ? resultData.sub2apiAuth.refreshToken
        : draft.sub2apiRefreshToken,
    sub2apiTokenExpiresAt:
      resultData.siteType === SITE_TYPES.SUB2API && resultData.sub2apiAuth
        ? resultData.sub2apiAuth.tokenExpiresAt ?? null
        : draft.sub2apiTokenExpiresAt,
  }

  return nextSiteType === SITE_TYPES.SUB2API
    ? applySub2ApiDraftConstraints(nextDraft)
    : nextDraft
}

/**
 * Avoids unnecessary draft updates when Sub2API normalization would not change the effective values.
 */
function areDraftsEquivalent(
  left: AccountDialogDraft,
  right: AccountDialogDraft,
): boolean {
  return (
    left.authType === right.authType &&
    left.cookieAuthSessionCookie === right.cookieAuthSessionCookie &&
    left.checkIn.enableDetection === right.checkIn.enableDetection &&
    left.checkIn.autoCheckInEnabled === right.checkIn.autoCheckInEnabled &&
    left.sub2apiUseRefreshToken === right.sub2apiUseRefreshToken &&
    left.sub2apiRefreshToken === right.sub2apiRefreshToken &&
    left.sub2apiTokenExpiresAt === right.sub2apiTokenExpiresAt
  )
}

/**
 * Normalizes legacy persisted site types before hydrating edit-mode draft state.
 */
function resolveStoredSiteType(
  value: unknown,
  hasSub2ApiAuth: boolean,
): AccountSiteType {
  if (isAccountSiteType(value)) {
    return value
  }

  return hasSub2ApiAuth ? SITE_TYPES.SUB2API : SITE_TYPES.UNKNOWN
}
