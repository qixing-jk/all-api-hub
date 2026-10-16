import { useTranslation } from "react-i18next"

import { ContentNotice } from "~/components/toast/ContentNotice"

/**
 * Prompt shown when automatic Turnstile completion needs a real user gesture.
 */
export function TurnstileManualAssistToast({
  onDismiss,
}: {
  onDismiss: () => void
}) {
  const { t } = useTranslation("shieldBypass")

  return (
    <ContentNotice title={t("toast.turnstile.title")} onClose={onDismiss}>
      <p className="whitespace-pre-line">{t("toast.turnstile.body")}</p>
    </ContentNotice>
  )
}
