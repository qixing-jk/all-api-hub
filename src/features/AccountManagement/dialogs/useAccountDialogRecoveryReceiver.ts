import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  getPendingAccountDialogRecovery,
  receiveAccountDialogRecovery,
  watchPendingAccountDialogRecovery,
} from "~/features/AccountManagement/dialogs/accountDialogRecovery"
import {
  UI_HANDOFF_RECEIVE_RESULTS,
  useUiHandoffReceiver,
  type UiHandoffFailureReason,
  type UiHandoffReceiveResult,
} from "~/hooks/useUiHandoffReceiver"
import toast from "~/lib/notify"
import { isExtensionSidePanel } from "~/utils/browser"

const channel = {
  getPending: getPendingAccountDialogRecovery,
  receive: receiveAccountDialogRecovery,
  watchPending: watchPendingAccountDialogRecovery,
}

/** Account-specific acceptance and feedback over the shared handoff lifecycle. */
export function useAccountDialogRecoveryReceiver({
  enabled,
  initialRecoveryId,
  onReceive,
}: {
  enabled: boolean
  initialRecoveryId?: string
  onReceive: (state: AccountDialogRecoveryState) => UiHandoffReceiveResult
}) {
  const { t } = useTranslation("accountDialog")
  const onFailure = useCallback(
    (reason: UiHandoffFailureReason) => {
      toast.error(
        reason === UI_HANDOFF_RECEIVE_RESULTS.Busy
          ? t("accessTokenVerification.destinationBusy")
          : t("accessTokenVerification.restoreFailed"),
      )
    },
    [t],
  )
  useUiHandoffReceiver({
    enabled: enabled && Boolean(initialRecoveryId || isExtensionSidePanel()),
    initialId: initialRecoveryId,
    channel,
    onReceive,
    onFailure,
  })
}
