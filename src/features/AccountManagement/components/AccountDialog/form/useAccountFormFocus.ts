import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react"

import {
  ACCOUNT_FORM_FIELDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"
import { revealNavigationTarget } from "~/utils/dom/navigationTarget"

import { ACCOUNT_LOGIN_SECTION_ID } from "../login/AccountLoginSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
  ACCOUNT_ISSUE_SECTIONS,
  type AccountFormSectionId,
} from "./accountFormSections"

export interface AccountFormHandle {
  focusAccessToken: () => void
  focusIssue: (field: AccountFormIssue["field"]) => void
}

/** Opens the relevant form section before focusing its field or login control. */
export function useAccountFormFocus({
  ref,
  focusSection,
  usesAccountLogin,
  compact,
  accessToken,
  accessTokenRequired,
}: {
  ref?: Ref<AccountFormHandle>
  focusSection?: AccountFormSectionId
  usesAccountLogin: boolean
  compact?: boolean
  accessToken: string
  accessTokenRequired: boolean
}) {
  const formRootRef = useRef<HTMLDivElement>(null)
  const loginMethodRef = useRef<HTMLButtonElement>(null)
  const clearLoginHighlightRef = useRef<(() => void) | undefined>(undefined)
  const [isLoginSectionOpen, setIsLoginSectionOpen] = useState(true)
  const [loginFocusRequested, setLoginFocusRequested] = useState(false)
  const handleConfigureLogin = useCallback(() => {
    setIsLoginSectionOpen(true)
    setLoginFocusRequested(true)
  }, [])
  useEffect(() => {
    if (focusSection === ACCOUNT_FORM_SECTIONS.LOGIN && usesAccountLogin) {
      handleConfigureLogin()
    }
  }, [focusSection, usesAccountLogin, handleConfigureLogin])
  const [isAuthSectionOpen, setIsAuthSectionOpen] = useState(
    ACCOUNT_FORM_MOBILE_DEFAULT_OPEN[ACCOUNT_FORM_SECTIONS.AUTH],
  )
  const [issueFocusRequested, setIssueFocusRequested] = useState<{
    field: AccountFormIssue["field"]
  }>()

  useImperativeHandle(ref, () => {
    const focusIssue = (field: AccountFormIssue["field"]) => {
      if (ACCOUNT_ISSUE_SECTIONS[field] === ACCOUNT_FORM_SECTIONS.AUTH)
        setIsAuthSectionOpen(true)
      if (field === ACCOUNT_FORM_FIELDS.LOGIN) setIsLoginSectionOpen(true)
      setIssueFocusRequested({ field })
    }
    return {
      focusAccessToken: () => focusIssue(ACCOUNT_FORM_FIELDS.ACCESS_TOKEN),
      focusIssue,
    }
  }, [])

  useLayoutEffect(() => {
    if (!issueFocusRequested) return
    const { field } = issueFocusRequested
    const section =
      ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_ISSUE_SECTIONS[field]]
    const root = formRootRef.current
    const target = root?.querySelector<HTMLElement>(
      `[data-account-validation-field="${field}"]:not([disabled])`,
    )
    const missingLoginField =
      field === ACCOUNT_FORM_FIELDS.LOGIN
        ? Array.from(
            root?.querySelectorAll<HTMLInputElement>(
              `#${section} input[required]:not([disabled])`,
            ) ?? [],
          ).find((input) => !input.value)
        : undefined
    const tokenBeforeTeam =
      !target &&
      field === ACCOUNT_FORM_FIELDS.USER_ID &&
      accessTokenRequired &&
      !accessToken.trim()
        ? root?.querySelector<HTMLElement>(
            `[data-account-validation-field="${ACCOUNT_FORM_FIELDS.ACCESS_TOKEN}"]`,
          )
        : undefined
    const control =
      missingLoginField ??
      target ??
      tokenBeforeTeam ??
      root?.querySelector<HTMLElement>(`#${section} h3`)
    if (control)
      revealNavigationTarget(control, { block: "center", focus: true })
    setIssueFocusRequested(undefined)
  }, [issueFocusRequested, compact, accessToken, accessTokenRequired])

  useLayoutEffect(() => {
    if (!loginFocusRequested) return
    loginMethodRef.current?.focus({ preventScroll: true })
    const section = document.getElementById(ACCOUNT_LOGIN_SECTION_ID)
    if (section) {
      clearLoginHighlightRef.current = revealNavigationTarget(section, {
        highlight: true,
      })
    }
    setLoginFocusRequested(false)
  }, [loginFocusRequested, isLoginSectionOpen])

  useEffect(() => () => clearLoginHighlightRef.current?.(), [usesAccountLogin])

  return {
    formRootRef,
    loginMethodRef,
    isLoginSectionOpen,
    setIsLoginSectionOpen,
    isAuthSectionOpen,
    setIsAuthSectionOpen,
    handleConfigureLogin,
  }
}
