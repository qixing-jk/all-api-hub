import {
  GlobeAltIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Button, FormField, Input, Modal, Textarea } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { getSiteName } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { SiteBookmark } from "~/types"
import { getActiveTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

export type BookmarkDialogMode = "add" | "edit"

interface BookmarkDialogProps {
  isOpen: boolean
  mode: BookmarkDialogMode
  bookmark: SiteBookmark | null
  onClose: () => void
}

const logger = createLogger("BookmarkDialog")
const dialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog
const bookmarkAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
  surfaceId: dialogSurface,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
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
  const [currentPage, setCurrentPage] = useState<{
    title: string
    url: string
  } | null>(null)
  const [isCurrentPageLoading, setIsCurrentPageLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(initial.name)
    setUrl(initial.url)
    setNotes(initial.notes)
    setTagIds(initial.tagIds)
    setErrors({})
    setIsWorking(false)
  }, [initial, isOpen])

  useEffect(() => {
    if (!isOpen || mode !== "add") {
      setCurrentPage(null)
      setIsCurrentPageLoading(false)
      return
    }

    let cancelled = false

    const loadCurrentPage = async () => {
      setIsCurrentPageLoading(true)

      try {
        const tab = await getActiveTab()
        const rawUrl = typeof tab?.url === "string" ? tab.url.trim() : ""
        if (!rawUrl) {
          if (!cancelled) {
            setCurrentPage(null)
          }
          return
        }

        const parsedUrl = new URL(rawUrl)
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          if (!cancelled) {
            setCurrentPage(null)
          }
          return
        }

        const resolvedTitle = tab ? await getSiteName(tab) : ""
        if (cancelled) {
          return
        }

        setCurrentPage({
          title: resolvedTitle.trim() || parsedUrl.hostname,
          url: parsedUrl.toString(),
        })
      } catch (error) {
        if (!cancelled) {
          setCurrentPage(null)
        }
        logger.warn("Failed to resolve current page for bookmark autofill", {
          error: getErrorMessage(error),
        })
      } finally {
        if (!cancelled) {
          setIsCurrentPageLoading(false)
        }
      }
    }

    void loadCurrentPage()

    return () => {
      cancelled = true
    }
  }, [isOpen, mode])

  const title =
    mode === "add"
      ? t("bookmark:dialog.titleAdd")
      : t("bookmark:dialog.titleEdit")

  const handleUseCurrentPage = () => {
    if (!currentPage) return

    setName(currentPage.title)
    setUrl(currentPage.url)
    setErrors((prev) => ({
      ...prev,
      name: undefined,
      url: undefined,
    }))
  }

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
    const analyticsActionId =
      mode === "add"
        ? PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark
        : PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark
    const analyticsAction = startProductAnalyticsAction({
      ...bookmarkAnalyticsContext,
      actionId: analyticsActionId,
    })
    let isAnalyticsActionCompleted = false

    try {
      if (mode === "add") {
        await accountStorage.addBookmark({
          name,
          url,
          notes,
          tagIds,
        })
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        isAnalyticsActionCompleted = true
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
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          isAnalyticsActionCompleted = true
          throw new Error(t("messages:toast.error.saveFailed"))
        }
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        isAnalyticsActionCompleted = true
        toast.success(
          t("messages:toast.success.bookmarkUpdated", { name: name.trim() }),
        )
      }

      await loadAccountData()
      onClose()
    } catch (error) {
      if (!isAnalyticsActionCompleted) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
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
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement}
      surfaceId={dialogSurface}
    >
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
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isWorking}
              analyticsAction={
                mode === "add"
                  ? PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark
                  : PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark
              }
            >
              {mode === "add"
                ? t("bookmark:actions.add")
                : t("common:actions.save")}
            </Button>
          </div>
        }
      >
        {mode === "add" && (
          <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium">
                  <InformationCircleIcon className="h-4 w-4 shrink-0" />
                  <span>{t("bookmark:dialog.currentPageLabel")}</span>
                </div>
                <div className="mt-1 truncate font-medium">
                  {currentPage?.title ||
                    (!isCurrentPageLoading &&
                      t("bookmark:dialog.currentPageUnavailable"))}
                </div>
                <div className="truncate opacity-80">
                  {currentPage?.url ||
                    (!isCurrentPageLoading &&
                      t("bookmark:dialog.currentPageUnavailable"))}
                </div>
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                leftIcon={<GlobeAltIcon className="h-4 w-4" />}
                onClick={handleUseCurrentPage}
                loading={isCurrentPageLoading}
                disabled={!currentPage || isWorking || isCurrentPageLoading}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.UseCurrentPageForBookmark
                }
              >
                {t("bookmark:dialog.useCurrentPage")}
              </Button>
            </div>
          </div>
        )}

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
    </ProductAnalyticsScope>
  )
}
