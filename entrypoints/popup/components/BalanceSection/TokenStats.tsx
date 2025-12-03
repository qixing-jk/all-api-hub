import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { BodySmall } from "~/components/ui"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { formatTokenCount } from "~/utils/formatters"

export const TokenStats = React.memo(() => {
  const { t } = useTranslation("account")
  const { stats } = useAccountDataContext()
  const todayTokens = stats
  const todayTotalPromptTokens = todayTokens.today_total_prompt_tokens
  const todayTotalCompletionTokens = todayTokens.today_total_completion_tokens

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div>
            {t("stats.prompt")}: {todayTotalPromptTokens.toLocaleString()}{" "}
            {t("common:labels.token")}
          </div>
          <div>
            {t("stats.completion")}:{" "}
            {todayTotalCompletionTokens.toLocaleString()}{" "}
            {t("common:labels.token")}
          </div>
        </div>
      }
    >
      <div className="flex cursor-help items-center gap-3">
        <div className="flex items-center gap-1">
          <ArrowUpIcon className="h-4 w-4 text-green-500" />
          <BodySmall weight="medium">
            {formatTokenCount(todayTokens.today_total_prompt_tokens)}
          </BodySmall>
        </div>
        <div className="flex items-center gap-1">
          <ArrowDownIcon className="h-4 w-4 text-blue-500" />
          <BodySmall weight="medium">
            {formatTokenCount(todayTokens.today_total_completion_tokens)}
          </BodySmall>
        </div>
      </div>
    </Tooltip>
  )
})
