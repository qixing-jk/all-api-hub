import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Notice } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { CHECK_IN_METHOD_DETECTION_OUTCOMES } from "~/constants/checkIn"
import {
  createCheckInRedetectionFeedback,
  getCheckInMethodPresentation,
  getCheckInRedetectionFeedbackPresentation,
} from "~/features/AccountManagement/components/AccountDialog/checkin/checkInPresentation"
import toast from "~/lib/notify"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { redetectSavedAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/accountDiscovery"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { CheckInMethodId } from "~/types/checkIn"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("CheckInRedetection")

/** Shares foreground redetection, result feedback and conditional selection across account surfaces. */
export function useCheckInRedetection(
  accountId: string,
  onUpdated?: () => void | Promise<unknown>,
) {
  const { t } = useTranslation("accountDialog")
  const [isPending, setIsPending] = useState(false)
  const [choiceAccount, setChoiceAccount] = useState<SiteAccount | null>(null)
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [terminalCloseRequested, setTerminalCloseRequested] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const choosingRef = useRef(false)
  const selectionOpenRef = useRef(false)
  const activeRef = useRef(true)
  useEffect(() => {
    activeRef.current = true
    setChoiceAccount(null)
    setChoiceError(null)
    setTerminalCloseRequested(false)
    setIsPending(false)
    choosingRef.current = false
    selectionOpenRef.current = false
    return () => {
      activeRef.current = false
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [accountId])

  const refresh = async () => {
    try {
      await onUpdated?.()
    } catch (error) {
      logger.warn("Could not refresh the check-in view", {
        error: getErrorMessage(error),
      })
    }
  }
  const redetect = async (opener?: HTMLElement) => {
    if (controllerRef.current || choosingRef.current) return
    // A menu item disappears before discovery finishes. Retain its trigger as
    // the modal opener, and prevent the menu's delayed restore stealing focus.
    openerRef.current =
      opener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    const controller = new AbortController()
    controllerRef.current = controller
    setIsPending(true)
    setChoiceAccount(null)
    selectionOpenRef.current = false
    setChoiceError(null)
    setTerminalCloseRequested(false)
    try {
      const source = getCurrentTempWindowRequestSource()
      const result = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
        source,
        (protectionBypassExecution) =>
          redetectSavedAccountCheckIn(accountId, {
            tempWindowRequestSource: source,
            protectionBypassExecution,
            signal: controller.signal,
          }),
      )
      if (controller.signal.aborted) return
      if (!result) {
        toast.error(t("checkInFeedback.accountUnavailable"))
        return
      }
      if (!result.applied) {
        toast.error(t("messages.checkInRedetectChanged"))
        await refresh()
        return
      }
      if (result.requiresSelection) {
        selectionOpenRef.current = true
        setChoiceAccount(result.account)
      } else {
        const feedback = getCheckInRedetectionFeedbackPresentation(
          t,
          createCheckInRedetectionFeedback({
            config: result.account.checkIn,
            decision: result.discovery.decision,
            state: inspectAccountCheckIn({
              config: result.account.checkIn,
              siteType: result.account.site_type,
              siteUrl: result.account.site_url,
            }),
            detections: result.discovery.detections,
            saveRequired: false,
          }),
        )
        if (feedback) {
          const message = [feedback.title, feedback.description]
            .filter(Boolean)
            .join(" ")
          if (feedback.tone === "success") toast.success(message)
          else if (feedback.tone === "warning") toast.warning(message)
          else if (feedback.tone === "destructive") toast.error(message)
          else toast.info(message)
        }
      }
      await refresh()
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(
          t("messages.operationFailed", { error: getErrorMessage(error) }),
        )
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        if (activeRef.current) setIsPending(false)
      }
    }
  }
  const choose = async (methodId: CheckInMethodId) => {
    if (!choiceAccount || choosingRef.current || controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    choosingRef.current = true
    setIsPending(true)
    setChoiceError(null)
    try {
      const result = await accountCheckInState.selectDetectedCheckInMethod(
        choiceAccount,
        methodId,
      )
      if (controller.signal.aborted) return
      if (!result?.applied) {
        toast.error(t("messages.checkInRedetectChanged"))
      } else {
        toast.success(t("messages.checkInRedetectResolved"))
      }
      choosingRef.current = false
      setTerminalCloseRequested(true)
      await refresh()
    } catch (error) {
      if (!controller.signal.aborted)
        setChoiceError(
          t("messages.operationFailed", { error: getErrorMessage(error) }),
        )
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        choosingRef.current = false
        if (activeRef.current) setIsPending(false)
      }
    }
  }
  const choices = choiceAccount
    ? inspectAccountCheckIn({
        config: choiceAccount.checkIn,
        siteType: choiceAccount.site_type,
        siteUrl: choiceAccount.site_url,
      }).choices.filter(
        (choice) =>
          choice.detectionOutcome ===
          CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      )
    : []
  const close = () => {
    if (!choosingRef.current) {
      selectionOpenRef.current = false
      setChoiceAccount(null)
    }
  }
  return {
    redetect,
    isPending,
    onMenuCloseAutoFocus: (event: Event) => {
      if (selectionOpenRef.current) event.preventDefault()
    },
    selectionDialog: choiceAccount ? (
      <Modal
        isOpen
        onClose={close}
        terminalCloseKey={terminalCloseRequested ? accountId : null}
        onCloseComplete={() => {
          if (
            activeRef.current &&
            !selectionOpenRef.current &&
            !document.querySelector('[role="dialog"][data-state="open"]')
          )
            openerRef.current?.focus()
        }}
        title={t("form.checkInMethod")}
        size="sm"
        footer={
          <Button
            variant="outline"
            onClick={() => setTerminalCloseRequested(true)}
            disabled={isPending}
          >
            {t("common:actions.cancel")}
          </Button>
        }
      >
        <div className="space-y-density-3">
          <p className="text-muted-foreground text-sm">
            {choiceAccount.site_name}
          </p>
          <Notice tone="info" title={t("messages.checkInRedetectAmbiguous")} />
          {choiceError && (
            <Notice tone="destructive" title={choiceError} role="alert" />
          )}
          {choices.map(({ methodId }) => {
            const presentation = getCheckInMethodPresentation(t, methodId)
            return (
              <Button
                key={methodId}
                variant="outline"
                className="w-full"
                disabled={isPending}
                onClick={() => void choose(methodId)}
                title={presentation.disclosure ?? undefined}
              >
                {presentation.label}
              </Button>
            )
          })}
        </div>
      </Modal>
    ) : null,
  }
}
