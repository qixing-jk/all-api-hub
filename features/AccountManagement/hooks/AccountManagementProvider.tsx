import { type ReactNode } from "react"

import { TempWindowFallbackReminderGate } from "~/features/AccountManagement/components/TempWindowFallbackReminderGate"
import { BookmarkDialogStateProvider } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"

import { AccountActionsProvider } from "./AccountActionsContext"
import { AccountDataProvider } from "./AccountDataContext"
import { DialogStateProvider } from "./DialogStateContext"

export const AccountManagementProvider = ({
  children,
  refreshKey,
}: {
  children: ReactNode
  refreshKey?: number
}) => {
  return (
    <AccountDataProvider refreshKey={refreshKey}>
      <DialogStateProvider>
        <BookmarkDialogStateProvider>
          <AccountActionsProvider>{children}</AccountActionsProvider>
        </BookmarkDialogStateProvider>
      </DialogStateProvider>
      <TempWindowFallbackReminderGate />
    </AccountDataProvider>
  )
}
