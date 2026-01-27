import {
  CheckIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  DestructiveConfirmDialog,
  IconButton,
  Input,
} from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { normalizeTagNameForUniqueness } from "~/services/accountTags/tagStoreUtils"
import type { Tag } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

/**
 * Logger scoped to the tag picker UI so failures can be diagnosed without leaking sensitive data.
 */
const logger = createLogger("TagPicker")

export interface TagPickerProps {
  /**
   * Full list of available tags from the global tag store.
   */
  tags: Tag[]
  /**
   * Optional per-tag usage count, keyed by tag id.
   */
  tagCountsById?: Record<string, number>
  /**
   * Current selection (tag ids).
   */
  selectedTagIds: string[]
  /**
   * Update selection callback (tag ids).
   */
  onSelectedTagIdsChange: (ids: string[]) => void
  /**
   * Create a new global tag.
   */
  onCreateTag: (name: string) => Promise<Tag>
  /**
   * Rename an existing global tag.
   */
  onRenameTag: (tagId: string, name: string) => Promise<Tag>
  /**
   * Delete an existing global tag (also removes it from accounts).
   */
  onDeleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  /**
   * Disable all interactions.
   */
  disabled?: boolean
  /**
   * Placeholder shown when there are no selected tags.
   */
  placeholder?: string
}

/**
 * TagPicker is a tag-aware multi-select control used in the account dialog.
 *
 * It supports:
 * - select existing tags by id
 * - create a new global tag while selecting
 * - rename and delete tags inline (global operations)
 * - surfaces create/rename/delete errors via toast + inline message
 */
