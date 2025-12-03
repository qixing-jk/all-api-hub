import { type ReactNode } from "react"

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
        <AccountActionsProvider>{children}</AccountActionsProvider>
      </DialogStateProvider>
    </AccountDataProvider>
  )
}
