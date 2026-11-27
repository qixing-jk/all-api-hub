import { Download } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Alert, Button, FormField, Textarea } from "~/components/ui"
import type { AccountSiteType } from "~/constants/siteType"

import { AccountCookieVerification } from "./AccountCookieVerification"
import { CookieAuthCompatibilityHint } from "./CookieAuthCompatibilityHint"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "./CookieAuthPermissionRecommendation"
import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

type CookieVerificationProps = ComponentProps<typeof AccountCookieVerification>

/** Renders the website session cookie, permission actions, and verification. */
export function AccountCookieField({
  siteType,
  siteUrl,
  userId,
  continuous,
  usesBrowserCookieSession,
  supportsValidation,
  cookieAuthSessionCookie,
  onCookieAuthSessionCookieChange,
  hasAccessToken,
  isImportingCookies,
  onImportCookieAuthSessionCookie,
  permissionProps,
  showCookiePermissionWarning,
  onOpenCookiePermissionSettings,
  supportsCookieRecovery,
  cookieRecoveryAction,
  recovery,
  recoveryPending,
  verifiedCookie,
  validationAttributes,
  validationFeedback,
}: {
  siteType: AccountSiteType
  siteUrl?: string
  userId: string
  continuous: boolean
  usesBrowserCookieSession?: boolean
  supportsValidation: boolean
  cookieAuthSessionCookie: string
  onCookieAuthSessionCookieChange: (cookie: string) => void
  hasAccessToken: boolean
  isImportingCookies: boolean
  onImportCookieAuthSessionCookie: () => void
  permissionProps: CookieAuthPermissionRecommendationProps
  showCookiePermissionWarning: boolean
  onOpenCookiePermissionSettings: () => void
  supportsCookieRecovery: boolean
  cookieRecoveryAction: ReactNode
  recovery?: CookieVerificationProps["recovery"]
  recoveryPending?: boolean
  verifiedCookie?: CookieVerificationProps["verifiedCookie"]
  validationAttributes: AccountFormFieldAttributes
  validationFeedback: ReactNode
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  const cookieImportButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onImportCookieAuthSessionCookie}
      loading={isImportingCookies}
      disabled={recoveryPending}
      leftIcon={<Download className="h-4 w-4" />}
      className="shrink-0"
      aria-label={
        isImportingCookies
          ? t("messages.importCookiesLoading")
          : t("form.importCookieAuthSessionCookie")
      }
    >
      <span className="sm:hidden">{t("common:actions.import")}</span>
      <span className="hidden sm:inline">
        {isImportingCookies
          ? t("messages.importCookiesLoading")
          : t("form.importCookieAuthSessionCookie")}
      </span>
    </Button>
  )
  const cookieFieldActions = supportsValidation ? (
    <>
      <Tooltip
        anchorAsChild
        positionStrategy="fixed"
        content={t("form.cookieAuthSessionCookieHelpDesc")}
        className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
      >
        <button
          type="button"
          aria-label={t("form.cookieAuthSessionCookieHelp")}
          className="mr-auto inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpHintIcon className="size-4" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip
        anchorAsChild
        positionStrategy="fixed"
        content={t("form.importCookieAuthSessionCookieHint")}
        className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
      >
        {cookieImportButton}
      </Tooltip>
    </>
  ) : (
    cookieImportButton
  )
  return (
    <FormField
      className={continuous ? "col-span-full" : undefined}
      label={t("form.cookieAuthSessionCookie")}
      labelAction={cookieFieldActions}
      htmlFor="account-session-cookie"
      description={
        usesBrowserCookieSession
          ? t("siteInfo.browserCookieSession")
          : undefined
      }
      required={!usesBrowserCookieSession}
    >
      <div className="space-y-density-2">
        <CookieAuthPermissionRecommendation compact {...permissionProps} />
        {showCookiePermissionWarning && (
          <Alert
            variant="warning"
            description={t("messages.importCookiesPermissionDenied")}
          >
            <div className="pt-density-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenCookiePermissionSettings}
              >
                {t("form.cookiePermissionHelpAction")}
              </Button>
            </div>
          </Alert>
        )}
        <div
          role="group"
          aria-label={t("form.cookieAuthSessionCookie")}
          className={
            supportsValidation
              ? "overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring"
              : undefined
          }
        >
          <Textarea
            id="account-session-cookie"
            {...validationAttributes}
            className={
              supportsValidation
                ? "rounded-none border-0 font-mono leading-relaxed focus:ring-0"
                : "font-mono leading-relaxed"
            }
            value={cookieAuthSessionCookie}
            onChange={(e) => onCookieAuthSessionCookieChange(e.target.value)}
            placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
            rows={2}
            required={!usesBrowserCookieSession}
          />
          {supportsValidation && (
            <AccountCookieVerification
              siteType={siteType}
              siteUrl={siteUrl ?? ""}
              userId={userId}
              cookie={cookieAuthSessionCookie}
              verifiedCookie={verifiedCookie}
              busy={isImportingCookies}
              recovery={recovery}
            />
          )}
        </div>
        <CookieAuthCompatibilityHint
          hasAccessToken={hasAccessToken}
          description={
            usesBrowserCookieSession || supportsValidation
              ? undefined
              : t("form.cookieAuthSessionCookieDesc")
          }
          supportsValidation={supportsValidation}
          recovery={supportsCookieRecovery}
          recoveryAction={cookieRecoveryAction}
        />
      </div>
      {validationFeedback}
    </FormField>
  )
}
