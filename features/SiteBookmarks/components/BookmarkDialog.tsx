import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Button, FormField, Input, Modal, Textarea } from "~/components/ui"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { SiteBookmark } from "~/types"
import { getErrorMessage } from "~/utils/error"

export type BookmarkDialogMode = "add" | "edit"

interface BookmarkDialogProps {
  isOpen: boolean
  mode: BookmarkDialogMode
  bookmark: SiteBookmark | null
  onClose: () => void
}

/**
 * BookmarkDialog provides Add/Edit UI for SiteBookmark entries.
 */
export default function BookmarkDialog({
  isOpen,
  mode,
  bookmark,
  onClose,
}: BookmarkDialogProps) {
  const { t } = useTranslation(["bookmark", "messages", "common"])
  const { tags, createTag, renameTag, deleteTag, loadAccountData } =
    useAccountDataContext()

  const initial = useMemo(
    () => ({
      name: bookmark?.name ?? "",
      url: bookmark?.url ?? "",
      notes: bookmark?.notes ?? "",
      tagIds: bookmark?.tagIds ?? [],
    }),
    [bookmark],
  )

  const [name, setName] = useState(initial.name)
  const [url, setUrl] = useState(initial.url)
  const [notes, setNotes] = useState(initial.notes)
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds)
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({})
  const [isWorking, setIsWorking] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(initial.name)
    setUrl(initial.url)
    setNotes(initial.notes)
    setTagIds(initial.tagIds)
    setErrors({})
    setIsWorking(false)
  }, [initial, isOpen])

  const title =
    mode === "add"
      ? t("bookmark:dialog.titleAdd")
      : t("bookmark:dialog.titleEdit")

  const validate = () => {
    const nextErrors: { name?: string; url?: string } = {}
    if (!name.trim()) {
      nextErrors.name = t("bookmark:validation.nameRequired")
    }
    if (!url.trim()) {
      nextErrors.url = t("bookmark:validation.urlRequired")
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (isWorking) return
    if (!validate()) return

    setIsWorking(true)
    try {
      if (mode === "add") {
        await accountStorage.addBookmark({
          name,
          url,
          notes,
          tagIds,
        })
        toast.success(
          t("messages:toast.success.bookmarkAdded", { name: name.trim() }),
        )
      } else if (bookmark) {
        const success = await accountStorage.updateBookmark(bookmark.id, {
          name,
          url,
          notes,
          tagIds,
        })
        if (!success) {
          throw new Error(t("messages:toast.error.saveFailed"))
        }
        toast.success(
          t("messages:toast.success.bookmarkUpdated", { name: name.trim() }),
        )
      }

      await loadAccountData()
      onClose()
    } catch (error) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isWorking) return
        onClose()
      }}
      size="md"
      header={
        <div className="space-y-1">
          <div className="text-base font-semibold">{title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("bookmark:dialog.description")}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isWorking}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isWorking}>
            {mode === "add"
              ? t("bookmark:actions.add")
              : t("common:actions.save")}
          </Button>
        </div>
      }
    >
      <FormField
        label={t("bookmark:form.nameLabel")}
        required={true}
        error={errors.name}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("bookmark:form.namePlaceholder")}
        />
      </FormField>

      <FormField
        label={t("bookmark:form.urlLabel")}
        required={true}
        error={errors.url}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("bookmark:form.urlPlaceholder")}
        />
      </FormField>

      <FormField label={t("bookmark:form.notesLabel")}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("bookmark:form.notesPlaceholder")}
          rows={3}
        />
      </FormField>

      <FormField label={t("bookmark:form.tagsLabel")}>
        <TagPicker
          tags={tags}
          selectedTagIds={tagIds}
          onSelectedTagIdsChange={setTagIds}
          onCreateTag={createTag}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          placeholder={t("bookmark:form.tagsPlaceholder")}
          disabled={isWorking}
        />
      </FormField>
    </Modal>
  )
}
