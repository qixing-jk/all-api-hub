import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import { isEmptyModelMapping } from "~/services/models/modelRedirect/utils"
import type { ManagedModelMappingPreview } from "~/types/managedResourceModels"
import { getErrorMessage } from "~/utils/core/error"

interface ModelMappingMeta {
  count: number
  isEmpty: boolean
  isInvalid: boolean
  previewText: string | null
}

/**
 * Extracts mapping metadata for display in the bulk clear preview.
 * @param channel Managed site channel to extract metadata from.
 * @returns Metadata about the model mapping, including count, emptiness, validity, and preview
 */
function getModelMappingMeta(
  channel: ManagedModelMappingPreview,
): ModelMappingMeta {
  const raw = channel.modelMapping

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

/** Owns bulk-clear preview, selection, execution, and acceptance of the active session only. */
export function useClearModelRedirectMappingsSession(
  isOpen: boolean,
  onClose: () => void,
) {
  const { t } = useTranslation("modelRedirect")

  const generation = useRef(0)
  const [channels, setChannels] = useState<ManagedModelMappingPreview[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
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

        return a.channel.ref.resourceId.localeCompare(
          b.channel.ref.resourceId,
          undefined,
          { numeric: true },
        )
      })
  }, [channels])

  const filteredChannelItems = useMemo(() => {
    const trimmed = searchText.trim().toLowerCase()
    if (!trimmed) return sortedChannelItems

    return sortedChannelItems.filter(({ channel }) => {
      const nameMatch = (channel.name ?? "").toLowerCase().includes(trimmed)
      const idMatch = channel.ref.resourceId.toLowerCase().includes(trimmed)
      return nameMatch || idMatch
    })
  }, [sortedChannelItems, searchText])

  const selectedCount = selectedKeys.size
  const totalCount = channels.length
  const filteredCount = filteredChannelItems.length

  const canContinue = useMemo(() => {
    return !isLoading && !loadError && selectedCount > 0
  }, [isLoading, loadError, selectedCount])

  useEffect(() => {
    generation.current += 1
    if (!isOpen) {
      setChannels([])
      setSelectedKeys(new Set())
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
    setSelectedKeys(new Set())
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
        setSelectedKeys(
          new Set(result.channels.map((c) => getManagedResourceRefKey(c.ref))),
        )
      } catch (error) {
        if (cancelled) return
        setLoadError(getErrorMessage(error))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      generation.current += 1
      cancelled = true
    }
  }, [isOpen])

  const handleClose = () => {
    if (isClearing) return
    onClose()
  }

  const handleToggleSelected = (resourceKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(resourceKey)) {
        next.delete(resourceKey)
      } else {
        next.add(resourceKey)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const { channel } of filteredChannelItems) {
        next.add(getManagedResourceRefKey(channel.ref))
      }
      return next
    })
  }

  const handleSelectNone = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const { channel } of filteredChannelItems) {
        next.delete(getManagedResourceRefKey(channel.ref))
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!selectedKeys.size) return

    const attempt = generation.current
    setIsClearing(true)
    setResultErrors([])
    try {
      const refs = channels
        .filter((channel) =>
          selectedKeys.has(getManagedResourceRefKey(channel.ref)),
        )
        .map((channel) => channel.ref)
      const result = await ModelRedirectService.clearChannelModelMappings(refs)
      if (attempt !== generation.current) return

      if (result.success) {
        if (result.clearedChannels > 0 && result.skippedChannels > 0) {
          toast.warning(
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
          toast.warning(t("bulkClear.messages.nothingToClear"))
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
      if (attempt !== generation.current) return
      toast.error(
        t("bulkClear.messages.failed", { error: getErrorMessage(error) }),
      )
      setResultErrors([getErrorMessage(error)])
      setIsConfirmOpen(false)
    } finally {
      if (attempt === generation.current) setIsClearing(false)
    }
  }

  return {
    channels,
    selectedKeys,
    isLoading,
    loadError,
    searchText,
    setSearchText,
    isConfirmOpen,
    setIsConfirmOpen,
    isClearing,
    resultErrors,
    filteredChannelItems,
    selectedCount,
    totalCount,
    filteredCount,
    canContinue,
    handleClose,
    handleToggleSelected,
    handleSelectAll,
    handleSelectNone,
    handleConfirm,
  }
}
