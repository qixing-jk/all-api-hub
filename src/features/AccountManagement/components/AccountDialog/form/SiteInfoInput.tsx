import {
  CircleHelp,
  Cookie,
  Info,
  KeyRound,
  Pencil,
  TriangleAlert,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { AccountSiteUrlInput } from "~/features/AccountManagement/components/AccountDialog/form/AccountSiteUrlInput"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthPermissionRecommendation"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

type SiteInfoInputPresentationSitePolicy = Pick<
  AccountDialogSitePolicy,
  | "siteTypeLabel"
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "allowSub2ApiRefreshTokenState"
  | "lockSiteUrl"
>

interface SiteInfoInputBaseProps {
  url: string
  onUrlChange: (url: string) => void
  isDetected: boolean
  onClearUrl: () => void
  sitePolicy: SiteInfoInputPresentationSitePolicy
  // Props for "add" mode
  currentTabUrl?: string | null
  isCurrentSiteAdded?: boolean
  detectedAccount?: DisplaySiteData | null
  onUseCurrentTab?: () => void
  onEditAccount?: (account: DisplaySiteData) => void
  cookieAuthPermissionsGranted?: CookieAuthPermissionRecommendationProps["cookieAuthPermissionsGranted"]
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
}

type SiteInfoInputWithAuthSelectorProps = SiteInfoInputBaseProps & {
  showAuthTypeSelector: true
  authType: AuthTypeEnum
  onAuthTypeChange: (value: AuthTypeEnum) => void
}

type SiteInfoInputWithoutAuthSelectorProps = SiteInfoInputBaseProps & {
  showAuthTypeSelector?: false
}

type SiteInfoInputProps =
  | SiteInfoInputWithAuthSelectorProps
  | SiteInfoInputWithoutAuthSelectorProps

/**
 * Site information section displaying the URL input with contextual helpers
 * such as already-added warnings and the sub2api hint. The current-tab reuse
 * action lives inside the URL field itself.
 * @param props Component props defining field values, detection state, and callbacks.
 * @param props.url Current site URL value.
 * @param props.onUrlChange Handler updating the site URL.
 * @param props.isDetected Whether the site info was auto-detected (locks inputs when true).
 * @param props.onClearUrl Clears the URL field.
 * @param props.showAuthTypeSelector Whether to show the auth selector in the add-mode entry flow.
 * When true, authType and onAuthTypeChange are required.
 * @param props.currentTabUrl URL detected from the active browser tab.
 * @param props.isCurrentSiteAdded Indicates if the current site already exists.
 * @param props.detectedAccount Account info detected from the site.
 * @param props.onUseCurrentTab Handler to reuse the current tab URL.
 * @param props.onEditAccount Handler to edit the detected account entry.
 */
export default function SiteInfoInput(props: SiteInfoInputProps) {
  const {
    url,
    onUrlChange,
    isDetected,
    onClearUrl,
    currentTabUrl,
    isCurrentSiteAdded,
    detectedAccount,
    onUseCurrentTab,
    onEditAccount,
  } = props
  const { t } = useTranslation(["accountDialog", "common"])
  const isAuthTypeLocked = props.sitePolicy.forceAccessTokenAuth
  const canUseCookieAuth = props.sitePolicy.allowCookieAuthSession
  const canUseSub2ApiRefreshToken =
    props.sitePolicy.allowSub2ApiRefreshTokenState
  const isSiteUrlLocked = isDetected || props.sitePolicy.lockSiteUrl
  const shouldShowCookiePermissionRecommendation =
    !isDetected &&
    canUseCookieAuth &&
    props.showAuthTypeSelector === true &&
    props.authType === AuthTypeEnum.Cookie
  const authTypeHelpText = isAuthTypeLocked
    ? t("siteInfo.authMethodSelectedForSite", {
        siteType: props.sitePolicy.siteTypeLabel,
      })
    : t("siteInfo.cookieWarning")

  const handleEditClick = () => {
    if (detectedAccount && onEditAccount) {
      onEditAccount(detectedAccount)
    }
  }

  return (
    <div className="space-y-density-2">
      {!isDetected && props.showAuthTypeSelector === true ? (
        <div
          data-layout="site-auth-url-container"
          className="[container-type:inline-size]"
        >
          <div
            data-layout="site-auth-url-layout"
            className="gap-y-density-2 grid gap-x-2 [@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_auto] [@container(min-width:28rem)]:items-end"
          >
            <div
              data-layout="auth-type-field"
              className="order-1 max-w-full [@container(min-width:28rem)]:order-2"
            >
              <div className="mb-density-1 gap-y-density-1-5 flex items-center gap-x-1.5">
                <label className="text-secondary-foreground text-sm font-medium">
                  {t("siteInfo.authMethod")}
                </label>
                <Tooltip
                  content={authTypeHelpText}
                  wrapperClassName="inline-flex"
                >
                  <button
                    type="button"
                    aria-label={authTypeHelpText}
                    className="dark:text-muted-foreground text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                  >
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
              <Select
                value={props.authType}
                onValueChange={(value) =>
                  props.onAuthTypeChange(value as AuthTypeEnum)
                }
                disabled={isAuthTypeLocked}
              >
                <SelectTrigger
                  className="w-full max-w-full [@container(min-width:28rem)]:w-auto"
                  aria-label={t("siteInfo.authMethod")}
                  data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger}
                  data-auth-type={props.authType}
                >
                  <SelectValue
                    placeholder={t("siteInfo.authMethodPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent align="end" className="min-w-48">
                  <SelectItem value={AuthTypeEnum.AccessToken}>
                    <div className="gap-y-density-2 flex items-center gap-x-2">
                      <KeyRound className="h-4 w-4" />
                      <span>{t("siteInfo.authType.accessToken")}</span>
                    </div>
                  </SelectItem>
                  {canUseCookieAuth && (
                    <SelectItem value={AuthTypeEnum.Cookie}>
                      <div className="gap-y-density-2 flex items-center gap-x-2">
                        <Cookie className="h-4 w-4" />
                        <span>{t("siteInfo.authType.cookieAuth")}</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div
              data-layout="site-url-field"
              className="order-2 w-full min-w-0 [@container(min-width:28rem)]:order-1"
            >
              <label
                htmlFor="site-url"
                className="text-secondary-foreground mb-density-1 block text-sm font-medium"
              >
                {t("siteInfo.siteUrl")}
              </label>
              <AccountSiteUrlInput
                url={url}
                onUrlChange={onUrlChange}
                onClearUrl={onClearUrl}
                disabled={isSiteUrlLocked}
                enableRecentTabs={
                  !isSiteUrlLocked && !!onUseCurrentTab && !currentTabUrl
                }
                currentTabUrl={currentTabUrl}
                onUseCurrentTab={onUseCurrentTab}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor="site-url"
            className="text-secondary-foreground block text-sm font-medium"
          >
            {t("siteInfo.siteUrl")}
          </label>
          <div className="relative grow">
            <AccountSiteUrlInput
              url={url}
              onUrlChange={onUrlChange}
              onClearUrl={onClearUrl}
              disabled={isSiteUrlLocked}
              enableRecentTabs={
                !isSiteUrlLocked && !!onUseCurrentTab && !currentTabUrl
              }
              currentTabUrl={currentTabUrl}
              onUseCurrentTab={onUseCurrentTab}
            />
          </div>
        </>
      )}
      <div className="gap-y-density-2 flex flex-col justify-between text-xs">
        {shouldShowCookiePermissionRecommendation && (
          <CookieAuthPermissionRecommendation
            cookieAuthPermissionsGranted={props.cookieAuthPermissionsGranted}
            isRequestingCookieAuthPermissions={
              props.isRequestingCookieAuthPermissions
            }
            onRequestCookieAuthPermissions={
              props.onRequestCookieAuthPermissions
            }
          />
        )}
        {canUseSub2ApiRefreshToken && (
          <div className="bg-primary-soft text-primary-soft-foreground gap-y-density-2 py-density-2 flex w-full items-start gap-x-2 rounded-md px-2 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("siteInfo.sub2apiHint")}</span>
          </div>
        )}
        {isCurrentSiteAdded && (
          <div className="bg-warning-soft text-warning-soft-foreground py-density-2 flex w-full items-center justify-between rounded-md px-2 text-xs">
            <div className="flex items-center">
              <TriangleAlert className="mr-1.5 h-4 w-4 shrink-0" />
              {/* Distinguish "site exists" vs "current login matches an existing account" for multi-account sites. */}
              <span>
                {detectedAccount
                  ? t("siteInfo.currentLoginAlreadyAdded")
                  : t("siteInfo.alreadyAdded")}
              </span>
            </div>
            {detectedAccount && onEditAccount && (
              <Button
                type="button"
                onClick={handleEditClick}
                variant="outline"
                size="sm"
                leftIcon={<Pencil className="h-3 w-3" />}
              >
                {t("siteInfo.editNow")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
