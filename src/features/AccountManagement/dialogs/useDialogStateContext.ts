import { createContext, useContext, type MouseEvent } from "react"

import { type DialogMode } from "~/constants/dialogModes"
import type { AccountFormSectionId } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import type { DisplaySiteData } from "~/types"

export interface DialogOptions {
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
  recoveryState?: AccountDialogRecoveryState | null
  /** Section the dialog opens on, for a guidance action with one target. */
  focusSection?: AccountFormSectionId
}

interface DialogStateContextType {
  openAccountDialog: (options: DialogOptions) => Promise<any>
  // For backward compatibility
  isAddAccountOpen: boolean
  isEditAccountOpen: boolean
  editingAccount: DisplaySiteData | null
  openAddAccount: (
    prefillOrEvent?: AddAccountPrefill | MouseEvent | null,
  ) => void
  closeAddAccount: () => void
  openEditAccount: (
    account: DisplaySiteData,
    options?: { focusSection?: AccountFormSectionId },
  ) => void
  closeEditAccount: () => void
}

export const DialogStateContext = createContext<
  DialogStateContextType | undefined
>(undefined)

export const useDialogStateContext = () => {
  const context = useContext(DialogStateContext)
  if (!context) {
    throw new Error(
      "useDialogStateContext 必须在 DialogStateProvider 中使用，并且必须提供所有必需的函数",
    )
  }
  return context
}
