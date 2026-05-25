import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import AccountDialog from "~/features/AccountManagement/components/AccountDialog"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  getAndClearPendingSponsorAddAccountPrefill,
  isSponsorAddAccountPrefill,
  watchPendingSponsorAddAccountPrefill,
} from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import type { DisplaySiteData } from "~/types"
import { isExtensionSidePanel } from "~/utils/browser"

interface DialogOptions {
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
}

interface DialogState {
  isOpen: boolean
  mode: DialogMode
  account: DisplaySiteData | null
  prefill: AddAccountPrefill | null
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
  openEditAccount: (account: DisplaySiteData) => void
  closeEditAccount: () => void
}

const DialogStateContext = createContext<DialogStateContextType | undefined>(
  undefined,
)

export const DialogStateProvider = ({ children }: { children: ReactNode }) => {
  const { loadAccountData } = useAccountDataContext()
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: DIALOG_MODES.ADD,
    account: null,
    prefill: null,
  })

  const promiseRef = useRef<{
    resolve: (value: any) => void
    reject: (reason?: any) => void
  } | null>(null)

  const openAccountDialog = useCallback((options: DialogOptions) => {
    return new Promise((resolve, reject) => {
      setDialogState({
        isOpen: true,
        mode: options.mode,
        account: options.account || null,
        prefill: options.prefill ?? null,
      })
      promiseRef.current = { resolve, reject }
    })
  }, [])

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }))
    loadAccountData()
  }

  const handleSuccess = (data: any) => {
    promiseRef.current?.resolve(data)
    handleClose()
  }

  const handleError = (error: Error) => {
    promiseRef.current?.reject(error)
    handleClose()
  }

  // For backward compatibility
  const isAddAccountOpen =
    dialogState.isOpen && dialogState.mode === DIALOG_MODES.ADD
  const isEditAccountOpen =
    dialogState.isOpen && dialogState.mode === DIALOG_MODES.EDIT
  const editingAccount = dialogState.account

  const openAddAccount = useCallback(
    (prefillOrEvent?: AddAccountPrefill | MouseEvent | null) => {
      const prefill =
        prefillOrEvent && isSponsorAddAccountPrefill(prefillOrEvent)
          ? prefillOrEvent
          : null

      openAccountDialog({ mode: DIALOG_MODES.ADD, prefill })
    },
    [openAccountDialog],
  )

  useEffect(() => {
    if (!isExtensionSidePanel()) return

    let cancelled = false

    const consumePendingPrefill = () => {
      void getAndClearPendingSponsorAddAccountPrefill().then((prefill) => {
        if (cancelled || !prefill) return

        openAccountDialog({ mode: DIALOG_MODES.ADD, prefill })
      })
    }

    consumePendingPrefill()
    const stopWatchingPendingPrefill = watchPendingSponsorAddAccountPrefill(
      consumePendingPrefill,
    )

    return () => {
      cancelled = true
      stopWatchingPendingPrefill()
    }
  }, [openAccountDialog])

  const closeAddAccount = useCallback(handleClose, [loadAccountData])
  const openEditAccount = useCallback(
    (account: DisplaySiteData) =>
      openAccountDialog({ mode: DIALOG_MODES.EDIT, account }),
    [openAccountDialog],
  )
  const closeEditAccount = useCallback(handleClose, [loadAccountData])

  const value = useMemo(
    () => ({
      openAccountDialog,
      isAddAccountOpen,
      isEditAccountOpen,
      editingAccount,
      openAddAccount,
      closeAddAccount,
      openEditAccount,
      closeEditAccount,
    }),
    [
      openAccountDialog,
      isAddAccountOpen,
      isEditAccountOpen,
      editingAccount,
      openAddAccount,
      closeAddAccount,
      openEditAccount,
      closeEditAccount,
    ],
  )

  return (
    <DialogStateContext.Provider value={value}>
      {children}
      {dialogState.isOpen && (
        <AccountDialog
          isOpen={dialogState.isOpen}
          onClose={handleClose}
          mode={dialogState.mode}
          account={dialogState.account}
          prefill={dialogState.prefill}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}
    </DialogStateContext.Provider>
  )
}

export const useDialogStateContext = () => {
  const context = useContext(DialogStateContext)
  if (!context) {
    throw new Error(
      "useDialogStateContext 必须在 DialogStateProvider 中使用，并且必须提供所有必需的函数",
    )
  }
  return context
}
