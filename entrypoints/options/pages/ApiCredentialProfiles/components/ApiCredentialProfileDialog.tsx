import { DialogTitle } from "@headlessui/react"
import {
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Button,
  FormField,
  IconButton,
  Input,
  SearchableSelect,
  Textarea,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/aiApiVerification"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/logger"
import {
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/utils/webAiApiCheck"

/**
 * Unified logger scoped to the API credential profile dialog.
 */
const logger = createLogger("ApiCredentialProfileDialog")

type SaveProfileInput = {
  id?: string
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds: string[]
  notes: string
}

interface ApiCredentialProfileDialogProps {
  isOpen: boolean
  onClose: () => void
  profile?: ApiCredentialProfile | null
  tags: Tag[]
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  onSave: (input: SaveProfileInput) => Promise<void>
}

/**
 * Normalizes a profile baseUrl for safe persistence based on the selected API type.
 */
function normalizeBaseUrl(
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string | null {
  return apiType === API_TYPES.GOOGLE
    ? normalizeGoogleFamilyBaseUrl(baseUrl)
    : normalizeOpenAiFamilyBaseUrl(baseUrl)
}

/**
 * Maps apiType values to the i18n key segment used by `aiApiVerification` labels.
 */
function apiTypeLabelKey(apiType: ApiVerificationApiType) {
  return apiType === API_TYPES.OPENAI_COMPATIBLE ? "openaiCompatible" : apiType
}

/**
 * Add/edit modal for API credential profiles.
 */
export function ApiCredentialProfileDialog({
  isOpen,
  onClose,
  profile,
  tags,
  createTag,
  renameTag,
  deleteTag,
  onSave,
}: ApiCredentialProfileDialogProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "keyManagement",
  ])

  const isEditMode = Boolean(profile)

  const [name, setName] = useState("")
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")

  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [errors, setErrors] = useState<{
    name?: string
    baseUrl?: string
    apiKey?: string
  }>({})

  const nameInputId = "api-credential-profile-name"
  const baseUrlInputId = "api-credential-profile-baseUrl"
  const apiKeyInputId = "api-credential-profile-apiKey"
  const notesInputId = "api-credential-profile-notes"

  useEffect(() => {
    if (!isOpen) return

    setErrors({})
    setShowKey(false)

    if (profile) {
      setName(profile.name ?? "")
      setApiType(profile.apiType)
      setBaseUrl(profile.baseUrl ?? "")
      setApiKey(profile.apiKey ?? "")
      setTagIds(profile.tagIds ?? [])
      setNotes(profile.notes ?? "")
      return
    }

    setName("")
    setApiType(API_TYPES.OPENAI_COMPATIBLE)
    setBaseUrl("")
    setApiKey("")
    setTagIds([])
    setNotes("")
  }, [isOpen, profile])

  const normalizedBaseUrlPreview = useMemo(() => {
    const normalized = normalizeBaseUrl(apiType, baseUrl)
    return normalized ?? ""
  }, [apiType, baseUrl])

  const validate = () => {
    const nextErrors: typeof errors = {}

    const trimmedName = name.trim()
    if (!trimmedName) {
      nextErrors.name = t("apiCredentialProfiles:dialog.errors.nameRequired")
    }

    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      nextErrors.apiKey = t("apiCredentialProfiles:dialog.errors.keyRequired")
    }

    const normalizedBaseUrl = normalizeBaseUrl(apiType, baseUrl)
    if (!normalizedBaseUrl) {
      nextErrors.baseUrl = t(
        "apiCredentialProfiles:dialog.errors.baseUrlInvalid",
      )
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0 ? normalizedBaseUrl : null
  }

  const handleClose = () => {
    if (isSaving) return
    onClose()
  }

  const handleSave = async () => {
    const normalizedBaseUrl = validate()
    if (!normalizedBaseUrl) return

    setIsSaving(true)
    try {
      await onSave({
        id: profile?.id,
        name: name.trim(),
        apiType,
        baseUrl: normalizedBaseUrl,
        apiKey: apiKey.trim(),
        tagIds,
        notes: notes.trim(),
      })

      toast.success(
        isEditMode
          ? t("apiCredentialProfiles:messages.updated")
          : t("apiCredentialProfiles:messages.created"),
      )
      handleClose()
    } catch (error) {
      logger.error("Failed to save profile", error)
      toast.error(t("apiCredentialProfiles:messages.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdropClick={!isSaving}
      closeOnEsc={!isSaving}
      showCloseButton={!isSaving}
      size="lg"
      header={
        <div className="flex min-w-0 items-center gap-3">
          {isEditMode ? (
            <PencilIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          ) : (
            <PlusIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          )}
          <DialogTitle className="dark:text-dark-text-primary truncate text-lg font-semibold text-gray-900">
            {isEditMode
              ? t("apiCredentialProfiles:dialog.editTitle")
              : t("apiCredentialProfiles:dialog.addTitle")}
          </DialogTitle>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleSave} loading={isSaving} disabled={isSaving}>
            {t("common:actions.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField
          label={t("apiCredentialProfiles:dialog.fields.name")}
          required
          error={errors.name}
          htmlFor={nameInputId}
        >
          <Input
            id={nameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("apiCredentialProfiles:dialog.placeholders.name")}
          />
        </FormField>

        <FormField label={t("aiApiVerification:verifyDialog.meta.apiType")}>
          <SearchableSelect
            options={[
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
            value={apiType}
            onChange={(value) => setApiType(value as ApiVerificationApiType)}
            placeholder={t(
              "aiApiVerification:verifyDialog.meta.apiTypePlaceholder",
            )}
            disabled={isSaving}
          />
        </FormField>

        <FormField
          label={t("apiCredentialProfiles:dialog.fields.baseUrl")}
          required
          error={errors.baseUrl}
          htmlFor={baseUrlInputId}
          description={
            normalizedBaseUrlPreview
              ? t("apiCredentialProfiles:dialog.hints.baseUrlNormalized", {
                  baseUrl: normalizedBaseUrlPreview,
                })
              : undefined
          }
        >
          <Input
            id={baseUrlInputId}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t("apiCredentialProfiles:dialog.placeholders.baseUrl")}
            disabled={isSaving}
          />
        </FormField>

        <FormField
          label={t("apiCredentialProfiles:dialog.fields.apiKey")}
          required
          error={errors.apiKey}
          htmlFor={apiKeyInputId}
        >
          <Input
            id={apiKeyInputId}
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("apiCredentialProfiles:dialog.placeholders.apiKey")}
            disabled={isSaving}
            leftIcon={<KeyIcon className="h-5 w-5" />}
            rightIcon={
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setShowKey(!showKey)}
                aria-label={
                  showKey
                    ? t("keyManagement:actions.hideKey")
                    : t("keyManagement:actions.showKey")
                }
              >
                {showKey ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </IconButton>
            }
          />
        </FormField>

        <FormField
          label={t("apiCredentialProfiles:dialog.fields.tags")}
          description={t("apiCredentialProfiles:dialog.hints.tags")}
        >
          <TagPicker
            tags={tags}
            selectedTagIds={tagIds}
            onSelectedTagIdsChange={setTagIds}
            onCreateTag={createTag}
            onRenameTag={renameTag}
            onDeleteTag={deleteTag}
            placeholder={t("apiCredentialProfiles:dialog.placeholders.tags")}
            disabled={isSaving}
          />
        </FormField>

        <FormField
          label={t("apiCredentialProfiles:dialog.fields.notes")}
          htmlFor={notesInputId}
        >
          <Textarea
            id={notesInputId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("apiCredentialProfiles:dialog.placeholders.notes")}
            disabled={isSaving}
          />
        </FormField>

        <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
          {t("apiCredentialProfiles:dialog.meta.apiTypeHint", {
            apiType: t(
              `aiApiVerification:verifyDialog.apiTypes.${apiTypeLabelKey(apiType)}`,
            ),
          })}
        </div>
      </div>
    </Modal>
  )
}
