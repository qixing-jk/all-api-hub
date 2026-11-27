import { Pencil, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { AccountSiteUrlInput } from "~/features/AccountManagement/components/AccountDialog/form/AccountSiteUrlInput"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthPermissionRecommendation"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

import { AccountAuthTypeSelect } from "./AccountAuthTypeSelect"

type SiteInfoInputPresentationSitePolicy = Pick<
  AccountDialogSitePolicy,
  | "siteTypeLabel"
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "usesBrowserCookieSession"
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
  SiteInfoInputWithAuthSelectorProps | SiteInfoInputWithoutAuthSelectorProps

/**
 * Site information section displaying the URL input with contextual helpers
 * such as already-added warnings. The current-tab reuse
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
  const isSiteUrlLocked = isDetected || props.sitePolicy.lockSiteUrl
  const enableRecentTabs = !isSiteUrlLocked && !!onUseCurrentTab
  const shouldShowCookiePermissionRecommendation =
    !isDetected &&
    canUseCookieAuth &&
    props.showAuthTypeSelector === true &&
    props.authType === AuthTypeEnum.Cookie
  const authTypeHelpText = isAuthTypeLocked
    ? t("siteInfo.authMethodSelectedForSite", {
        siteType: props.sitePolicy.siteTypeLabel,
      })
    : props.sitePolicy.usesBrowserCookieSession &&
        props.showAuthTypeSelector &&
        props.authType === AuthTypeEnum.Cookie
      ? t("siteInfo.browserCookieSession")
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
            className="grid gap-x-2 gap-y-density-2 [@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_auto] [@container(min-width:28rem)]:items-end"
          >
            <div
              data-layout="auth-type-field"
              className="order-1 max-w-full [@container(min-width:28rem)]:order-2"
            >
              <div className="mb-density-1 flex items-center gap-x-1.5 gap-y-density-1-5">
                <label className="text-sm font-medium text-secondary-foreground">
                  {t("siteInfo.authMethod")}
                </label>
                <Tooltip
                  content={authTypeHelpText}
                  wrapperClassName="inline-flex"
                >
                  <button
                    type="button"
                    aria-label={authTypeHelpText}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-faint-foreground transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-secondary-foreground"
                  >
                    <HelpHintIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
              <AccountAuthTypeSelect
                value={props.authType}
                onChange={props.onAuthTypeChange}
                disabled={isAuthTypeLocked}
                allowCookie={canUseCookieAuth}
                triggerClassName="w-full max-w-full [@container(min-width:28rem)]:w-auto"
              />
            </div>
            <div
              data-layout="site-url-field"
              className="order-2 w-full min-w-0 [@container(min-width:28rem)]:order-1"
            >
              <label
                htmlFor="site-url"
                className="mb-density-1 block text-sm font-medium text-secondary-foreground"
              >
                {t("siteInfo.siteUrl")}
              </label>
              <AccountSiteUrlInput
                url={url}
                onUrlChange={onUrlChange}
                onClearUrl={onClearUrl}
                disabled={isSiteUrlLocked}
                enableRecentTabs={enableRecentTabs}
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
            className="block text-sm font-medium text-secondary-foreground"
          >
            {t("siteInfo.siteUrl")}
          </label>
          <div className="relative grow">
            <AccountSiteUrlInput
              url={url}
              onUrlChange={onUrlChange}
              onClearUrl={onClearUrl}
              disabled={isSiteUrlLocked}
              enableRecentTabs={enableRecentTabs}
              currentTabUrl={currentTabUrl}
              onUseCurrentTab={onUseCurrentTab}
            />
          </div>
        </>
      )}
      <div className="flex flex-col justify-between gap-y-density-2 text-xs empty:hidden">
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
        {isCurrentSiteAdded && (
          <div className="flex w-full items-center justify-between rounded-md bg-warning-soft px-2 py-density-2 text-xs text-warning-soft-foreground">
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
