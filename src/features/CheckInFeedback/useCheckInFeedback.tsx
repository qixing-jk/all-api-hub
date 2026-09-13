import { lazy, Suspense, useState } from "react"
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
  const close = () => setSource(null)
  return {
    openFeedback: (value: CheckInFeedbackSource) => setSource(value),
    feedbackDialog: source ? (
      <Suspense
        fallback={
          <Modal isOpen onClose={close} title={t("checkInFeedback.title")}>
            <Spinner />
          </Modal>
        }
      >
        <CheckInFeedbackDialog source={source} onClose={close} />
      </Suspense>
    ) : null,
  }
}
