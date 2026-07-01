import { type ReactNode } from "react"

import { TempWindowFallbackReminderGate } from "~/features/AccountManagement/components/TempWindowFallbackReminderGate"
import { LdohSiteLookupProvider } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import { BookmarkDialogStateProvider } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"

import { AccountActionsProvider } from "./AccountActionsContext"
import { AccountDataProvider } from "./AccountDataContext"
import { DialogStateProvider } from "./DialogStateContext"

export const AccountManagementProvider = ({
  children,
  refreshKey,
  onOpenBookmarkImport,
}: {
  children: ReactNode
  refreshKey?: number
  onOpenBookmarkImport?: () => void
}) => {
  return (
    <AccountDataProvider refreshKey={refreshKey}>
      <DialogStateProvider onOpenBookmarkImport={onOpenBookmarkImport}>
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
