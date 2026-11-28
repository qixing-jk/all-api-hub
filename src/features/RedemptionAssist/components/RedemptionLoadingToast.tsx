import { LoaderCircle } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"

import { ContentNotice } from "~/components/toast/ContentNotice"

interface RedemptionLoadingToastProps {
  message: string
}

export const RedemptionLoadingToast: React.FC<RedemptionLoadingToastProps> = ({
  message,
}) => {
  const { t } = useTranslation("redemptionAssist")
  return (
    <ContentNotice
      title={t("messages.promptTitle")}
      icon={LoaderCircle}
      aria-busy="true"
    >
      <p>{message}</p>
    </ContentNotice>
  )
}
