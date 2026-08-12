import { Copy, Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { useIsDesktop } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import {
  API_CREDENTIAL_PROFILES_VIEW_VARIANTS,
  type ApiCredentialProfilesViewVariant,
} from "../contracts"
import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"
import { ApiCredentialProfileListItem } from "./ApiCredentialProfileListItem"

interface ApiCredentialProfilesListProps {
  profiles: ApiCredentialProfile[]
  controller: ApiCredentialProfilesController
  variant?: ApiCredentialProfilesViewVariant
  isFiltering?: boolean
  guidedImportEntry?: {
    profileId: string
    request: number
  }
}

type ApiCredentialEndpointGroup = {
  baseUrl: string
  profiles: ApiCredentialProfile[]
}

interface EndpointHeaderProps {
  baseUrl: string
  credentialCount: number
  onAddCredential?: (baseUrl: string) => void
  onCopyBaseUrl: (baseUrl: string) => void
  className?: string
}

interface EndpointSelectionProps {
  groups: ApiCredentialEndpointGroup[]
  selectedBaseUrl: string
  onSelectBaseUrl: (baseUrl: string) => void
  onAddCredential: (baseUrl: string) => void
}

interface EndpointProfileListProps {
  profiles: ApiCredentialProfile[]
  controller: ApiCredentialProfilesController
  guidedImportEntry?: ApiCredentialProfilesListProps["guidedImportEntry"]
}

const API_CREDENTIAL_ENDPOINT_SELECT_ID = "api-credential-endpoint-select"

/**
 * Groups the already-normalized persisted profiles by their canonical Base URL.
 */
function groupProfilesByBaseUrl(
  profiles: ApiCredentialProfile[],
): ApiCredentialEndpointGroup[] {
  const groups = new Map<string, ApiCredentialEndpointGroup>()

  for (const profile of profiles) {
    const existing = groups.get(profile.baseUrl)
    if (existing) {
      existing.profiles.push(profile)
    } else {
      groups.set(profile.baseUrl, {
        baseUrl: profile.baseUrl,
        profiles: [profile],
      })
    }
  }

  return Array.from(groups.values())
}

/**
 * Renders a compact endpoint label without hiding path-level distinctions.
 */
function getEndpointLabel(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl)
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname
    return `${parsed.host}${pathname}`
  } catch {
    return baseUrl
  }
}

/**
 * Shows the shared endpoint once per group and owns its copy action.
 */
function EndpointHeader({
  baseUrl,
  credentialCount,
  onAddCredential,
  onCopyBaseUrl,
  className,
}: EndpointHeaderProps) {
  const { t } = useTranslation(["apiCredentialProfiles"])

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <code
            className="min-w-0 truncate font-mono text-xs font-semibold text-gray-950 sm:text-sm dark:text-gray-50"
            title={baseUrl}
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.endpointBaseUrl}
          >
            {baseUrl}
          </code>
          <Badge
            variant="secondary"
            size="sm"
            className="shrink-0"
            data-testid={
              API_CREDENTIAL_PROFILES_TEST_IDS.endpointCredentialCount
            }
          >
            {t("apiCredentialProfiles:grouping.credentialCount", {
              count: credentialCount,
            })}
          </Badge>
        </div>
        {onAddCredential ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddCredential(baseUrl)}
            data-testid={
              API_CREDENTIAL_PROFILES_TEST_IDS.endpointAddCredentialButton
            }
            aria-label={t("apiCredentialProfiles:grouping.addCredential")}
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            leftIcon={<Plus className="h-4 w-4" />}
            analyticsAction={
              PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog
            }
          >
            <span className="hidden sm:inline">
              {t("apiCredentialProfiles:grouping.addCredential")}
            </span>
          </Button>
        ) : null}
        <IconButton
          variant="ghost"
          size="sm"
          onClick={() => onCopyBaseUrl(baseUrl)}
          data-testid={
            API_CREDENTIAL_PROFILES_TEST_IDS.endpointCopyBaseUrlButton
          }
          aria-label={t("apiCredentialProfiles:actions.copyBaseUrl")}
          className="shrink-0"
          analyticsAction={{
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
            actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyBaseUrl,
            surfaceId:
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          }}
        >
          <Copy className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

