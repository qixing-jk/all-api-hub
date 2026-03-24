import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { tagStorage } from "~/services/tags/tagStorage"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  useVerificationResultHistorySummaries,
} from "~/services/verification/verificationResultHistory"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openModelsPage } from "~/utils/navigation"

import type { ApiCredentialProfileExportAction } from "../components/ApiCredentialProfileListItem"
import { createExportAccount, createExportToken } from "../utils/exportShims"
import { useApiCredentialProfiles } from "./useApiCredentialProfiles"

type SaveApiCredentialProfileInput = {
  id?: string
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds: string[]
  notes: string
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
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithCredentials } = useChannelDialog()

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } =
    useApiCredentialProfiles()
  const profileVerificationTargets = useMemo(
    () =>
      profiles.flatMap((profile) => {
        const target = createProfileVerificationHistoryTarget(profile.id)
        return target ? [target] : []
      }),
    [profiles],
  )
  const { summariesByKey: verificationSummariesByKey } =
    useVerificationResultHistorySummaries(profileVerificationTargets)

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

  const openAddDialog = useCallback(() => {
    setEditingProfile(null)
    setIsEditorOpen(true)
  }, [])

  const openEditDialog = useCallback((profile: ApiCredentialProfile) => {
    setEditingProfile(profile)
    setIsEditorOpen(true)
  }, [])

  const handleSave = useCallback(
    async (input: SaveApiCredentialProfileInput) => {
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
    },
    [createProfile, updateProfile],
  )

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
    (profile: ApiCredentialProfile) => {
      void copyToClipboard(
        profile.baseUrl,
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

  const [ccSwitchProfile, setCCSwitchProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kiloCodeProfile, setKiloCodeProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliProxyProfile, setCliProxyProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [claudeCodeRouterProfile, setClaudeCodeRouterProfile] =
    useState<ApiCredentialProfile | null>(null)

  const handleExport = useCallback(
    (
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
    },
    [
      claudeCodeRouterBaseUrl,
      cliProxyBaseUrl,
      cliProxyManagementKey,
      openWithCredentials,
      t,
    ],
  )

  const [deletingProfile, setDeletingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleRequestDelete = useCallback((profile: ApiCredentialProfile) => {
    setDeletingProfile(profile)
  }, [])

  const closeDeleteDialog = useCallback(() => {
    setDeletingProfile(null)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
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
    } catch {
      toast.error(t("apiCredentialProfiles:messages.deleteFailed"))
    } finally {
      setIsDeleting(false)
    }
  }, [deleteProfile, deletingProfile, t])

  return {
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
    openAddDialog,
    openEditDialog,
    handleSave,

    verifyingProfile,
    setVerifyingProfile,
    cliVerifyingProfile,
    setCliVerifyingProfile,

    ccSwitchProfile,
    setCCSwitchProfile,
    kiloCodeProfile,
    setKiloCodeProfile,
    cliProxyProfile,
    setCliProxyProfile,
    claudeCodeRouterProfile,
    setClaudeCodeRouterProfile,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,

    handleCopyBaseUrl,
    handleCopyApiKey,
    handleCopyBundle,
    handleOpenModelManagement,
    getProfileVerificationSummary,
    handleExport,

    deletingProfile,
    isDeleting,
    handleRequestDelete,
    closeDeleteDialog,
    handleConfirmDelete,
  }
}

export type ApiCredentialProfilesController = ReturnType<
  typeof useApiCredentialProfilesController
>
