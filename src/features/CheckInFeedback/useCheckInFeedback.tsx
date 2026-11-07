import { lazy, Suspense, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Spinner } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import type { AuthConfig } from "~/services/apiTransport/type"
import type { CheckInFeedbackSnapshot } from "~/services/checkin/feedback/report"

const CheckInFeedbackDialog = lazy(() => import("./CheckInFeedbackDialog"))

export type CheckInFeedbackSource =
  | { accountId: string; execution?: CheckInFeedbackSnapshot["execution"] }
  | { snapshot: CheckInFeedbackSnapshot; auth?: AuthConfig; accountId?: string }

/** Shares one lazy feedback workflow across menus, account forms and result rows. */
export function useCheckInFeedback() {
  const { t } = useTranslation("accountDialog")
  const [source, setSource] = useState<CheckInFeedbackSource | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const sessionRef = useRef(0)
  const sessionId = sessionRef.current
  const close = () => {
    if (sessionId === sessionRef.current) setIsOpen(false)
  }
  const completeClose = () => {
    if (sessionId === sessionRef.current) setSource(null)
  }
  return {
    openFeedback: (value: CheckInFeedbackSource) => {
      sessionRef.current += 1
      setSource(value)
      setIsOpen(true)
    },
    feedbackDialog: source ? (
      <Suspense
        key={sessionId}
        fallback={
          <Modal
            isOpen={isOpen}
            onClose={close}
            onCloseComplete={completeClose}
            title={t("checkInFeedback.title")}
          >
            <Spinner />
          </Modal>
        }
      >
        <CheckInFeedbackDialog
          source={source}
          isOpen={isOpen}
          onClose={close}
          onCloseComplete={completeClose}
        />
      </Suspense>
    ) : null,
  }
}
