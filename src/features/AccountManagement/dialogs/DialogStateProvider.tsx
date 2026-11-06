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
import type { AccountFormSectionId } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useAccountDialogRecoveryReceiver } from "~/features/AccountManagement/dialogs/useAccountDialogRecoveryReceiver"
import {
  DialogActionsContext,
  DialogStateContext,
  type DialogAccountActions,
  type DialogOptions,
} from "~/features/AccountManagement/dialogs/useDialogStateContext"
import { isAddAccountPrefill } from "~/features/AccountManagement/sponsors/addAccountPrefill"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { UI_HANDOFF_RECEIVE_RESULTS } from "~/hooks/useUiHandoffReceiver"
import type { DisplaySiteData } from "~/types"

interface DialogState {
  isMounted: boolean
  sessionId: number
  isOpen: boolean
  mode: DialogMode
  account: DisplaySiteData | null
  prefill: AddAccountPrefill | null
  recoveryState?: AccountDialogRecoveryState | null
  focusSection?: AccountFormSectionId
}

export const DialogStateProvider = ({
  children,
  initialRecoveryId,
}: {
  children: ReactNode
  initialRecoveryId?: string
}) => {
  const { loadAccountData, displayData, isInitialLoad } =
    useAccountDataContext()
  const [dialogState, setDialogState] = useState<DialogState>({
    isMounted: false,
    sessionId: 0,
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
      setDialogState((prev) => ({
        isMounted: true,
        sessionId: prev.sessionId + 1,
        isOpen: true,
        mode: options.mode,
        account: options.account || null,
        prefill: options.prefill ?? null,
        recoveryState: options.recoveryState ?? null,
        focusSection: options.focusSection,
      }))
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

  const handleSuccess = (data: unknown) => {
    promiseRef.current?.resolve(data)
    handleClose()
  }

  const handleError = () => {
    // The save workflow already displays the failure. Keep the same editable
    // draft and its pending result so correcting a credential can still succeed.
    // Only explicit dismissal or a successful save closes this dialog.
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
    (
      account: DisplaySiteData,
      options?: { focusSection?: AccountFormSectionId },
    ) =>
      openAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        ...(options?.focusSection
          ? { focusSection: options.focusSection }
          : {}),
      }),
    [openAccountDialog],
  )
  const closeEditAccount = useCallback(handleClose, [loadAccountData])

  const actionsValue = useMemo<DialogAccountActions>(
    () => ({
      openAccountDialog,
      openAddAccount,
      closeAddAccount,
      openEditAccount,
      closeEditAccount,
    }),
    [
      openAccountDialog,
      openAddAccount,
      closeAddAccount,
      openEditAccount,
      closeEditAccount,
    ],
  )

  const value = useMemo(
    () => ({
      ...actionsValue,
      isAddAccountOpen,
      isEditAccountOpen,
      editingAccount,
    }),
    [actionsValue, isAddAccountOpen, isEditAccountOpen, editingAccount],
  )

  return (
    <DialogActionsContext.Provider value={actionsValue}>
      <DialogStateContext.Provider value={value}>
        {children}
        {dialogState.isMounted && (
          <AccountDialog
            key={dialogState.sessionId}
            isOpen={dialogState.isOpen}
            onClose={handleClose}
            onCloseComplete={() => {
              // A delayed completion from a previous session must not remove a
              // replacement dialog, even when the replacement is already closing.
              setDialogState((prev) =>
                prev.sessionId === dialogState.sessionId && !prev.isOpen
                  ? { ...prev, isMounted: false }
                  : prev,
              )
            }}
            mode={dialogState.mode}
            account={dialogState.account}
            prefill={dialogState.prefill}
            recoveryState={dialogState.recoveryState}
            focusSection={dialogState.focusSection}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        )}
      </DialogStateContext.Provider>
    </DialogActionsContext.Provider>
  )
}
