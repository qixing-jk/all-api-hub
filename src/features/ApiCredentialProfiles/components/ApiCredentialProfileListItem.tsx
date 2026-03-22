import {
  ArrowUpTrayIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { VerificationStatusBadge } from "~/components/dialogs/VerifyApiDialog/VerificationStatusBadge"
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
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime } from "~/utils/core/formatters"

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

export type ApiCredentialProfileExportAction =
  | "cherryStudio"
  | "ccSwitch"
  | "kiloCode"
  | "cliProxy"
  | "claudeCodeRouter"
  | "managedSite"

interface ApiCredentialProfileListItemProps {
  profile: ApiCredentialProfile
  verificationSummary: ApiVerificationHistorySummary | null
  tagNames: string[]
  visibleKeys: Set<string>
  toggleKeyVisibility: (id: string) => void
  onCopyBaseUrl: (profile: ApiCredentialProfile) => void
  onCopyApiKey: (profile: ApiCredentialProfile) => void
  onCopyBundle: (profile: ApiCredentialProfile) => void
  onOpenModelManagement: (profile: ApiCredentialProfile) => void
  onVerify: (profile: ApiCredentialProfile) => void
  onVerifyCliSupport: (profile: ApiCredentialProfile) => void
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
 * Renders a single profile row/card with copy, verify, export, edit, delete actions.
 */
export function ApiCredentialProfileListItem({
  profile,
  verificationSummary,
  tagNames,
  visibleKeys,
  toggleKeyVisibility,
  onCopyBaseUrl,
  onCopyApiKey,
  onCopyBundle,
  onOpenModelManagement,
  onVerify,
  onVerifyCliSupport,
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
                {getApiVerificationApiTypeLabel(t, profile.apiType)}
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

              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("aiApiVerification:verifyDialog.history.lastVerified")}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <VerificationStatusBadge
                    status={verificationSummary?.status ?? "unverified"}
                  />
                  <span className="dark:text-dark-text-secondary text-gray-600">
                    {verificationSummary
                      ? formatLocaleDateTime(verificationSummary.verifiedAt)
                      : t("aiApiVerification:verifyDialog.history.unverified")}
                  </span>
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
              aria-label={t("apiCredentialProfiles:actions.verifyApi")}
              size="sm"
              variant="ghost"
              onClick={() => onVerify(profile)}
            >
              <WrenchScrewdriverIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </IconButton>
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.verifyCliSupport")}
              size="sm"
              variant="ghost"
              onClick={() => onVerifyCliSupport(profile)}
            >
              <CommandLineIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </IconButton>
            <IconButton
              aria-label={t(
                "apiCredentialProfiles:actions.openModelManagement",
              )}
              size="sm"
              variant="ghost"
              onClick={() => onOpenModelManagement(profile)}
            >
              <CpuChipIcon className="h-4 w-4" />
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
