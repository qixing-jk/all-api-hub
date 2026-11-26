import { LogIn, ShieldCheck } from "lucide-react"

import {
  AccountBalanceIcon,
  AccountSiteIcon,
  AccountTagIcon,
  AutoCheckinIcon,
} from "~/components/icons/productIcons"
import {
  ACCOUNT_FORM_FIELDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"

export const ACCOUNT_FORM_SECTIONS = {
  SITE_INFO: "site-info",
  AUTH: "account-auth",
  LOGIN: "account-login",
  TAGS_NOTES: "tags-notes",
  CHECK_IN: "check-in",
  BALANCE: "balance",
} as const

export const ACCOUNT_FORM_SECTION_IDS = Object.values(ACCOUNT_FORM_SECTIONS)

export type AccountFormSectionId = (typeof ACCOUNT_FORM_SECTION_IDS)[number]

export const ACCOUNT_ISSUE_SECTIONS = {
  [ACCOUNT_FORM_FIELDS.SITE_NAME]: ACCOUNT_FORM_SECTIONS.SITE_INFO,
  [ACCOUNT_FORM_FIELDS.USERNAME]: ACCOUNT_FORM_SECTIONS.SITE_INFO,
  [ACCOUNT_FORM_FIELDS.USER_ID]: ACCOUNT_FORM_SECTIONS.SITE_INFO,
  [ACCOUNT_FORM_FIELDS.AUTH_TYPE]: ACCOUNT_FORM_SECTIONS.AUTH,
  [ACCOUNT_FORM_FIELDS.ACCESS_TOKEN]: ACCOUNT_FORM_SECTIONS.AUTH,
  [ACCOUNT_FORM_FIELDS.COOKIE]: ACCOUNT_FORM_SECTIONS.AUTH,
  [ACCOUNT_FORM_FIELDS.REFRESH_TOKEN]: ACCOUNT_FORM_SECTIONS.AUTH,
  [ACCOUNT_FORM_FIELDS.LOGIN]: ACCOUNT_FORM_SECTIONS.LOGIN,
  [ACCOUNT_FORM_FIELDS.EXCHANGE_RATE]: ACCOUNT_FORM_SECTIONS.BALANCE,
  [ACCOUNT_FORM_FIELDS.MANUAL_BALANCE_USD]: ACCOUNT_FORM_SECTIONS.BALANCE,
} satisfies Record<AccountFormIssue["field"], AccountFormSectionId>

export const ACCOUNT_FORM_FEEDBACK_STAGES = {
  DETECTED: "detected",
  SUBMITTED: "submitted",
} as const

export type AccountFormFeedbackStage =
  (typeof ACCOUNT_FORM_FEEDBACK_STAGES)[keyof typeof ACCOUNT_FORM_FEEDBACK_STAGES]

/**
 * DOM section id each short form section id renders.
 *
 * The navigation directory keys sections by the DOM id, while draft and
 * presentation code use the short id, so a caller asking for one section needs
 * this bridge instead of comparing the two vocabularies.
 */
export const ACCOUNT_FORM_SECTION_ELEMENT_IDS: Record<
  AccountFormSectionId,
  string
> = {
  [ACCOUNT_FORM_SECTIONS.SITE_INFO]: "account-form-site-info",
  [ACCOUNT_FORM_SECTIONS.AUTH]: "account-form-auth",
  [ACCOUNT_FORM_SECTIONS.LOGIN]: "account-login-config",
  [ACCOUNT_FORM_SECTIONS.TAGS_NOTES]: "account-form-tags-notes",
  [ACCOUNT_FORM_SECTIONS.CHECK_IN]: "account-check-in-config",
  [ACCOUNT_FORM_SECTIONS.BALANCE]: "account-form-balance",
}

export const ACCOUNT_EDIT_SECTIONS = [
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.SITE_INFO],
    title: "sections.siteInfo.title",
    icon: AccountSiteIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.AUTH],
    title: "sections.accountAuth.title",
    icon: ShieldCheck,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.CHECK_IN],
    title: "sections.checkInConfig.title",
    icon: AutoCheckinIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.LOGIN],
    title: "login.title",
    icon: LogIn,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.BALANCE],
    title: "sections.balanceAndStats.title",
    icon: AccountBalanceIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.TAGS_NOTES],
    title: "sections.tagsAndNotes.title",
    icon: AccountTagIcon,
  },
] as const

export const ACCOUNT_FORM_MOBILE_DEFAULT_OPEN: Record<
  AccountFormSectionId,
  boolean
> = {
  [ACCOUNT_FORM_SECTIONS.SITE_INFO]: true,
  [ACCOUNT_FORM_SECTIONS.AUTH]: true,
  [ACCOUNT_FORM_SECTIONS.LOGIN]: true,
  [ACCOUNT_FORM_SECTIONS.TAGS_NOTES]: true,
  [ACCOUNT_FORM_SECTIONS.CHECK_IN]: true,
  [ACCOUNT_FORM_SECTIONS.BALANCE]: false,
}
