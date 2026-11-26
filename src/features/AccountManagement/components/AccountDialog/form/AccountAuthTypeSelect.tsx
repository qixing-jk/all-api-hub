import { Cookie, KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum } from "~/types"

import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

/** Authentication options shared by site entry and the full account editor. */
export function AccountAuthTypeSelect({
  value,
  onChange,
  disabled,
  allowCookie,
  triggerClassName,
  validation,
}: {
  value: AuthTypeEnum
  onChange: (value: AuthTypeEnum) => void
  disabled: boolean
  allowCookie: boolean
  triggerClassName: string
  validation?: AccountFormFieldAttributes
}) {
  const { t } = useTranslation("accountDialog")

  return (
    <Select
      value={value}
      onValueChange={(value) => onChange(value as AuthTypeEnum)}
      disabled={disabled}
    >
      <SelectTrigger
        className={triggerClassName}
        aria-label={t("siteInfo.authMethod")}
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger}
        {...validation}
        data-auth-type={value}
      >
        <SelectValue placeholder={t("siteInfo.authMethodPlaceholder")} />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-48">
        <SelectItem value={AuthTypeEnum.AccessToken}>
          <div className="flex items-center gap-x-2 gap-y-density-2">
            <KeyRound className="h-4 w-4" />
            <span>{t("siteInfo.authType.accessToken")}</span>
          </div>
        </SelectItem>
        {allowCookie && (
          <SelectItem value={AuthTypeEnum.Cookie}>
            <div className="flex items-center gap-x-2 gap-y-density-2">
              <Cookie className="h-4 w-4" />
              <span>{t("siteInfo.authType.cookieAuth")}</span>
            </div>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
