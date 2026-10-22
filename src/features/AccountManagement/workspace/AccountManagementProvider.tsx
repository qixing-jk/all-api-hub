import { type ReactNode } from "react"

import { AccountActionsProvider } from "~/features/AccountManagement/actions/AccountActionsContext"
import { TempWindowFallbackReminderGate } from "~/features/AccountManagement/components/TempWindowFallbackReminderGate"
import { AccountDataProvider } from "~/features/AccountManagement/data/AccountDataContext"
import { DialogStateProvider } from "~/features/AccountManagement/dialogs/DialogStateProvider"
import { LdohSiteLookupProvider } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import { BookmarkDialogStateProvider } from "~/features/SiteBookmarks/editor/BookmarkDialogStateContext"

export const AccountManagementProvider = ({
  children,
  refreshKey,
  initialRecoveryId,
}: {
  children: ReactNode
  refreshKey?: number
  initialRecoveryId?: string
}) => {
  return (
    <AccountDataProvider refreshKey={refreshKey}>
      <DialogStateProvider initialRecoveryId={initialRecoveryId}>
        <BookmarkDialogStateProvider>
          <AccountActionsProvider>
            <LdohSiteLookupProvider>{children}</LdohSiteLookupProvider>
          </AccountActionsProvider>
        </BookmarkDialogStateProvider>
      </DialogStateProvider>
      <TempWindowFallbackReminderGate />
    </AccountDataProvider>
  )
}
