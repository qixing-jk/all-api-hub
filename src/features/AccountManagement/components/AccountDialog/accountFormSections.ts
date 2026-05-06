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
