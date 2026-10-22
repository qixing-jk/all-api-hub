import {
  CalendarCheck,
  ChartNoAxesCombined,
  Globe,
  ShieldCheck,
  Tags,
} from "lucide-react"

export const ACCOUNT_EDIT_SECTIONS = [
  {
    id: "account-form-site-info",
    title: "sections.siteInfo.title",
    icon: Globe,
  },
  {
    id: "account-form-auth",
    title: "sections.accountAuth.title",
    icon: ShieldCheck,
  },
  {
    id: "account-check-in-config",
    title: "sections.checkInConfig.title",
    icon: CalendarCheck,
  },
  {
    id: "account-form-balance",
    title: "sections.balanceAndStats.title",
    icon: ChartNoAxesCombined,
  },
  {
    id: "account-form-tags-notes",
    title: "sections.tagsAndNotes.title",
    icon: Tags,
  },
] as const

export const ACCOUNT_FORM_SECTION_IDS = [
  "site-info",
  "account-auth",
  "tags-notes",
  "check-in",
  "balance",
] as const

export type AccountFormSectionId = (typeof ACCOUNT_FORM_SECTION_IDS)[number]

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
