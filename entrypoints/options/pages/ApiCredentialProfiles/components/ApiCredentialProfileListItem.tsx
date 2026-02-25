import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Card, CardContent, Heading6, IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/**
 * Formats a secret for display (masked by default, revealable per-profile).
 */
function formatSecret(
  secret: string,
  id: string,
  visibleIds: Set<string>,
): string {
  if (visibleIds.has(id)) return secret
  if (secret.length < 12) return "******"
  return `${secret.substring(0, 8)}${"*".repeat(16)}${secret.substring(
    secret.length - 4,
  )}`
}

/**
 * Maps apiType values to the i18n key segment used by `aiApiVerification` labels.
 */
function apiTypeLabelKey(apiType: ApiVerificationApiType) {
  return apiType === API_TYPES.OPENAI_COMPATIBLE ? "openaiCompatible" : apiType
}

export type ApiCredentialProfileExportAction =
  | "cherryStudio"
  | "ccSwitch"
  | "kiloCode"
  | "cliProxy"
  | "claudeCodeRouter"
  | "managedSite"

interface ApiCredentialProfileListItemProps {
  profile: ApiCredentialProfile
  tagNames: string[]
  visibleKeys: Set<string>
  toggleKeyVisibility: (id: string) => void
  onCopyBaseUrl: (profile: ApiCredentialProfile) => void
  onCopyApiKey: (profile: ApiCredentialProfile) => void
  onCopyBundle: (profile: ApiCredentialProfile) => void
  onVerify: (profile: ApiCredentialProfile) => void
  onEdit: (profile: ApiCredentialProfile) => void
  onDelete: (profile: ApiCredentialProfile) => void
  onExport: (
    profile: ApiCredentialProfile,
    action: ApiCredentialProfileExportAction,
  ) => void
  managedSiteType: ManagedSiteType
  managedSiteLabel: string
}

/**
 * Renders a single profile row/card with copy, verify, edit, delete actions.
 */
export function ApiCredentialProfileListItem({
  profile,
  tagNames,
  visibleKeys,
  toggleKeyVisibility,
  onCopyBaseUrl,
  onCopyApiKey,
  onCopyBundle,
  onVerify,
  onEdit,
  onDelete,
  onExport,
  managedSiteType,
  managedSiteLabel,
}: ApiCredentialProfileListItemProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "keyManagement",
    "common",
  ])

  return (
    <Card>
      <CardContent padding="md" spacing="sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Heading6 className="min-w-0 truncate">{profile.name}</Heading6>
              <Badge variant="outline" size="sm">
                {t(
                  `aiApiVerification:verifyDialog.apiTypes.${apiTypeLabelKey(profile.apiType)}`,
                )}
              </Badge>
              {tagNames.map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("apiCredentialProfiles:list.baseUrl")}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                    {profile.baseUrl}
                  </code>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyBaseUrl(profile)}
                    aria-label={t("apiCredentialProfiles:actions.copyBaseUrl")}
                    className="shrink-0"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("apiCredentialProfiles:list.apiKey")}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                    {formatSecret(profile.apiKey, profile.id, visibleKeys)}
                  </code>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleKeyVisibility(profile.id)}
                    aria-label={
                      visibleKeys.has(profile.id)
                        ? t("keyManagement:actions.hideKey")
                        : t("keyManagement:actions.showKey")
                    }
                    className="shrink-0"
                  >
                    {visibleKeys.has(profile.id) ? (
                      <EyeSlashIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyApiKey(profile)}
                    aria-label={t("apiCredentialProfiles:actions.copyApiKey")}
                    className="shrink-0"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </div>

            {profile.notes?.trim() ? (
              <div className="dark:text-dark-text-secondary text-xs text-gray-600">
                {profile.notes}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.copyBundle")}
              size="sm"
              variant="ghost"
              onClick={() => onCopyBundle(profile)}
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.verify")}
              size="sm"
              variant="ghost"
              onClick={() => onVerify(profile)}
            >
              <CheckCircleIcon className="h-4 w-4" />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label={t("common:actions.export")}
                  size="sm"
                  variant="ghost"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "cherryStudio")}
                >
                  <span aria-hidden="true">
                    <CherryIcon className="h-4 w-4" />
                  </span>
                  {t("keyManagement:actions.useInCherry")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "ccSwitch")}
                >
                  <span aria-hidden="true">
                    <CCSwitchIcon size="sm" />
                  </span>
                  {t("keyManagement:actions.exportToCCSwitch")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "kiloCode")}
                >
                  <span aria-hidden="true">
                    <KiloCodeIcon size="sm" />
                  </span>
                  {t("keyManagement:actions.exportToKiloCode")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "cliProxy")}
                >
                  <span aria-hidden="true">
                    <CliProxyIcon size="sm" />
                  </span>
                  {t("keyManagement:actions.importToCliProxy")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "claudeCodeRouter")}
                >
                  <span aria-hidden="true">
                    <ClaudeCodeRouterIcon size="sm" />
                  </span>
                  {t("keyManagement:actions.importToClaudeCodeRouter")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onExport(profile, "managedSite")}
                >
                  <span aria-hidden="true">
                    <ManagedSiteIcon siteType={managedSiteType} size="sm" />
                  </span>
                  {t("keyManagement:actions.importToManagedSite", {
                    site: managedSiteLabel,
                  })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <IconButton
              aria-label={t("common:actions.edit")}
              size="sm"
              variant="outline"
              onClick={() => onEdit(profile)}
            >
              <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            </IconButton>
            <IconButton
              aria-label={t("common:actions.delete")}
              size="sm"
              variant="destructive"
              onClick={() => onDelete(profile)}
            >
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
