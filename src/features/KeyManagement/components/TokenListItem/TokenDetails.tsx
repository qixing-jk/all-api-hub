import { useTranslation } from "react-i18next"

import { BodySmall } from "~/components/ui"
import type { ApiToken } from "~/types"
import { formatKeyTime } from "~/utils/core/formatters"

import { formatQuota } from "../../utils"

interface TokenDetailsProps {
  /**
   * Token data to display including quotas and timestamps.
   */
  token: ApiToken
}

/**
 * Shows key quota and timing metadata in a compact grid.
 * @param props Component props container.
 * @param props.token Token data source with quotas and times.
 */
export function TokenDetails({ token }: TokenDetailsProps) {
  const { t } = useTranslation("keyManagement")
  return (
    <div className="xs:grid-cols-2 grid grid-cols-1 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
        <BodySmall
          as="span"
          className="dark:text-dark-text-tertiary shrink-0 text-gray-500"
        >
          {t("keyDetails.remainingQuota")}
        </BodySmall>
        <span className="dark:text-dark-text-primary min-w-0 font-medium break-words text-gray-900">
          {formatQuota(token.remain_quota, token.unlimited_quota)}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
        <BodySmall
          as="span"
          className="dark:text-dark-text-tertiary shrink-0 text-gray-500"
        >
          {t("keyDetails.usedQuota")}
        </BodySmall>
        <span className="dark:text-dark-text-primary min-w-0 font-medium break-words text-gray-900">
          {formatQuota(token.used_quota, false)}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
        <BodySmall
          as="span"
          className="dark:text-dark-text-tertiary shrink-0 text-gray-500"
        >
          {t("keyDetails.expireTime")}
        </BodySmall>
        <span className="dark:text-dark-text-primary min-w-0 font-medium break-words text-gray-900">
          {formatKeyTime(token.expired_time)}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
        <BodySmall
          as="span"
          className="dark:text-dark-text-tertiary shrink-0 text-gray-500"
        >
          {t("keyDetails.createTime")}
        </BodySmall>
        <span className="dark:text-dark-text-primary min-w-0 font-medium break-words text-gray-900">
          {formatKeyTime(token.created_time)}
        </span>
      </div>
    </div>
  )
}