/** Renders the endpoint switcher used by the full options-page layout. */
function DesktopEndpointNavigation({
  groups,
  selectedBaseUrl,
  onSelectBaseUrl,
  onAddCredential,
}: EndpointSelectionProps) {
  const { t } = useTranslation(["apiCredentialProfiles"])

  return (
    <nav
      aria-label={t("apiCredentialProfiles:grouping.navigationLabel")}
      data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.endpointNavigation}
      className="border-r border-gray-200 bg-gray-50/70 p-2 dark:border-gray-800 dark:bg-gray-900/50"
    >
      <div className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {t("apiCredentialProfiles:grouping.baseUrls")}
      </div>
      <div className="space-y-1">
        {groups.map((group) => {
          const selected = group.baseUrl === selectedBaseUrl
          return (
            <div
              key={group.baseUrl}
              className={cn(
                "flex min-w-0 items-center rounded-lg border transition-colors",
                selected
                  ? "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100"
                  : "border-transparent text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-900",
              )}
            >
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                onClick={() => onSelectBaseUrl(group.baseUrl)}
              >
                <span
                  className="block truncate text-sm font-medium"
                  title={group.baseUrl}
                >
                  {getEndpointLabel(group.baseUrl)}
                </span>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {t("apiCredentialProfiles:grouping.credentialCount", {
                    count: group.profiles.length,
                  })}
                </span>
              </button>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => onAddCredential(group.baseUrl)}
                data-testid={
                  API_CREDENTIAL_PROFILES_TEST_IDS.endpointAddCredentialButton
                }
                aria-label={t("apiCredentialProfiles:grouping.addCredential")}
                className="mr-1 shrink-0"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog
                }
              >
                <Plus className="h-4 w-4" />
              </IconButton>
            </div>
          )
        })}
      </div>
    </nav>
  )
}

