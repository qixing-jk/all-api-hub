import { useTranslation } from "react-i18next"

import { ApiCheckModal } from "~/features/WebAiApiCheck/content/modal/ApiCheckModal"
import { useApiCheckModalViewModel } from "~/features/WebAiApiCheck/content/modal/useApiCheckModalViewModel"

/**
 * Always-mounted modal host rendered inside the content-script Shadow DOM root.
 */
export function ApiCheckModalHost() {
  const { t } = useTranslation(["webAiApiCheck", "common", "aiApiVerification"])
  const modal = useApiCheckModalViewModel()

  return (
    <ApiCheckModal
      t={t}
      view={modal.view}
      actions={modal.actions}
      refs={modal.refs}
    />
  )
}
