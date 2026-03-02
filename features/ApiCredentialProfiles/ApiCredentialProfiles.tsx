import { KeyRound } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { useChannelDialog } from "~/components/ChannelDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import {
  Button,
  DestructiveConfirmDialog,
  EmptyState,
  Input,
  SearchableSelect,
  Spinner,
  TagFilter,
} from "~/components/ui"
import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type Tag,
} from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { onRuntimeMessage } from "~/utils/browserApi"
import { OpenInCherryStudio } from "~/utils/cherryStudio"
import { createLogger } from "~/utils/logger"
import { getManagedSiteLabelKey } from "~/utils/managedSite"
import { showResultToast } from "~/utils/toastHelpers"

import { ApiCredentialProfileDialog } from "./components/ApiCredentialProfileDialog"
import {
  ApiCredentialProfileListItem,
  type ApiCredentialProfileExportAction,
} from "./components/ApiCredentialProfileListItem"
import { KiloCodeProfileExportDialog } from "./components/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "./components/VerifyApiCredentialProfileDialog"
import { useApiCredentialProfiles } from "./hooks/useApiCredentialProfiles"

/**
 * Unified logger scoped to the API credential profiles options page.
 */
const logger = createLogger("ApiCredentialProfilesPage")

type RuntimeBroadcastMessage = {
  type?: (typeof RuntimeMessageTypes)[keyof typeof RuntimeMessageTypes]
}

/**
 * Maps apiType values to the i18n key segment used by `aiApiVerification` labels.
 */
function apiTypeLabelKey(apiType: ApiVerificationApiType) {
  return apiType === API_TYPES.OPENAI_COMPATIBLE ? "openaiCompatible" : apiType
}

/**
 * Derive a stable numeric id from an arbitrary string.
 *
 * Used to adapt string-based profile ids to numeric ids expected by token-based
 * export dialogs (form ids, etc.).
 */
