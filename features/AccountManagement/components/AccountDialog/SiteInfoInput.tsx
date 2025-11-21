import {
  ExclamationTriangleIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  PencilIcon,
  XCircleIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton, Input } from "~/components/ui"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

interface SiteInfoInputProps {
  url: string
  onUrlChange: (url: string) => void
  isDetected: boolean
  onClearUrl: () => void
  authType: AuthTypeEnum
  onAuthTypeChange: (authType: AuthTypeEnum) => void
  // Props for "add" mode
  currentTabUrl?: string | null
  isCurrentSiteAdded?: boolean
  detectedAccount?: DisplaySiteData | null
  onUseCurrentTab?: () => void
  onEditAccount?: (account: DisplaySiteData) => void
}

export default function SiteInfoInput({
  url,
  onUrlChange,
  isDetected,
  onClearUrl,
  authType,
  onAuthTypeChange,
  currentTabUrl,
  isCurrentSiteAdded,
  detectedAccount,
  onUseCurrentTab,
  onEditAccount
}: SiteInfoInputProps) {
  const { t } = useTranslation("accountDialog")

  const handleEditClick = () => {
    if (detectedAccount && onEditAccount) {
      onEditAccount(detectedAccount)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <label
          htmlFor="site-url"
          className="dark:text-dark-text-secondary block text-sm font-medium text-gray-700">
          {t("siteInfo.siteUrl")}
        </label>
        <label
          htmlFor="auth-type"
          className="dark:text-dark-text-secondary block text-sm font-medium text-gray-700">
          {t("siteInfo.authMethod")}
        </label>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative grow">
          <Input
            id="site-url"
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://example.com"
            disabled={isDetected}
            rightIcon={
              url &&
              !isDetected && (
                <IconButton
                  type="button"
                  onClick={onClearUrl}
                  variant="ghost"
                  size="sm"
                  aria-label="clear-url">
                  <XCircleIcon className="h-5 w-5 text-gray-400" />
                </IconButton>
              )
            }
          />
        </div>
        <Tooltip content={t("siteInfo.cookieWarning")}>
          <select
            id="auth-type"
            value={authType}
            onChange={(e) => onAuthTypeChange(e.target.value as AuthTypeEnum)}
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary block rounded-lg border border-gray-200 bg-white py-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:placeholder-gray-500"
            disabled={isDetected}>
            <option value={AuthTypeEnum.AccessToken}>Access Token</option>
            <option value={AuthTypeEnum.Cookie}>Cookie</option>
          </select>
        </Tooltip>
      </div>
      <div className="flex flex-col justify-between gap-y-2 text-xs">
        {isCurrentSiteAdded && handleEditClick && (
          <div className="flex w-full items-center justify-between rounded-md bg-yellow-50 p-2 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="mr-1.5 h-4 w-4 shrink-0" />
              <span>{t("siteInfo.alreadyAdded")}</span>
            </div>
            <Button
              type="button"
              onClick={handleEditClick}
              variant="ghost"
              size="sm"
              className="flex items-center font-medium text-yellow-800 dark:text-yellow-200">
              <PencilIcon className="mr-1 h-3 w-3" />
              <span>{t("siteInfo.editNow")}</span>
            </Button>
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
              disabled={!currentTabUrl}>
              <GlobeAltIcon className="mr-1 h-3 w-3" />
              <span>{t("siteInfo.useCurrent")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
