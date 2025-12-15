import {
  DocumentDuplicateIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/ChannelDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Heading6, IconButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { importToCliProxy } from "~/services/cliProxyService"
import type { DisplaySiteData } from "~/types"
import { OpenInCherryStudio } from "~/utils/cherryStudio"
import { getManagedSiteLabelKey } from "~/utils/managedSite"
import { showResultToast } from "~/utils/toastHelpers"

import { AccountToken } from "../../type"

interface TokenHeaderProps {
  /**
   * Token data with account display name included.
   */
  token: AccountToken
  /**
   * Copy handler for placing the key on clipboard.
   */
  copyKey: (key: string, name: string) => void
  /**
   * Handler to open the edit dialog for the token.
   */
  handleEditToken: (token: AccountToken) => void
  /**
   * Handler to delete the token.
   */
  handleDeleteToken: (token: AccountToken) => void
  /**
   * Account metadata for linking cross-app actions.
   */
  account: DisplaySiteData
  /**
   * Optional opener for CCSwitch export dialog.
   */
  onOpenCCSwitchDialog?: () => void
}

/**
 * Renders action buttons for a token (copy, export, edit/delete).
 * @param props Component props container.
 * @param props.token Token being acted upon.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for integrations.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 */
function TokenActionButtons({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog,
}: TokenHeaderProps) {
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType, claudeCodeRouterBaseUrl, claudeCodeRouterApiKey } =
    useUserPreferencesContext()
  const { openWithAccount } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)

  const managedSiteLabel = t(getManagedSiteLabelKey(managedSiteType))

  const handleImportToManagedSite = async () => {
    await openWithAccount(account, token, (result) => {
      showResultToast(result)
    })
  }

  const handleImportToCliProxy = async () => {
    const result = await importToCliProxy(account, token)
    showResultToast(result)
  }

  const handleOpenClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <ClaudeCodeRouterImportDialog
        isOpen={isClaudeCodeRouterOpen}
        onClose={() => setIsClaudeCodeRouterOpen(false)}
        account={account}
        token={token}
        routerBaseUrl={claudeCodeRouterBaseUrl}
        routerApiKey={claudeCodeRouterApiKey}
      />
      <IconButton
        aria-label={t("common:actions.copyKey")}
        size="sm"
        variant="ghost"
        onClick={() => copyKey(token.key, token.name)}
      >
        <DocumentDuplicateIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
      </IconButton>
      <IconButton
        aria-label={t("actions.useInCherry")}
        size="sm"
        variant="ghost"
        onClick={() => OpenInCherryStudio(account, token)}
      >
        <CherryIcon className="text-purple-500 dark:text-purple-400" />
      </IconButton>
      {onOpenCCSwitchDialog && (
        <IconButton
          aria-label={t("actions.exportToCCSwitch")}
          size="sm"
          variant="ghost"
          onClick={onOpenCCSwitchDialog}
        >
          <CCSwitchIcon />
        </IconButton>
      )}
      <IconButton
        aria-label={t("actions.importToCliProxy")}
        size="sm"
        variant="ghost"
        onClick={handleImportToCliProxy}
      >
        <CliProxyIcon size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.importToClaudeCodeRouter")}
        size="sm"
        variant="ghost"
        onClick={handleOpenClaudeCodeRouter}
      >
        <ClaudeCodeRouterIcon size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.importToManagedSite", {
          site: managedSiteLabel,
        })}
        size="sm"
        variant="ghost"
        onClick={handleImportToManagedSite}
      >
        <ManagedSiteIcon siteType={managedSiteType} size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.editKey")}
        size="sm"
        variant="outline"
        onClick={() => handleEditToken(token)}
      >
        <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
      </IconButton>
      <IconButton
        aria-label={t("actions.deleteKey")}
        size="sm"
        variant="destructive"
        onClick={() => handleDeleteToken(token)}
      >
        <TrashIcon className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

/**
 * Token header displaying name, status badges, and action buttons.
 * @param props Component props container.
 * @param props.token Token entity with account name.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for cross-app operations.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 */
export function TokenHeader({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog,
}: TokenHeaderProps) {
  const { t } = useTranslation("keyManagement")
  return (
    <div className="flex min-w-0 items-start gap-2">
      {/* 左侧：标题和标签 - 可压缩 */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
        <Heading6 className="truncate text-sm sm:text-base md:text-lg">
          {token.name}
        </Heading6>
        <Badge
          variant={token.status === 1 ? "success" : "destructive"}
          size="sm"
        >
          {token.status === 1 ? t("actions.enable") : t("actions.disable")}
        </Badge>
        <Badge variant="outline" size="sm">
          {token.accountName}
        </Badge>
      </div>

      {/* 右侧：操作按钮 - 固定不压缩 */}
      <TokenActionButtons
        token={token}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleDeleteToken}
        account={account}
        onOpenCCSwitchDialog={onOpenCCSwitchDialog}
      />
    </div>
  )
}
