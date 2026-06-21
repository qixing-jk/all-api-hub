import {
  ExclamationTriangleIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  KeyIcon,
  PencilIcon,
} from "@heroicons/react/24/outline"
import { Cookie } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/CookieAuthPermissionRecommendation"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

type SiteInfoInputPresentationSitePolicy = Pick<
  AccountDialogSitePolicy,
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "allowBuiltInCheckInDetection"
  | "allowSub2ApiRefreshTokenState"
>

interface SiteInfoInputBaseProps {
  url: string
  onUrlChange: (url: string) => void
  isDetected: boolean
  onClearUrl: () => void
  siteType?: string
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
 * such as current-tab reuse, already-added warnings, and the sub2api hint.
 * @param props Component props defining field values, detection state, and callbacks.
 * @param props.url Current site URL value.
 * @param props.onUrlChange Handler updating the site URL.
 * @param props.isDetected Whether the site info was auto-detected (locks inputs when true).
 * @param props.onClearUrl Clears the URL field.
 * @param props.siteType Detected or selected site type, used for contextual hints.
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
  const shouldShowCookiePermissionRecommendation =
    !isDetected &&
    canUseCookieAuth &&
    props.showAuthTypeSelector === true &&
    props.authType === AuthTypeEnum.Cookie

  const handleEditClick = () => {
    if (detectedAccount && onEditAccount) {
      onEditAccount(detectedAccount)
    }
  }

  return (
    <div className="space-y-2">
      {!isDetected && props.showAuthTypeSelector === true ? (
        <div
          data-layout="site-auth-url-container"
          className="[container-type:inline-size]"
        >
          <div
            data-layout="site-auth-url-layout"
            className="grid gap-2 [@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_auto] [@container(min-width:28rem)]:items-end"
          >
            <div
              data-layout="auth-type-field"
              className="order-1 max-w-full [@container(min-width:28rem)]:order-2"
            >
              <label className="dark:text-dark-text-secondary mb-1 block text-sm font-medium text-gray-700">
                {t("siteInfo.authMethod")}
              </label>
              <Tooltip
                wrapperClassName="w-full [@container(min-width:28rem)]:w-auto"
                content={
                  isAuthTypeLocked
                    ? t("siteInfo.sub2apiAuthOnly")
                    : t("siteInfo.cookieWarning")
                }
              >
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
                      <div className="flex items-center gap-2">
                        <KeyIcon className="h-4 w-4" />
                        <span>{t("siteInfo.authType.accessToken")}</span>
                      </div>
                    </SelectItem>
                    {canUseCookieAuth && (
                      <SelectItem value={AuthTypeEnum.Cookie}>
                        <div className="flex items-center gap-2">
                          <Cookie className="h-4 w-4" />
                          <span>{t("siteInfo.authType.cookieAuth")}</span>
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Tooltip>
            </div>
            <div
              data-layout="site-url-field"
              className="order-2 w-full min-w-0 [@container(min-width:28rem)]:order-1"
            >
              <label
                htmlFor="site-url"
                className="dark:text-dark-text-secondary mb-1 block text-sm font-medium text-gray-700"
              >
                {t("siteInfo.siteUrl")}
              </label>
              <Input
                id="site-url"
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://example.com"
                disabled={isDetected}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}
                onClear={onClearUrl}
                clearButtonLabel={t("common:actions.clear")}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor="site-url"
            className="dark:text-dark-text-secondary block text-sm font-medium text-gray-700"
          >
            {t("siteInfo.siteUrl")}
          </label>
          <div className="relative grow">
            <Input
              id="site-url"
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://example.com"
              disabled={isDetected}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}
              onClear={onClearUrl}
              clearButtonLabel={t("common:actions.clear")}
            />
          </div>
        </>
      )}
      <div className="flex flex-col justify-between gap-y-2 text-xs">
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
          <div className="flex w-full items-start gap-2 rounded-md bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("siteInfo.sub2apiHint")}</span>
          </div>
        )}
        {isCurrentSiteAdded && (
          <div className="flex w-full items-center justify-between rounded-md bg-yellow-50 p-2 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="mr-1.5 h-4 w-4 shrink-0" />
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
                variant="warning"
                size="sm"
                leftIcon={<PencilIcon className="h-3 w-3" />}
              >
                {t("siteInfo.editNow")}
              </Button>
            )}
          </div>
        )}
        {!isDetected && onUseCurrentTab && (
          <div className="flex w-full items-center justify-between rounded-md bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <div className="flex items-center">
              <InformationCircleIcon className="h-4 w-4" />
              <span className="ml-1">{t("siteInfo.currentSite")}:</span>
              <Tooltip content={currentTabUrl}>
                <span className="ml-1 max-w-[150px] truncate font-medium">
                  {currentTabUrl || t("siteInfo.unknown")}
                </span>
              </Tooltip>
            </div>

            <button
              type="button"
              onClick={onUseCurrentTab}
              className="flex items-center font-medium text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-blue-200 dark:disabled:text-gray-600"
              disabled={!currentTabUrl}
            >
              <GlobeAltIcon className="mr-1 h-3 w-3" />
              <span>{t("siteInfo.useCurrent")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
