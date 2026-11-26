import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type {
  AccountDialogRecoveryAction,
  AccountDialogRecoveryState,
} from "~/features/AccountManagement/components/AccountDialog/models"
import {
  canUseAccountDialogRecoverySidePanel,
  discardAccountDialogRecovery,
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
  type PreparedAccountDialogRecovery,
} from "~/features/AccountManagement/dialogs/accountDialogRecovery"
import { closeIfPopup } from "~/utils/navigation/popup"

export interface AccountRecoveryContinuation {
  onContinue: (action?: AccountDialogRecoveryAction) => void
  isPending: boolean
  isOpening?: boolean
  pendingAction?: AccountDialogRecoveryAction
  sidePanelSupported: boolean
  disabled?: boolean
  errorMessage?: string | null
}

/** Keeps a popup form ready before the user invokes the native sidebar API. */
export function useAccountDialogRecoveryHandoff({
  enabled,
  state,
}: {
  enabled: boolean
  state: AccountDialogRecoveryState | null
}): AccountRecoveryContinuation | undefined {
  const { t } = useTranslation("accountDialog")
  const queue = useRef<Promise<PreparedAccountDialogRecovery | null>>(
    Promise.resolve(null),
  )
  const handoffStarted = useRef(false)
  const [prepared, setPrepared] = useState<{
    state: AccountDialogRecoveryState
    handle: PreparedAccountDialogRecovery
  } | null>(null)
  const [failure, setFailure] = useState<{
    state: AccountDialogRecoveryState
    preparation: boolean
  } | null>(null)
  const [handoff, setHandoff] = useState<{
    action?: AccountDialogRecoveryAction
  } | null>(null)
  const opening = handoff !== null

  useEffect(() => {
    if (
      !enabled ||
      !state ||
      prepared?.state === state ||
      opening ||
      handoffStarted.current
    )
      return
    let cancelled = false
    const preparation = queue.current.then((previous) =>
      prepareAccountDialogRecovery(state, previous),
    )
    queue.current = preparation.catch(() => null)
    void preparation.then(
      (handle) => {
        if (!cancelled) {
          setPrepared({ state, handle })
          setFailure(null)
        }
      },
      () => {
        if (!cancelled) setFailure({ state, preparation: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, opening, prepared, state])

  useEffect(
    () => () => {
      if (handoffStarted.current) return
      void queue.current
        .then((handle) => {
          if (handle) return discardAccountDialogRecovery(handle.id)
        })
        .catch(() => {})
    },
    [],
  )

  if (!enabled || !state) return undefined
  const ready = prepared?.state === state
  const currentFailure = failure?.state === state ? failure : null

  const triggerContinue = (action?: AccountDialogRecoveryAction) => {
    if (!ready || opening || handoffStarted.current) return
    handoffStarted.current = true
    setHandoff({ action })
    setFailure(null)
    // Starts synchronously in the click handler; the form is already staged.
    const openingHandoff = action
      ? openAccountDialogRecovery(prepared.handle, { recoveryAction: action })
      : openAccountDialogRecovery(prepared.handle)
    void openingHandoff
      .then(
        () => closeIfPopup(),
        () => {
          handoffStarted.current = false
          setFailure({ state, preparation: false })
        },
      )
      .finally(() => setHandoff(null))
  }

  return {
    sidePanelSupported: canUseAccountDialogRecoverySidePanel(),
    isPending: opening || (!ready && !currentFailure),
    isOpening: opening,
    pendingAction: handoff?.action,
    disabled: !ready,
    errorMessage: currentFailure
      ? currentFailure.preparation
        ? t("accessTokenVerification.prepareFailed")
        : t("accessTokenVerification.continueFailed")
      : null,
    onContinue: triggerContinue,
  }
}
