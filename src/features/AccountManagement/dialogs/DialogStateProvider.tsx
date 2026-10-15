import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import AccountDialog from "~/features/AccountManagement/components/AccountDialog"
import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useAccountDialogRecoveryReceiver } from "~/features/AccountManagement/dialogs/useAccountDialogRecoveryReceiver"
import {
  DialogStateContext,
  type DialogOptions,
} from "~/features/AccountManagement/dialogs/useDialogStateContext"
import { isAddAccountPrefill } from "~/features/AccountManagement/sponsors/addAccountPrefill"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { UI_HANDOFF_RECEIVE_RESULTS } from "~/hooks/useUiHandoffReceiver"
import type { DisplaySiteData } from "~/types"

interface DialogState {
  isOpen: boolean
  mode: DialogMode
  account: DisplaySiteData | null
  prefill: AddAccountPrefill | null
  recoveryState?: AccountDialogRecoveryState | null
}

export const DialogStateProvider = ({
  children,
  onOpenBookmarkImport,
  initialRecoveryId,
}: {
  children: ReactNode
  onOpenBookmarkImport?: () => void
  initialRecoveryId?: string
}) => {
  const { loadAccountData, displayData, isInitialLoad } =
    useAccountDataContext()
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: DIALOG_MODES.ADD,
    account: null,
    prefill: null,
  })

  const promiseRef = useRef<{
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
  } | null>(null)

  const openAccountDialog = useCallback((options: DialogOptions) => {
    return new Promise<unknown>((resolve, reject) => {
      setDialogState({
        isOpen: true,
        mode: options.mode,
        account: options.account || null,
        prefill: options.prefill ?? null,
        recoveryState: options.recoveryState ?? null,
      })
      promiseRef.current = { resolve, reject }
    })
  }, [])

  const receiveRecovery = useCallback(
    (recoveryState: AccountDialogRecoveryState) => {
      if (dialogState.isOpen) return UI_HANDOFF_RECEIVE_RESULTS.Busy
      const account = recoveryState.accountId
        ? displayData?.find(
            (candidate) => candidate.id === recoveryState.accountId,
          )
        : undefined
      if (recoveryState.accountId && !account)
        return UI_HANDOFF_RECEIVE_RESULTS.Unavailable
      void openAccountDialog({
        mode: account ? DIALOG_MODES.EDIT : DIALOG_MODES.ADD,
        account,
        recoveryState,
      })
      return UI_HANDOFF_RECEIVE_RESULTS.Accepted
    },
    [dialogState.isOpen, displayData, openAccountDialog],
  )

  useAccountDialogRecoveryReceiver({
    enabled: !isInitialLoad,
    initialRecoveryId,
    onReceive: receiveRecovery,
  })

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }))
    loadAccountData()
  }

  const handleOpenBookmarkImport = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }))
    onOpenBookmarkImport?.()
  }, [onOpenBookmarkImport])

  const handleSuccess = (data: unknown) => {
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
        prefillOrEvent && isAddAccountPrefill(prefillOrEvent)
          ? prefillOrEvent
          : null

      openAccountDialog({ mode: DIALOG_MODES.ADD, prefill })
    },
    [openAccountDialog],
  )

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
          recoveryState={dialogState.recoveryState}
          onSuccess={handleSuccess}
          onError={handleError}
          onOpenBookmarkImport={handleOpenBookmarkImport}
        />
      )}
    </DialogStateContext.Provider>
  )
}
