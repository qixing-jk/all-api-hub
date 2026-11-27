import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { FormField } from "~/components/ui"
import { AuthTypeEnum } from "~/types"

import { AccountAuthTypeSelect } from "./AccountAuthTypeSelect"
import type { AccountDialogSitePolicy } from "./sitePolicy"
import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

/** Auth-method selection and site-specific guidance in the full account editor. */
export function AccountAuthMethodField({
  continuous,
  authType,
  sitePolicy,
  isDetected,
  onAuthTypeChange,
  validation,
  feedback,
}: {
  continuous?: boolean
  authType: AuthTypeEnum
  sitePolicy: Pick<
    AccountDialogSitePolicy,
    | "siteTypeLabel"
    | "forceAccessTokenAuth"
    | "allowCookieAuthSession"
    | "usesBrowserCookieSession"
  >
  isDetected: boolean
  onAuthTypeChange: (value: AuthTypeEnum) => void
  validation: AccountFormFieldAttributes
  feedback: ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const isAuthTypeLocked = sitePolicy.forceAccessTokenAuth
  return (
    <FormField
      label={
        continuous &&
        !isAuthTypeLocked &&
        !sitePolicy.usesBrowserCookieSession ? (
          <span className="inline-flex items-center gap-1.5">
            {t("siteInfo.authMethod")}
            <Tooltip
              content={t("siteInfo.cookieWarning")}
              wrapperClassName="inline-flex"
              positionStrategy="fixed"
              className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
            >
              <button
                type="button"
                aria-label={t("siteInfo.cookieWarning")}
                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <HelpHintIcon className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          </span>
        ) : (
          t("siteInfo.authMethod")
        )
      }
      className={
        continuous && authType === AuthTypeEnum.Cookie
          ? "sm:max-w-sm"
          : undefined
      }
      description={
        continuous && authType === AuthTypeEnum.Cookie
          ? undefined
          : isAuthTypeLocked
            ? t("siteInfo.authMethodSelectedForSite", {
                siteType: sitePolicy.siteTypeLabel,
              })
            : sitePolicy.usesBrowserCookieSession &&
                authType === AuthTypeEnum.Cookie
              ? t("siteInfo.browserCookieSession")
              : continuous
                ? undefined
                : t("siteInfo.cookieWarning")
      }
    >
      <AccountAuthTypeSelect
        value={authType}
        onChange={onAuthTypeChange}
        disabled={isDetected || isAuthTypeLocked}
        allowCookie={sitePolicy.allowCookieAuthSession}
        triggerClassName="w-full"
        validation={validation}
      />
      {feedback}
    </FormField>
  )
}
