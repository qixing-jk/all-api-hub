import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useApiCredentialProfileExportSession } from "~/features/ApiCredentialProfiles/export/useApiCredentialProfileExportSession"
import { useApiCredentialProfileCommands } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfileCommands"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import toast from "~/lib/notify"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createProfileVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  useLatestProfileVerificationSummaries,
} from "~/services/verification/verificationResultHistory"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { openModelsPage } from "~/utils/navigation"

type ApiCredentialProfileAddPrefill = {
  name?: string
  baseUrl?: string
  apiKeyCreateUrl?: string
  apiKeyCreateHint?: string
}

/**
 * Normalizes add-dialog prefill fields before they reach controlled inputs or links.
 */
function normalizeApiCredentialProfileAddPrefill(
  value: unknown,
): ApiCredentialProfileAddPrefill | null {
  if (typeof value !== "object" || value === null) return null

  const record = value as Record<string, unknown>
  const name = trimOptionalString(record.name)
  const baseUrl = trimOptionalString(record.baseUrl)
  const apiKeyCreateUrl = normalizeOptionalHttpUrl(record.apiKeyCreateUrl)
  const apiKeyCreateHint = trimOptionalString(record.apiKeyCreateHint)

  const prefill = {
    ...(name ? { name } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKeyCreateUrl ? { apiKeyCreateUrl } : {}),
    ...(apiKeyCreateHint ? { apiKeyCreateHint } : {}),
  }

  return Object.keys(prefill).length > 0 ? prefill : null
}

/**
 * Trims optional string input and omits empty or non-string values.
 */
function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Returns an HTTP(S) URL string when the optional input is safe to render.
 */
function normalizeOptionalHttpUrl(value: unknown): string | undefined {
  const trimmed = trimOptionalString(value)
  if (!trimmed) return undefined

  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:"
      ? trimmed
      : undefined
  } catch {
    return undefined
  }
}

type RuntimeBroadcastMessage = {
  type?: (typeof RuntimeMessageTypes)[keyof typeof RuntimeMessageTypes]
}

/**
 * Controller hook for managing API credential profiles, including CRUD operations,
 */
export function useApiCredentialProfilesController() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "messages",
    "settings",
  ])
  const { managedSiteType } = useUserPreferencesContext()

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } =
    useApiCredentialProfiles()
  const { summariesByKey: verificationSummariesByKey } =
    useLatestProfileVerificationSummaries(profiles.map((profile) => profile.id))

  const [tags, setTags] = useState<Tag[]>([])

  const loadTags = useCallback(async () => {
    try {
      setTags(await tagStorage.listTags())
    } catch {
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

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  const toggleKeyVisibility = useCallback((id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [addPrefill, setAddPrefill] =
    useState<ApiCredentialProfileAddPrefill | null>(null)

  const openAddDialog = useCallback(
    (prefill?: ApiCredentialProfileAddPrefill | null | unknown) => {
      setEditingProfile(null)
      setAddPrefill(normalizeApiCredentialProfileAddPrefill(prefill))
      setIsEditorOpen(true)
    },
    [],
  )

  const openEditDialog = useCallback((profile: ApiCredentialProfile) => {
    setEditingProfile(profile)
    setAddPrefill(null)
    setIsEditorOpen(true)
  }, [])

  const copyToClipboard = useCallback(
    async (value: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(value)
        toast.success(successMessage)
      } catch {
        toast.error(t("apiCredentialProfiles:messages.copyFailed"))
      }
    },
    [t],
  )

  const handleCopyBaseUrl = useCallback(
    (baseUrl: string) => {
      void copyToClipboard(
        baseUrl,
        t("apiCredentialProfiles:messages.baseUrlCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleCopyApiKey = useCallback(
    (profile: ApiCredentialProfile) => {
      void copyToClipboard(
        profile.apiKey,
        t("apiCredentialProfiles:messages.apiKeyCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleCopyBundle = useCallback(
    (profile: ApiCredentialProfile) => {
      const content = `BASE_URL=${profile.baseUrl}\nAPI_KEY=${profile.apiKey}`
      void copyToClipboard(
        content,
        t("apiCredentialProfiles:messages.bundleCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleOpenModelManagement = useCallback(
    (profile: ApiCredentialProfile) => {
      void openModelsPage({ profileId: profile.id })
    },
    [],
  )

  const getProfileVerificationSummary = useCallback(
    (profileId: string) => {
      const target = createProfileVerificationHistoryTarget(profileId)
      return target
        ? verificationSummariesByKey[
            serializeVerificationHistoryTarget(target)
          ] ?? null
        : null
    },
    [verificationSummariesByKey],
  )

  const [verifyingProfile, setVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliVerifyingProfile, setCliVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const exportSession = useApiCredentialProfileExportSession()
  const commands = useApiCredentialProfileCommands({
    createProfile,
    updateProfile,
    deleteProfile,
  })
  return {
    ...exportSession,
    ...commands,
    profiles,
    isLoading,

    tags,
    tagNameById,
    createTag,
    renameTag,
    deleteTag,

    visibleKeys,
    toggleKeyVisibility,

    managedSiteType,
    managedSiteLabel,

    isEditorOpen,
    setIsEditorOpen,
    editingProfile,
    addPrefill,
    openAddDialog,
    openEditDialog,

    verifyingProfile,
    setVerifyingProfile,
    cliVerifyingProfile,
    setCliVerifyingProfile,

    handleCopyBaseUrl,
    handleCopyApiKey,
    handleCopyBundle,
    handleOpenModelManagement,
    getProfileVerificationSummary,
  }
}

export type ApiCredentialProfilesController = ReturnType<
  typeof useApiCredentialProfilesController
>
