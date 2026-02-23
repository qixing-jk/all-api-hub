import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Checkbox,
  CollapsibleSection,
  DestructiveConfirmDialog,
  Input,
  Modal,
} from "~/components/ui"
import { ModelRedirectService } from "~/services/modelRedirect"
import { isEmptyModelMapping } from "~/services/modelRedirect/utils"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { getErrorMessage } from "~/utils/error"

interface ClearModelRedirectMappingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface ModelMappingMeta {
  count: number
  isEmpty: boolean
  isInvalid: boolean
  previewText: string | null
}

/**
 * Extracts metadata from a channel's model_mapping field for display in the bulk clear preview.
 * @param channel Managed site channel to extract metadata from.
 * @returns Metadata about the model mapping, including count, emptiness, validity, and preview
 */
function getModelMappingMeta(channel: ManagedSiteChannel): ModelMappingMeta {
  const raw = channel.model_mapping ?? ""

  if (isEmptyModelMapping(raw)) {
    return {
      count: 0,
      isEmpty: true,
      isInvalid: false,
      previewText: null,
    }
  }

  try {
    const parsed = JSON.parse(raw)
    const count =
      parsed && typeof parsed === "object" ? Object.keys(parsed).length : 0
    return {
      count,
      isEmpty: count === 0,
      isInvalid: false,
      previewText: JSON.stringify(parsed, null, 2),
    }
  } catch {
    return {
      count: -1,
      isEmpty: false,
      isInvalid: true,
      previewText: raw,
    }
  }
}

/**
 * Dialog for previewing and confirming bulk clearing of model redirect mappings across managed site channels.
 */