/** Renders the endpoint switcher used by popup and narrow layouts. */
function CompactEndpointSelector({
  groups,
  selectedBaseUrl,
  onSelectBaseUrl,
}: Omit<EndpointSelectionProps, "onAddCredential">) {
  const { t } = useTranslation(["apiCredentialProfiles"])

  return (
    <div className="border-b border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/50">
      <label
        htmlFor={API_CREDENTIAL_ENDPOINT_SELECT_ID}
        className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {t("apiCredentialProfiles:grouping.baseUrlSelector")}
      </label>
      <Select value={selectedBaseUrl} onValueChange={onSelectBaseUrl}>
        <SelectTrigger
          id={API_CREDENTIAL_ENDPOINT_SELECT_ID}
          size="sm"
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.endpointSelector}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {groups.map((group) => (
            <SelectItem key={group.baseUrl} value={group.baseUrl}>
              <span className="min-w-0 truncate">
                {getEndpointLabel(group.baseUrl)}
              </span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {t("apiCredentialProfiles:grouping.credentialCount", {
                  count: group.profiles.length,
                })}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Narrows configured tag lookups while preserving the existing empty filter. */
function isTagName(value: string | undefined): value is string {
  return Boolean(value)
}

/** Connects endpoint-group profiles to their row actions and display metadata. */
function EndpointProfileList({
  profiles,
  controller,
  guidedImportEntry,
}: EndpointProfileListProps) {
  return profiles.map((profile) => (
    <ApiCredentialProfileListItem
      key={profile.id}
      profile={profile}
      verificationSummary={controller.getProfileVerificationSummary(profile.id)}
      tagNames={(profile.tagIds ?? [])
        .map((id) => controller.tagNameById.get(id))
        .filter(isTagName)}
      visibleKeys={controller.visibleKeys}
      toggleKeyVisibility={controller.toggleKeyVisibility}
      onCopyApiKey={controller.handleCopyApiKey}
      onCopyBundle={controller.handleCopyBundle}
      onOpenModelManagement={controller.handleOpenModelManagement}
      onRefreshTelemetry={controller.handleRefreshTelemetry}
      onExport={controller.handleExport}
      isTelemetryRefreshing={controller.refreshingTelemetryProfileIds.includes(
        profile.id,
      )}
      managedSiteType={controller.managedSiteType}
      managedSiteLabel={controller.managedSiteLabel}
      guidedImportEntryRequest={
        guidedImportEntry?.profileId === profile.id
          ? guidedImportEntry.request
          : undefined
      }
      onVerify={controller.setVerifyingProfile}
      onVerifyCliSupport={controller.setCliVerifyingProfile}
      onEdit={controller.openEditDialog}
      onDelete={controller.handleRequestDelete}
    />
  ))
}

/**
 * Renders API credential profiles with per-item actions wired to the controller.
 */
export function ApiCredentialProfilesList({
  profiles,
  controller,
  variant = API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Options,
  isFiltering = false,
  guidedImportEntry,
}: ApiCredentialProfilesListProps) {
  const { t } = useTranslation(["apiCredentialProfiles"])
  const isDesktop = useIsDesktop()
  const groups = useMemo(() => groupProfilesByBaseUrl(profiles), [profiles])
  const [selectedBaseUrl, setSelectedBaseUrl] = useState(
    () => groups[0]?.baseUrl ?? "",
  )
  const selectedGroup =
    groups.find((group) => group.baseUrl === selectedBaseUrl) ?? groups[0]
  const guidedGroup = guidedImportEntry
    ? groups.find((group) =>
        group.profiles.some(
          (profile) => profile.id === guidedImportEntry.profileId,
        ),
      )
    : undefined
  const handleAddCredential = (baseUrl: string) => {
    controller.openAddDialog({ baseUrl })
  }

  useEffect(() => {
    if (guidedGroup && guidedGroup.baseUrl !== selectedBaseUrl) {
      setSelectedBaseUrl(guidedGroup.baseUrl)
      return
    }

    if (selectedGroup && selectedGroup.baseUrl !== selectedBaseUrl) {
      setSelectedBaseUrl(selectedGroup.baseUrl)
    }
  }, [guidedGroup, selectedBaseUrl, selectedGroup])

  if (!selectedGroup) {
    return null
  }

  if (isFiltering) {
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <section
            key={group.baseUrl}
            aria-label={t("apiCredentialProfiles:grouping.selectedEndpoint", {
              baseUrl: group.baseUrl,
            })}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
          >
            <EndpointHeader
              baseUrl={group.baseUrl}
              credentialCount={group.profiles.length}
              onCopyBaseUrl={controller.handleCopyBaseUrl}
              className="border-b border-gray-200 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/50"
            />
            <div className="space-y-3 p-3 sm:p-4">
              <EndpointProfileList
                profiles={group.profiles}
                controller={controller}
                guidedImportEntry={guidedImportEntry}
              />
            </div>
          </section>
        ))}
      </div>
    )
  }

  const hasMultipleGroups = groups.length > 1
  const useSidebar =
    hasMultipleGroups &&
    variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Options &&
    isDesktop

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950",
        useSidebar && "grid grid-cols-[15rem_minmax(0,1fr)]",
      )}
    >
      {useSidebar ? (
        <DesktopEndpointNavigation
          groups={groups}
          selectedBaseUrl={selectedGroup.baseUrl}
          onSelectBaseUrl={setSelectedBaseUrl}
          onAddCredential={handleAddCredential}
        />
      ) : hasMultipleGroups ? (
        <CompactEndpointSelector
          groups={groups}
          selectedBaseUrl={selectedGroup.baseUrl}
          onSelectBaseUrl={setSelectedBaseUrl}
        />
      ) : null}

      <section
        aria-label={t("apiCredentialProfiles:grouping.selectedEndpoint", {
          baseUrl: selectedGroup.baseUrl,
        })}
        className="min-w-0 p-3 sm:p-4"
      >
        <EndpointHeader
          baseUrl={selectedGroup.baseUrl}
          credentialCount={selectedGroup.profiles.length}
          onAddCredential={handleAddCredential}
          onCopyBaseUrl={controller.handleCopyBaseUrl}
          className="mb-3"
        />
        <div className="space-y-3">
          <EndpointProfileList
            profiles={selectedGroup.profiles}
            controller={controller}
            guidedImportEntry={guidedImportEntry}
          />
        </div>
      </section>
    </div>
  )
}
