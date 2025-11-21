import {
  DocumentDuplicateIcon,
  PencilIcon,
  TrashIcon
} from "@heroicons/react/24/outline"
import { NewAPI } from "@lobehub/icons"
import { useTranslation } from "react-i18next"

import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { Badge, Heading6, IconButton } from "~/components/ui"
import { useChannelDialog } from "~/features/ChannelManagement"
import type { DisplaySiteData } from "~/types"
import { OpenInCherryStudio } from "~/utils/cherryStudio"

import { showResultToast } from "../../../../../../utils/toastHelpers.ts"
import { AccountToken } from "../../type"

interface TokenHeaderProps {
  token: AccountToken
  copyKey: (key: string, name: string) => void
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: () => void
}

function TokenActionButtons({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog
}: TokenHeaderProps) {
  const { t } = useTranslation("keyManagement")
  const { openWithAccount } = useChannelDialog()

  const handleImportToNewApi = async () => {
    await openWithAccount(account, token, (result) => {
      showResultToast(result)
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <IconButton
        aria-label={t("common:actions.copyKey")}
        size="sm"
        variant="ghost"
        onClick={() => copyKey(token.key, token.name)}>
        <DocumentDuplicateIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
      </IconButton>
      <IconButton
        aria-label={t("actions.useInCherry")}
        size="sm"
        variant="ghost"
        onClick={() => OpenInCherryStudio(account, token)}>
        <CherryIcon className="text-purple-500 dark:text-purple-400" />
      </IconButton>
      {onOpenCCSwitchDialog && (
        <IconButton
          aria-label={t("actions.exportToCCSwitch")}
          size="sm"
          variant="ghost"
          onClick={onOpenCCSwitchDialog}>
          <CCSwitchIcon />
        </IconButton>
      )}
      <IconButton
        aria-label={t("actions.importToNewApi")}
        size="sm"
        variant="ghost"
        onClick={handleImportToNewApi}>
        <NewAPI.Color className="h-4 w-4" />
      </IconButton>
      <IconButton
        aria-label={t("actions.editKey")}
        size="sm"
        variant="outline"
        onClick={() => handleEditToken(token)}>
        <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
      </IconButton>
      <IconButton
        aria-label={t("actions.deleteKey")}
        size="sm"
        variant="destructive"
        onClick={() => handleDeleteToken(token)}>
        <TrashIcon className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

export function TokenHeader({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog
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
          size="sm">
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