export function ClearModelRedirectMappingsDialog({
  isOpen,
  onClose,
}: ClearModelRedirectMappingsDialogProps) {
  const { t } = useTranslation("modelRedirect")

  const [channels, setChannels] = useState<ManagedSiteChannel[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState("")
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [resultErrors, setResultErrors] = useState<string[]>([])

  const sortedChannelItems = useMemo(() => {
    return channels
      .map((channel) => ({
        channel,
        meta: getModelMappingMeta(channel),
      }))
      .sort((a, b) => {
        if (a.meta.count !== b.meta.count) {
          return b.meta.count - a.meta.count
        }

        const aName = a.channel.name ?? ""
        const bName = b.channel.name ?? ""
        const nameDiff = aName.localeCompare(bName)
        if (nameDiff !== 0) return nameDiff

        return a.channel.id - b.channel.id
      })
  }, [channels])

  const filteredChannelItems = useMemo(() => {
    const trimmed = searchText.trim().toLowerCase()
    if (!trimmed) return sortedChannelItems

    return sortedChannelItems.filter(({ channel }) => {
      const nameMatch = (channel.name ?? "").toLowerCase().includes(trimmed)
      const idMatch = String(channel.id).includes(trimmed)
      return nameMatch || idMatch
    })
  }, [sortedChannelItems, searchText])

  const selectedCount = selectedIds.size
  const totalCount = channels.length
  const filteredCount = filteredChannelItems.length

  const canContinue = useMemo(() => {
    return !isLoading && !loadError && selectedCount > 0
  }, [isLoading, loadError, selectedCount])

  useEffect(() => {
    if (!isOpen) {
      setChannels([])
      setSelectedIds(new Set())
      setIsLoading(false)
      setLoadError(null)
      setSearchText("")
      setIsConfirmOpen(false)
      setIsClearing(false)
      setResultErrors([])
      return
    }

    let cancelled = false

    setChannels([])
    setSelectedIds(new Set())
    setIsLoading(true)
    setLoadError(null)
    setResultErrors([])

    void (async () => {
      try {
        const result = await ModelRedirectService.listManagedSiteChannels()
        if (cancelled) return
        if (!result.success) {
          const message =
            result.message || result.errors.join("; ") || "Unknown"
          setLoadError(message)
          return
        }

        setChannels(result.channels)
        setSelectedIds(new Set(result.channels.map((c) => c.id)))
      } catch (error) {
        if (cancelled) return
        setLoadError(getErrorMessage(error))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleClose = () => {
    if (isClearing) return
    onClose()
  }

  const handleToggleSelected = (channelId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const { channel } of filteredChannelItems) {
        next.add(channel.id)
      }
      return next
    })
  }

  const handleSelectNone = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const { channel } of filteredChannelItems) {
        next.delete(channel.id)
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!selectedIds.size) return

    setIsClearing(true)
    setResultErrors([])
    try {
      const ids = Array.from(selectedIds)
      const result = await ModelRedirectService.clearChannelModelMappings(ids)

      if (result.success) {
        if (result.clearedChannels > 0 && result.skippedChannels > 0) {
          toast.success(
            t("bulkClear.messages.successWithSkips", {
              cleared: result.clearedChannels,
              skipped: result.skippedChannels,
            }),
          )
        } else if (result.clearedChannels > 0) {
          toast.success(
            t("bulkClear.messages.allSuccess", {
              count: result.clearedChannels,
            }),
          )
        } else {
          toast.success(t("bulkClear.messages.nothingToClear"))
        }
        setIsConfirmOpen(false)
        onClose()
        return
      }

      if (result.clearedChannels > 0) {
        toast.error(
          t("bulkClear.messages.partialFailure", {
            success: result.clearedChannels,
            total: result.totalSelected,
            failed: result.failedChannels,
          }),
        )
        setResultErrors(result.errors)
        setIsConfirmOpen(false)
        return
      }

      const errorMessage =
        result.errors.join("; ") || result.message || "Unknown"
      toast.error(t("bulkClear.messages.failed", { error: errorMessage }))
      setResultErrors(result.errors)
      setIsConfirmOpen(false)
    } catch (error) {
      toast.error(
        t("bulkClear.messages.failed", { error: getErrorMessage(error) }),
      )
      setResultErrors([getErrorMessage(error)])
      setIsConfirmOpen(false)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={!isClearing}
        closeOnEsc={!isClearing}
        showCloseButton={!isClearing}
        size="lg"
        header={
          <div className="space-y-1">
            <div className="text-base font-semibold">
              {t("bulkClear.preview.title")}
            </div>
            <div className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("bulkClear.preview.description")}
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("bulkClear.preview.selectedCount", {
                selected: selectedCount,
                total: totalCount,
              })}
              {filteredCount !== totalCount && (
                <span className="ml-2">
                  {t("bulkClear.search.filteredCount", {
                    filtered: filteredCount,
                    total: totalCount,
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isClearing}
              >
                {t("bulkClear.actions.close")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!canContinue || isClearing}
              >
                {t("bulkClear.actions.continue")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="dark:text-dark-text-primary text-sm text-gray-700">
              {t("bulkClear.preview.channelListLabel")}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={
                  isLoading || isClearing || !filteredChannelItems.length
                }
              >
                {t("bulkClear.actions.selectAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectNone}
                disabled={
                  isLoading || isClearing || !filteredChannelItems.length
                }
              >
                {t("bulkClear.actions.selectNone")}
              </Button>
            </div>
          </div>

          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("bulkClear.search.placeholder")}
            aria-label={t("bulkClear.search.label")}
            disabled={isLoading || isClearing || !channels.length}
          />

          {isLoading && (
            <div className="dark:text-dark-text-secondary rounded-md border border-gray-200 p-3 text-sm text-gray-600 dark:border-gray-700">
              {t("bulkClear.status.loading")}
            </div>
          )}

          {loadError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {t("bulkClear.status.loadFailed", { error: loadError })}
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-700">
              {channels.length === 0 ? (
                <div className="dark:text-dark-text-secondary text-sm text-gray-500">
                  {t("bulkClear.status.noChannels")}
                </div>
              ) : filteredChannelItems.length === 0 ? (
                <div className="dark:text-dark-text-secondary text-sm text-gray-500">
                  {t("bulkClear.search.noResults")}
                </div>
              ) : (
                filteredChannelItems.map(({ channel, meta }) => {
                  const checked = selectedIds.has(channel.id)
                  const mappingIsEmpty = meta.isEmpty
                  const checkboxDisabled = isClearing

                  return (
                    <div
                      key={channel.id}
                      className="space-y-2 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          aria-label={`${channel.name} (#${channel.id})`}
                          checked={checked}
                          onCheckedChange={() =>
                            handleToggleSelected(channel.id)
                          }
                          disabled={checkboxDisabled}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900">
                              {channel.name}
                            </div>
                            {!meta.isInvalid ? (
                              <Badge
                                variant={mappingIsEmpty ? "secondary" : "info"}
                                size="sm"
                              >
                                {t("bulkClear.preview.mappingCount", {
                                  count: meta.count,
                                })}
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                {t("bulkClear.preview.mappingInvalidBadge")}
                              </Badge>
                            )}
                          </div>
                          <div className="dark:text-dark-text-secondary text-xs text-gray-500">
                            #{channel.id}
                          </div>
                        </div>
                      </div>

                      {mappingIsEmpty ? (
                        <div className="dark:text-dark-text-secondary text-xs text-gray-500">
                          {t("bulkClear.preview.mappingEmptyInline")}
                        </div>
                      ) : (
                        <CollapsibleSection
                          title={t("bulkClear.preview.mappingToggle")}
                          buttonClassName="px-1"
                          panelClassName="bg-gray-50 dark:bg-gray-900/20"
                        >
                          <>
                            {meta.isInvalid && (
                              <div className="mb-2 text-xs text-amber-700 dark:text-amber-200">
                                {t("bulkClear.preview.mappingInvalid")}
                              </div>
                            )}
                            <pre className="dark:text-dark-text-secondary max-h-[200px] overflow-auto text-xs wrap-break-word whitespace-pre-wrap text-gray-700">
                              {meta.previewText}
                            </pre>
                          </>
                        </CollapsibleSection>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {!isLoading &&
            !loadError &&
            selectedCount === 0 &&
            channels.length > 0 && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {t("bulkClear.status.emptySelection")}
              </div>
            )}

          {resultErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="font-medium">{t("bulkClear.result.title")}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {resultErrors.map((err, index) => (
                  <li key={`${err}-${index}`}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <DestructiveConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isClearing) setIsConfirmOpen(false)
        }}
        size="sm"
        title={t("bulkClear.confirm.title")}
        description={t("bulkClear.confirm.description", {
          count: selectedCount,
        })}
        warningTitle={t("bulkClear.confirm.warningTitle")}
        cancelLabel={t("bulkClear.actions.cancel")}
        confirmLabel={
          isClearing
            ? t("bulkClear.status.clearing")
            : t("bulkClear.actions.confirm")
        }
        onConfirm={() => {
          void handleConfirm()
        }}
        isWorking={isClearing}
        details={
          selectedCount > 0 ? (
            <div className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("bulkClear.confirm.details", { count: selectedCount })}
            </div>
          ) : undefined
        }
      />
    </>
  )
}
