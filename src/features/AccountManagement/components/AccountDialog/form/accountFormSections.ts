import { ShieldCheck } from "lucide-react"

import {
  AccountBalanceIcon,
  AccountSiteIcon,
  AccountTagIcon,
  AutoCheckinIcon,
} from "~/components/icons/productIcons"

export const ACCOUNT_FORM_SECTION_IDS = [
  "site-info",
  "account-auth",
  "tags-notes",
  "check-in",
  "balance",
] as const

export type AccountFormSectionId = (typeof ACCOUNT_FORM_SECTION_IDS)[number]

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
  "site-info": "account-form-site-info",
  "account-auth": "account-form-auth",
  "tags-notes": "account-form-tags-notes",
  "check-in": "account-check-in-config",
  balance: "account-form-balance",
}

export const ACCOUNT_EDIT_SECTIONS = [
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS["site-info"],
    title: "sections.siteInfo.title",
    icon: AccountSiteIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS["account-auth"],
    title: "sections.accountAuth.title",
    icon: ShieldCheck,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS["check-in"],
    title: "sections.checkInConfig.title",
    icon: AutoCheckinIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS["balance"],
    title: "sections.balanceAndStats.title",
    icon: AccountBalanceIcon,
  },
  {
    id: ACCOUNT_FORM_SECTION_ELEMENT_IDS["tags-notes"],
    title: "sections.tagsAndNotes.title",
    icon: AccountTagIcon,
  },
] as const

export const ACCOUNT_FORM_MOBILE_DEFAULT_OPEN: Record<
  AccountFormSectionId,
  boolean
> = {
  "site-info": true,
  "account-auth": true,
  "tags-notes": true,
  "check-in": true,
  balance: false,
}
