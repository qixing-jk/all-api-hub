import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  discardAccountDialogRecovery,
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
  type PreparedAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import type { AccessTokenContinuationAction } from "~/features/AccountManagement/components/AccountDialog/AccessTokenVerificationGuide"
import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import { closeIfPopup } from "~/utils/navigation"

/** Keeps a popup form ready before the user invokes the native sidebar API. */
export function useAccountDialogRecoveryHandoff({
  enabled,
  state,
}: {
  enabled: boolean
  state: AccountDialogRecoveryState | null
}): AccessTokenContinuationAction | undefined {
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
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    if (!enabled || !state) return
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
  }, [enabled, state])

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

  return {
    sidePanelSupported: getSidePanelSupport().supported,
    isPending: opening || (!ready && !currentFailure),
    disabled: !ready,
    errorMessage: currentFailure
      ? currentFailure.preparation
        ? t("accessTokenVerification.prepareFailed")
        : t("accessTokenVerification.continueFailed")
      : null,
    onContinue: () => {
      if (!ready || opening || handoffStarted.current) return
      handoffStarted.current = true
      setOpening(true)
      setFailure(null)
      // Starts synchronously in the click handler; the form is already staged.
      void openAccountDialogRecovery(prepared.handle)
        .then(
          () => closeIfPopup(),
          () => {
            handoffStarted.current = false
            setFailure({ state, preparation: false })
          },
        )
        .finally(() => setOpening(false))
    },
  }
}
