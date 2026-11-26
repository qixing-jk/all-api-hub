import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  ACCOUNT_FORM_FIELDS,
  ACCOUNT_FORM_ISSUE_KINDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"
import { isAccessTokenRecoveryError } from "~/services/accounts/utils/autoDetectUtils"
import { NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES } from "~/services/apiService/newApiFamily/accessTokens/protocol"
import {
  supportsNewApiTokenSetup,
  type NewApiAccessTokenTarget,
} from "~/services/apiService/newApiFamily/accessTokens/validation"
import { AuthTypeEnum } from "~/types"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import type { AccountFormHandle } from "../form/AccountForm"
import type { useAccountDialog } from "../workspace/useAccountDialog"
import {
  NEW_API_TOKEN_RECOVERY_REASONS,
  type NewApiTokenRecoveryReason,
} from "./tokenVerification"
import { useNewApiAccessTokenVerification } from "./useNewApiAccessTokenVerification"

const TOKEN_ENTRY_PAUSE_MS = 800

type TokenSetupState = Pick<
  ReturnType<typeof useAccountDialog>["state"],
  "siteType" | "authType" | "url" | "userId" | "accessToken" | "detectionError"
>

/** Coordinates compact token entry, creation, and advisory verification of the account draft. */
export function useAccountTokenSetup({
  state,
  mode,
  isOpen,
  showAccountForm,
  validationIssues,
  accountFormRef,
  setAccessToken,
  focusField,
}: {
  state: TokenSetupState
  mode: DialogMode
  isOpen: boolean
  showAccountForm: boolean
  validationIssues: readonly AccountFormIssue[]
  accountFormRef: RefObject<AccountFormHandle | null>
  setAccessToken: (token: string) => void
  focusField: (field: AccountFormIssue["field"]) => void
}) {
  const firstIssue = validationIssues[0]
  const [compactAccount, setCompactAccount] = useState(false)
  const [isCreatingToken, setIsCreatingToken] = useState(false)
  const [tokenCreationBusy, setTokenCreationBusy] = useState(false)
  const [tokenCreationFooter, setTokenCreationFooter] =
    useState<HTMLDivElement | null>(null)
  const [tokenStepActions, setTokenStepActions] =
    useState<HTMLDivElement | null>(null)
  const [filledToken, setFilledToken] = useState<
    NewApiAccessTokenTarget & {
      kind: "entered" | "verified"
      detectionError: TokenSetupState["detectionError"]
    }
  >()
  const restoreTokenFieldFocus = useRef(false)
  const tokenPageBody = useRef<HTMLDivElement>(null)
  const tokenPageHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (isOpen) return
    setIsCreatingToken(false)
    setTokenCreationBusy(false)
    setFilledToken(undefined)
    setCompactAccount(false)
    restoreTokenFieldFocus.current = false
  }, [isOpen])

  useLayoutEffect(() => {
    if (isCreatingToken) {
      const body = tokenPageBody.current?.parentElement
      if (body) body.scrollTop = 0
      const heading = tokenPageHeading.current
      heading?.focus({ preventScroll: true })
      return
    }
    if (restoreTokenFieldFocus.current) {
      restoreTokenFieldFocus.current = false
      accountFormRef.current?.focusAccessToken()
    }
  }, [accountFormRef, isCreatingToken])

  const returnToAccount = () => {
    restoreTokenFieldFocus.current = true
    setTokenCreationBusy(false)
    setIsCreatingToken(false)
  }
  const canSetUpNewApiToken =
    showAccountForm &&
    supportsNewApiTokenSetup(state.siteType) &&
    state.authType === AuthTypeEnum.AccessToken &&
    !!state.url &&
    !!state.userId
  const newApiTokenRecovery =
    canSetUpNewApiToken && isAccessTokenRecoveryError(state.detectionError)
  const showTokenSetup = newApiTokenRecovery && !state.accessToken.trim()
  const canEnterTokenStep =
    mode === DIALOG_MODES.ADD &&
    showTokenSetup &&
    validationIssues.length === 1 &&
    firstIssue?.field === ACCOUNT_FORM_FIELDS.ACCESS_TOKEN &&
    firstIssue.kind === ACCOUNT_FORM_ISSUE_KINDS.MISSING
  const tokenStep = compactAccount && showAccountForm
  const activeTokenSetup = showTokenSetup || tokenStep
  const reviewEnteredToken = useCallback(
    (accessToken: string, focusToken: boolean) => {
      setFilledToken({
        kind: "entered",
        baseUrl: state.url,
        userId: state.userId,
        siteType: state.siteType,
        accessToken,
        detectionError: state.detectionError,
      })
      setCompactAccount(false)
      if (focusToken) focusField(ACCOUNT_FORM_FIELDS.ACCESS_TOKEN)
    },
    [focusField, state.detectionError, state.siteType, state.url, state.userId],
  )
  const finishTokenEntry = (value: string, focusToken: boolean) => {
    if (!value.trim()) return
    if (value !== state.accessToken) setAccessToken(value)
    reviewEnteredToken(value, focusToken)
  }

  useEffect(() => {
    if (!isOpen || !tokenStep || isCreatingToken || !state.accessToken.trim())
      return
    const timer = setTimeout(() => {
      if (accountFormRef.current?.isAccessTokenFocused())
        reviewEnteredToken(state.accessToken, true)
    }, TOKEN_ENTRY_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [
    accountFormRef,
    isOpen,
    isCreatingToken,
    reviewEnteredToken,
    state.accessToken,
    tokenStep,
  ])

  const matchesTokenIdentity =
    isOpen &&
    filledToken?.baseUrl === state.url &&
    filledToken.userId === state.userId &&
    filledToken.siteType === state.siteType &&
    state.authType === AuthTypeEnum.AccessToken
  const enteredToken =
    matchesTokenIdentity && filledToken.kind === "entered"
      ? filledToken
      : undefined
  const canVerifyToken =
    isOpen &&
    showAccountForm &&
    !tokenStep &&
    supportsNewApiTokenSetup(state.siteType) &&
    state.authType === AuthTypeEnum.AccessToken
  const verificationTarget = useMemo(() => {
    if (!canVerifyToken || !state.userId.trim() || !state.accessToken.trim())
      return undefined
    const url = tryParseHttpUrl(state.url)
    if (!url || url.username || url.password) return undefined
    return {
      baseUrl: state.url,
      userId: state.userId,
      siteType: state.siteType,
      accessToken: state.accessToken,
    }
  }, [
    canVerifyToken,
    state.accessToken,
    state.siteType,
    state.url,
    state.userId,
  ])
  const {
    status: tokenVerificationStatus,
    verify: verifyToken,
    cancel: cancelTokenVerification,
  } = useNewApiAccessTokenVerification(verificationTarget, enteredToken)
  useEffect(() => {
    if (
      !matchesTokenIdentity ||
      (filledToken.kind === "verified" &&
        filledToken.accessToken !== state.accessToken)
    )
      setFilledToken(undefined)
  }, [filledToken, matchesTokenIdentity, state.accessToken])

  const tokenNeedsReplacement =
    tokenVerificationStatus === VALIDATION_STATUSES.INVALID ||
    tokenVerificationStatus === VALIDATION_STATUSES.IDENTITY_MISMATCH
  const tokenRecoveryReason: NewApiTokenRecoveryReason | undefined =
    activeTokenSetup
      ? NEW_API_TOKEN_RECOVERY_REASONS.MISSING
      : canSetUpNewApiToken && tokenNeedsReplacement
        ? tokenVerificationStatus
        : undefined
  const hasVerifiedCreatedToken =
    matchesTokenIdentity &&
    filledToken.kind === "verified" &&
    filledToken.accessToken === state.accessToken
  const tokenRecoveryHandled =
    matchesTokenIdentity &&
    !!state.accessToken.trim() &&
    filledToken.detectionError === state.detectionError
  const openFullForm = () => {
    if (state.accessToken.trim()) {
      finishTokenEntry(state.accessToken, true)
      return
    }
    setCompactAccount(false)
    focusField(ACCOUNT_FORM_FIELDS.SITE_NAME)
  }

  const startTokenCreation = useCallback(() => {
    cancelTokenVerification()
    setIsCreatingToken(true)
  }, [cancelTokenVerification])

  const finishTokenCreation = (token: string) => {
    setCompactAccount(false)
    setAccessToken(token)
    setFilledToken({
      kind: "verified",
      accessToken: token,
      detectionError: state.detectionError,
      baseUrl: state.url,
      userId: state.userId,
      siteType: state.siteType,
    })
    returnToAccount()
  }

  return {
    canEnterTokenStep,
    canVerifyToken,
    tokenRecoveryHandled,
    showTokenSetup,
    tokenStep,
    activeTokenSetup,
    tokenRecoveryReason,
    tokenNeedsReplacement,
    hasVerifiedCreatedToken,
    tokenVerificationStatus,
    verifyToken,
    cancelTokenVerification,
    finishTokenEntry,
    openFullForm,
    setCompactAccount,
    tokenStepActions,
    setTokenStepActions,
    creation: {
      isOpen: isCreatingToken,
      busy: tokenCreationBusy,
      setBusy: setTokenCreationBusy,
      footer: tokenCreationFooter,
      setFooter: setTokenCreationFooter,
      bodyRef: tokenPageBody,
      headingRef: tokenPageHeading,
      start: startTokenCreation,
      finish: finishTokenCreation,
      goBack: returnToAccount,
    },
  }
}