function stableStringHash(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

/**
 * Build a DisplaySiteData shim from a credential profile for integrations that
 * expect an (account, token) pair (e.g. Cherry Studio / CC Switch exports).
 */
function createExportAccount(profile: ApiCredentialProfile): DisplaySiteData {
  return {
    id: `api-credential-profile:${profile.id}`,
    name: profile.name,
    username: "api-credential-profile",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "default",
    baseUrl: profile.baseUrl,
    token: "",
    userId: 0,
    notes: profile.notes,
    tagIds: profile.tagIds ?? [],
    authType: AuthTypeEnum.None,
    checkIn: {
      enableDetection: false,
    },
  }
}

/**
 * Build an ApiToken shim from a credential profile for integrations that
 * expect an (account, token) pair.
 */
function createExportToken(profile: ApiCredentialProfile): ApiToken {
  const id = stableStringHash(profile.id)
  return {
    id,
    user_id: 0,
    key: profile.apiKey,
    status: 1,
    name: profile.name,
    created_time: profile.createdAt,
    accessed_time: profile.updatedAt,
    expired_time: 0,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
  }
}

/**
 * Options page for managing standalone API credential profiles.
 */
export default function ApiCredentialProfiles() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "settings",
    "ui",
  ])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithCredentials } = useChannelDialog()

  const managedSiteLabel = t(getManagedSiteLabelKey(managedSiteType))

  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } =
    useApiCredentialProfiles()

  const [tags, setTags] = useState<Tag[]>([])

  const loadTags = useCallback(async () => {
    try {
      setTags(await tagStorage.listTags())
    } catch (error) {
      logger.warn("Failed to load global tags", error)
      setTags([])
    }
  }, [])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  useEffect(() => {
    return onRuntimeMessage((message: RuntimeBroadcastMessage) => {
      if (message.type === RuntimeMessageTypes.TAG_STORE_UPDATE) {
        void loadTags()
      }
    })
  }, [loadTags])

  const createTag = useCallback(
    async (name: string) => {
      const created = await tagStorage.createTag(name)
      await loadTags()
      return created
    },
    [loadTags],
  )

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      const updated = await tagStorage.renameTag(tagId, name)
      await loadTags()
      return updated
    },
    [loadTags],
  )

  const deleteTag = useCallback(
    async (tagId: string) => {
      const result = await tagStorage.deleteTag(tagId)
      await loadTags()
      return result
    },
    [loadTags],
  )

  const tagNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of tags) {
      map.set(tag.id, tag.name)
    }
    return map
  }, [tags])

  const [searchTerm, setSearchTerm] = useState("")
  const [apiTypeFilter, setApiTypeFilter] = useState<string>("")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  const tagCountsById = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const profile of profiles) {
      const ids = profile.tagIds ?? []
      for (const id of ids) {
        if (!id) continue
        counts[id] = (counts[id] ?? 0) + 1
      }
    }

    return counts
  }, [profiles])

  const tagFilterOptions = useMemo(() => {
    if (tags.length === 0) {
      return []
    }

    return tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: tagCountsById[tag.id] ?? 0,
    }))
  }, [tagCountsById, tags])

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [deletingProfile, setDeletingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [verifyingProfile, setVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [ccSwitchProfile, setCCSwitchProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliProxyProfile, setCliProxyProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [claudeCodeRouterProfile, setClaudeCodeRouterProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kiloCodeProfile, setKiloCodeProfile] =
    useState<ApiCredentialProfile | null>(null)

  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const typeFilter = apiTypeFilter.trim()

    return profiles.filter((profile) => {
      if (typeFilter && profile.apiType !== typeFilter) {
        return false
      }

      if (selectedTagIds.length > 0) {
        const ids = profile.tagIds ?? []
        if (!selectedTagIds.some((tagId) => ids.includes(tagId))) {
          return false
        }
      }

      if (!query) return true

      const resolvedTagNames = (profile.tagIds ?? [])
        .map((id) => tagNameById.get(id))
        .filter(Boolean) as string[]

      const haystack = [
        profile.name,
        profile.baseUrl,
        ...resolvedTagNames,
        profile.notes ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [apiTypeFilter, profiles, searchTerm, selectedTagIds, tagNameById])

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openAddDialog = () => {
    setEditingProfile(null)
    setIsEditorOpen(true)
  }

  const openEditDialog = (profile: ApiCredentialProfile) => {
    setEditingProfile(profile)
    setIsEditorOpen(true)
  }

  const handleSave = async (input: {
    id?: string
    name: string
    apiType: ApiVerificationApiType
    baseUrl: string
    apiKey: string
    tagIds: string[]
    notes: string
  }) => {
    if (input.id) {
      await updateProfile(input.id, {
        name: input.name,
        apiType: input.apiType,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        tagIds: input.tagIds,
        notes: input.notes,
      })
      return
    }

    await createProfile({
      name: input.name,
      apiType: input.apiType,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      tagIds: input.tagIds,
      notes: input.notes,
    })
  }

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch (error) {
      logger.warn("Failed to copy to clipboard", error)
      toast.error(t("apiCredentialProfiles:messages.copyFailed"))
    }
  }

  const handleCopyBaseUrl = (profile: ApiCredentialProfile) => {
    void copyToClipboard(
      profile.baseUrl,
      t("apiCredentialProfiles:messages.baseUrlCopied"),
    )
  }

  const handleCopyApiKey = (profile: ApiCredentialProfile) => {
    void copyToClipboard(
      profile.apiKey,
      t("apiCredentialProfiles:messages.apiKeyCopied"),
    )
  }

  const handleCopyBundle = (profile: ApiCredentialProfile) => {
    const content = `BASE_URL=${profile.baseUrl}\nAPI_KEY=${profile.apiKey}`
    void copyToClipboard(
      content,
      t("apiCredentialProfiles:messages.bundleCopied"),
    )
  }

  const handleExport = (
    profile: ApiCredentialProfile,
    action: ApiCredentialProfileExportAction,
  ) => {
    if (action === "cherryStudio") {
      OpenInCherryStudio(
        createExportAccount(profile),
        createExportToken(profile),
      )
      return
    }

    if (action === "ccSwitch") {
      setCCSwitchProfile(profile)
      return
    }

    if (action === "kiloCode") {
      setKiloCodeProfile(profile)
      return
    }

    if (action === "cliProxy") {
      if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
        showResultToast({
          success: false,
          message: t("messages:cliproxy.configMissing"),
        })
        return
      }
      setCliProxyProfile(profile)
      return
    }

    if (action === "claudeCodeRouter") {
      if (!claudeCodeRouterBaseUrl?.trim()) {
        showResultToast({
          success: false,
          message: t("messages:claudeCodeRouter.configMissing"),
        })
        return
      }
      setClaudeCodeRouterProfile(profile)
      return
    }

    if (action === "managedSite") {
      void openWithCredentials(
        {
          name: profile.name,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
        },
        (result) => {
          showResultToast(result)
        },
      )
    }
  }

  const handleRequestDelete = (profile: ApiCredentialProfile) => {
    setDeletingProfile(profile)
  }

  const handleConfirmDelete = async () => {
    if (!deletingProfile) return
    setIsDeleting(true)
    try {
      const deleted = await deleteProfile(deletingProfile.id)
      if (deleted) {
        toast.success(t("apiCredentialProfiles:messages.deleted"))
      } else {
        toast.error(t("apiCredentialProfiles:messages.deleteFailed"))
      }
      setDeletingProfile(null)
    } catch (error) {
      logger.error("Failed to delete profile", error)
      toast.error(t("apiCredentialProfiles:messages.deleteFailed"))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={KeyRound}
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={openAddDialog}>
            {t("apiCredentialProfiles:actions.add")}
          </Button>
        }
      />

      <ApiCredentialProfileDialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        profile={editingProfile}
        tags={tags}
        createTag={createTag}
        renameTag={renameTag}
        deleteTag={deleteTag}
        onSave={handleSave}
      />

      <VerifyApiCredentialProfileDialog
        isOpen={Boolean(verifyingProfile)}
        onClose={() => setVerifyingProfile(null)}
        profile={verifyingProfile}
      />

      {ccSwitchProfile ? (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={() => setCCSwitchProfile(null)}
          account={createExportAccount(ccSwitchProfile)}
          token={createExportToken(ccSwitchProfile)}
        />
      ) : null}

      {kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => setKiloCodeProfile(null)}
          profile={kiloCodeProfile}
        />
      ) : null}

      {cliProxyProfile ? (
        <CliProxyExportDialog
          isOpen={true}
          onClose={() => setCliProxyProfile(null)}
          account={createExportAccount(cliProxyProfile)}
          token={createExportToken(cliProxyProfile)}
        />
      ) : null}

      {claudeCodeRouterProfile ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => setClaudeCodeRouterProfile(null)}
          account={createExportAccount(claudeCodeRouterProfile)}
          token={createExportToken(claudeCodeRouterProfile)}
          routerBaseUrl={claudeCodeRouterBaseUrl}
          routerApiKey={claudeCodeRouterApiKey}
        />
      ) : null}

      <DestructiveConfirmDialog
        isOpen={Boolean(deletingProfile)}
        onClose={() => (isDeleting ? null : setDeletingProfile(null))}
        title={t("apiCredentialProfiles:delete.title")}
        description={t("apiCredentialProfiles:delete.description")}
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={handleConfirmDelete}
        isWorking={isDeleting}
        details={
          deletingProfile ? (
            <div className="space-y-1 text-sm">
              <div className="dark:text-dark-text-secondary text-gray-600">
                {deletingProfile.name}
              </div>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t(
                  `aiApiVerification:verifyDialog.apiTypes.${apiTypeLabelKey(deletingProfile.apiType)}`,
                )}{" "}
                · {deletingProfile.baseUrl}
              </div>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("apiCredentialProfiles:controls.searchPlaceholder")}
          />
        </div>
        <SearchableSelect
          options={[
            {
              value: "",
              label: t("apiCredentialProfiles:controls.apiTypeAll"),
            },
            {
              value: API_TYPES.OPENAI_COMPATIBLE,
              label: t(
                "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
              ),
            },
            {
              value: API_TYPES.OPENAI,
              label: t("aiApiVerification:verifyDialog.apiTypes.openai"),
            },
            {
              value: API_TYPES.ANTHROPIC,
              label: t("aiApiVerification:verifyDialog.apiTypes.anthropic"),
            },
            {
              value: API_TYPES.GOOGLE,
              label: t("aiApiVerification:verifyDialog.apiTypes.google"),
            },
          ]}
          value={apiTypeFilter}
          onChange={setApiTypeFilter}
          placeholder={t("apiCredentialProfiles:controls.apiTypePlaceholder")}
        />
      </div>

      <TagFilter
        options={tagFilterOptions}
        value={selectedTagIds}
        onChange={setSelectedTagIds}
        maxVisibleLines={maxTagFilterLines}
        allLabel={t("apiCredentialProfiles:filter.tagsAllLabel")}
        allCount={profiles.length}
      />

      {isLoading ? (
        <div className="flex items-center gap-2 py-6">
          <Spinner size="sm" />
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {t("common:status.loading")}
          </div>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title={
            profiles.length === 0
              ? t("empty.title")
              : t("apiCredentialProfiles:empty.filteredTitle")
          }
          description={
            profiles.length === 0
              ? t("empty.description")
              : t("apiCredentialProfiles:empty.filteredDescription")
          }
          action={
            profiles.length === 0
              ? {
                  label: t("apiCredentialProfiles:actions.add"),
                  onClick: openAddDialog,
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredProfiles.map((profile) => (
            <ApiCredentialProfileListItem
              key={profile.id}
              profile={profile}
              tagNames={
                (profile.tagIds ?? [])
                  .map((id) => tagNameById.get(id))
                  .filter(Boolean) as string[]
              }
              visibleKeys={visibleKeys}
              toggleKeyVisibility={toggleKeyVisibility}
              onCopyBaseUrl={handleCopyBaseUrl}
              onCopyApiKey={handleCopyApiKey}
              onCopyBundle={handleCopyBundle}
              onExport={handleExport}
              managedSiteType={managedSiteType}
              managedSiteLabel={managedSiteLabel}
              onVerify={(p) => setVerifyingProfile(p)}
              onEdit={openEditDialog}
              onDelete={handleRequestDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