export function TagPicker({
  tags,
  tagCountsById,
  selectedTagIds,
  onSelectedTagIdsChange,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  disabled = false,
  placeholder,
}: TagPickerProps) {
  const { t } = useTranslation(["accountDialog", "ui"])
  const pickerId = useId()
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [tagActionError, setTagActionError] = useState<string | null>(null)

  const tagById = useMemo(() => {
    const map = new Map<string, Tag>()
    for (const tag of tags) {
      map.set(tag.id, tag)
    }
    return map
  }, [tags])

  const selectedTags = useMemo(() => {
    return selectedTagIds
      .map((id) => tagById.get(id))
      .filter((tag): tag is Tag => Boolean(tag))
  }, [selectedTagIds, tagById])

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(q))
  }, [query, tags])

  const canCreate = useMemo(() => {
    const normalized = normalizeTagNameForUniqueness(query)
    if (!normalized) return false
    const hasConflict = tags.some((tag) => {
      const normalizedExisting = normalizeTagNameForUniqueness(tag.name)
      return (
        normalizedExisting &&
        normalizedExisting.normalizedKey === normalized.normalizedKey
      )
    })
    return !hasConflict
  }, [query, tags])

  const listboxId = `${pickerId}-listbox`
  const getOptionId = useCallback(
    (key: string) => `${pickerId}-option-${key}`,
    [pickerId],
  )

  const optionCount = (canCreate ? 1 : 0) + filteredTags.length

  const activeOptionId = useMemo(() => {
    if (activeIndex < 0) return undefined
    if (canCreate && activeIndex === 0) return getOptionId("create")
    const tagIndex = activeIndex - (canCreate ? 1 : 0)
    const tag = filteredTags[tagIndex]
    return tag ? getOptionId(tag.id) : undefined
  }, [activeIndex, canCreate, filteredTags, getOptionId])

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1)
      return
    }
    if (optionCount === 0) {
      setActiveIndex(-1)
      return
    }
    if (activeIndex >= optionCount) {
      setActiveIndex(-1)
    }
  }, [activeIndex, isOpen, optionCount, query])

  useEffect(() => {
    if (isOpen) {
      setTagActionError(null)
    }
  }, [isOpen])

  const toggleTag = (tagId: string) => {
    if (disabled || isWorking) return
    if (selectedTagIds.includes(tagId)) {
      onSelectedTagIdsChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onSelectedTagIdsChange([...selectedTagIds, tagId])
    }
  }

  const removeTag = (tagId: string) => {
    if (disabled || isWorking) return
    onSelectedTagIdsChange(selectedTagIds.filter((id) => id !== tagId))
  }

  const handleCreate = async () => {
    const normalized = normalizeTagNameForUniqueness(query)
    if (!normalized || disabled || isWorking) return
    setIsWorking(true)
    setTagActionError(null)
    try {
      const created = await onCreateTag(normalized.displayName)
      onSelectedTagIdsChange(
        selectedTagIds.includes(created.id)
          ? selectedTagIds
          : [...selectedTagIds, created.id],
      )
      setQuery("")
    } catch (error) {
      const message = t("messages.operationFailed", {
        error: getErrorMessage(error),
      })
      logger.error("Failed to create tag", {
        error,
        displayName: normalized.displayName,
      })
      setTagActionError(message)
      toast.error(message)
    } finally {
      setIsWorking(false)
    }
  }

  /**
   * Keyboard behavior (when the search input is focused):
   * - ArrowDown / ArrowUp: move the active option through create + filtered tags
   * - Enter: activate the current option (or create when available)
   */
  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || isWorking || editingTagId) return
    if (optionCount === 0) return

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()

      const direction = e.key === "ArrowDown" ? 1 : -1
      const nextIndex =
        activeIndex < 0
          ? direction > 0
            ? 0
            : optionCount - 1
          : (activeIndex + direction + optionCount) % optionCount

      setActiveIndex(nextIndex)
      return
    }

    if (e.key === "Enter") {
      const shouldCreateWithoutExplicitNavigation =
        activeIndex < 0 && canCreate && query.trim().length > 0

      if (shouldCreateWithoutExplicitNavigation) {
        e.preventDefault()
        void handleCreate()
        return
      }

      if (activeIndex < 0) return
      e.preventDefault()

      if (canCreate && activeIndex === 0) {
        void handleCreate()
        return
      }

      const tagIndex = activeIndex - (canCreate ? 1 : 0)
      const tag = filteredTags[tagIndex]
      if (!tag) return
      toggleTag(tag.id)
    }
  }

  const startRename = (tag: Tag) => {
    if (disabled || isWorking) return
    setEditingTagId(tag.id)
    setEditingName(tag.name)
  }

  const cancelRename = () => {
    setEditingTagId(null)
    setEditingName("")
  }

  const submitRename = async () => {
    if (!editingTagId || disabled || isWorking) return
    const normalized = normalizeTagNameForUniqueness(editingName)
    if (!normalized) return
    setIsWorking(true)
    setTagActionError(null)
    try {
      await onRenameTag(editingTagId, normalized.displayName)
      cancelRename()
    } catch (error) {
      const message = t("messages.operationFailed", {
        error: getErrorMessage(error),
      })
      logger.error("Failed to rename tag", {
        error,
        tagId: editingTagId,
        displayName: normalized.displayName,
      })
      setTagActionError(message)
      toast.error(message)
    } finally {
      setIsWorking(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || disabled || isWorking) return
    setIsWorking(true)
    setTagActionError(null)
    try {
      await onDeleteTag(deleteTarget.id)
      // Ensure current selection is updated immediately in the form.
      onSelectedTagIdsChange(
        selectedTagIds.filter((id) => id !== deleteTarget.id),
      )
    } catch (error) {
      const message = t("messages.operationFailed", {
        error: getErrorMessage(error),
      })
      logger.error("Failed to delete tag", { error, tagId: deleteTarget.id })
      setTagActionError(message)
      toast.error(message)
    } finally {
      setIsWorking(false)
      setDeleteTarget(null)
    }
  }

  const triggerLabel =
    selectedTags.length > 0
      ? t("form.tagsSelectedCount", { count: selectedTags.length })
      : placeholder ?? t("form.tagsPlaceholder")

  return (
    <div className="space-y-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDownIcon className="h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-3" align="start">
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleQueryKeyDown}
              placeholder={t("form.tagsSearchPlaceholder")}
              disabled={disabled || isWorking}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
            />

            {tagActionError && (
              <div role="alert" className="text-destructive text-sm">
                {tagActionError}
              </div>
            )}

            {canCreate && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                onClick={handleCreate}
                disabled={disabled || isWorking}
                id={getOptionId("create")}
                data-active={activeIndex === 0}
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                {t("form.tagsCreate", { name: query.trim() })}
              </Button>
            )}

            <div
              id={listboxId}
              role="listbox"
              className="max-h-64 space-y-1 overflow-auto"
            >
              {filteredTags.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1 text-sm">
                  {t("form.tagsNoResults")}
                </div>
              ) : (
                filteredTags.map((tag, index) => {
                  const isSelected = selectedTagIds.includes(tag.id)
                  const isEditing = editingTagId === tag.id
                  const count = tagCountsById?.[tag.id] ?? 0
                  const optionIndex = (canCreate ? 1 : 0) + index
                  const isActive = optionIndex === activeIndex

                  return (
                    <div
                      key={tag.id}
                      id={getOptionId(tag.id)}
                      role="option"
                      aria-selected={isSelected}
                      data-active={isActive}
                      className={[
                        "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                        isActive ? "bg-accent" : "hover:bg-accent",
                      ].join(" ")}
                    >
                      {isEditing ? (
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="flex h-4 w-4 items-center justify-center rounded-sm border">
                            {isSelected && <CheckIcon className="h-3 w-3" />}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-8"
                              containerClassName="w-full"
                              disabled={disabled || isWorking}
                              autoFocus
                            />
                            <IconButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                void submitRename()
                              }}
                              aria-label={t("form.tagsRenameSave")}
                              disabled={disabled || isWorking}
                            >
                              <CheckIcon className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                cancelRename()
                              }}
                              aria-label={t("form.tagsRenameCancel")}
                              disabled={disabled || isWorking}
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => toggleTag(tag.id)}
                          disabled={disabled || isWorking}
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded-sm border">
                            {isSelected && <CheckIcon className="h-3 w-3" />}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="truncate">{tag.name}</span>
                            {count > 0 && (
                              <Badge variant="outline" className="shrink-0">
                                {count}
                              </Badge>
                            )}
                          </span>
                        </button>
                      )}

                      {!isEditing && (
                        <span className="flex shrink-0 items-center gap-1">
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => startRename(tag)}
                            aria-label={t("form.tagsRename")}
                            disabled={disabled || isWorking}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsOpen(false)
                              setDeleteTarget(tag)
                            }}
                            aria-label={t("form.tagsDelete")}
                            disabled={disabled || isWorking}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </IconButton>
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="flex items-center gap-1"
            >
              <span className="max-w-40 truncate">{tag.name}</span>
              {!disabled && (
                <button
                  type="button"
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100"
                  onClick={() => removeTag(tag.id)}
                  aria-label={t("form.tagsRemove", { name: tag.name })}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <DestructiveConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("form.tagsDeleteTitle")}
        description={t("form.tagsDeleteDescription", {
          name: deleteTarget?.name ?? "",
        })}
        cancelLabel={t("form.tagsDeleteCancel")}
        confirmLabel={t("form.tagsDeleteConfirm")}
        onConfirm={() => {
          void confirmDelete()
        }}
        isWorking={isWorking}
      />
    </div>
  )
}
