import type { DuplicateAccountGroup } from "~/services/accounts/accountDedupe"

export type DedupeAccountsKeepChangeInput = {
  groupId: string
  selectedAccountId: string
  recommendedAccountId: string
}

export type DedupeAccountsDialogGroup = DuplicateAccountGroup & {
  groupId: string
  recommendedKeepAccountId: string
  hasManualOverride: boolean
}
