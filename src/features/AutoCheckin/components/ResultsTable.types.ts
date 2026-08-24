export interface ResultsTableActionsProps {
  showDevActions?: boolean
  retryingAccountId?: string | null
  pendingOpeningSiteAccountIds?: Set<string>
  openingManualAccountId?: string | null
  openingExternalCheckInAccountId?: string | null
  disablingAccountId?: string | null
  deletingAccountId?: string | null
  externalCheckInAccountIds?: Set<string>
  onRetryAccount?: (accountId: string) => void | Promise<void>
  onOpenAccountSite?: (accountId: string) => void | Promise<void>
  onOpenManualSignIn?: (accountId: string) => void | Promise<void>
  onOpenExternalCheckIn?: (accountId: string) => void | Promise<void>
  onDisableAccount?: (accountId: string) => void | Promise<void>
  onDeleteAccount?: (accountId: string) => void | Promise<void>
}
