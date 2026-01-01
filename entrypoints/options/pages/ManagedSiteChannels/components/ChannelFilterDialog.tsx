import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import { Modal } from "~/components/ui"
import { Button } from "~/components/ui/button"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/error"

import type { ChannelRow } from "../types"
import {
  fetchChannelFilters,
  saveChannelFilters,
} from "../utils/channelFilters"

interface ChannelFilterDialogProps {
  channel: ChannelRow | null
  open: boolean
  onClose: () => void
}

type EditableFilter = ChannelModelFilterRule

/**
 * Dialog for editing channel model filters via visual builder or raw JSON input.
 */
export default function ChannelFilterDialog({
  channel,
  open,
  onClose,
}: ChannelFilterDialogProps) {
  const { t } = useTranslation("managedSiteChannels")
  const [filters, setFilters] = useState<EditableFilter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual")

  const resetState = useCallback(() => {
    setFilters([])
    setIsLoading(false)
    setIsSaving(false)
    setJsonText("")
    setViewMode("visual")
  }, [])

  const loadFilters = useCallback(async () => {
    if (!channel) return
    setIsLoading(true)
    try {
      const loadedFilters = await fetchChannelFilters(channel.id)
      setFilters(loadedFilters)
      try {
        setJsonText(JSON.stringify(loadedFilters, null, 2))
      } catch {
        setJsonText("")
      }
    } catch (error) {
      toast.error(
        t("filters.messages.loadFailed", { error: getErrorMessage(error) }),
      )
      onClose()
    } finally {
      setIsLoading(false)
    }
  }, [channel, onClose, t])

  useEffect(() => {
    if (open && channel) {
      void loadFilters()
    } else {
      resetState()
    }
  }, [channel, loadFilters, open, resetState])

  if (!channel) {
    return null
  }

  const handleFieldChange = (
    filterId: string,
    field: keyof EditableFilter,
    value: EditableFilter[typeof field],
  ) => {
    setFilters((prev) =>
      prev.map((filter) =>
        filter.id === filterId
          ? {
              ...filter,
              [field]: value,
              updatedAt: Date.now(),
            }
          : filter,
      ),
    )
  }

  const handleAddFilter = () => {
    const timestamp = Date.now()
    setFilters((prev) => [
      ...prev,
      {
        id: nanoid(),
        name: "",
        description: "",
        pattern: "",
        isRegex: false,
        action: "include",
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])
  }

  const handleRemoveFilter = (filterId: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== filterId))
  }

  const validateFilters = (rules: EditableFilter[]) => {
    for (const filter of rules) {
      if (!filter.name.trim()) {
        return t("filters.messages.validationName")
      }
      if (!filter.pattern.trim()) {
        return t("filters.messages.validationPattern")
      }
      if (filter.isRegex) {
        try {
          new RegExp(filter.pattern.trim())
        } catch (error) {
          return t("filters.messages.validationRegex", {
            error: (error as Error).message,
          })
        }
      }
    }
    return null
  }

  const parseJsonFilters = (rawJson: string): EditableFilter[] => {
    const trimmed = rawJson.trim()
    if (!trimmed) {
      return []
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    }

    if (!Array.isArray(parsed)) {
      throw new Error("JSON must be an array of filter rules")
    }

    const now = Date.now()

    return parsed.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Filter at index ${index} is not an object`)
      }

      const anyItem = item as any
      const name = typeof anyItem.name === "string" ? anyItem.name.trim() : ""
      const pattern =
        typeof anyItem.pattern === "string" ? anyItem.pattern.trim() : ""

      if (!name) {
        throw new Error(`Filter at index ${index} is missing a name`)
      }

      if (!pattern) {
        throw new Error(`Filter at index ${index} is missing a pattern`)
      }

      return {
        id:
          typeof anyItem.id === "string" && anyItem.id.trim()
            ? anyItem.id.trim()
            : nanoid(),
        name,
        description:
          typeof anyItem.description === "string"
            ? anyItem.description
            : anyItem.description ?? "",
        pattern,
        isRegex: Boolean(anyItem.isRegex),
        action: anyItem.action === "exclude" ? "exclude" : "include",
        enabled: anyItem.enabled !== false,
        createdAt:
          typeof anyItem.createdAt === "number" && anyItem.createdAt > 0
            ? anyItem.createdAt
            : now,
        updatedAt:
          typeof anyItem.updatedAt === "number" && anyItem.updatedAt > 0
            ? anyItem.updatedAt
            : now,
      }
    })
  }

  const handleSave = async () => {
    let rulesToSave: EditableFilter[]

    if (viewMode === "json") {
      try {
        rulesToSave = parseJsonFilters(jsonText)
      } catch (error) {
        toast.error(
          t("filters.messages.jsonInvalid", { error: getErrorMessage(error) }),
        )
        return
      }
    } else {
      rulesToSave = filters
    }

    const validationError = validateFilters(rulesToSave)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setIsSaving(true)
    try {
      const payload = rulesToSave.map((filter) => ({
        ...filter,
        name: filter.name.trim(),
        description: filter.description?.trim() || undefined,
        pattern: filter.pattern.trim(),
      }))
      await saveChannelFilters(channel.id, payload)
      setFilters(rulesToSave)
      try {
        setJsonText(JSON.stringify(rulesToSave, null, 2))
      } catch {
        // ignore serialization errors
      }
      toast.success(t("filters.messages.saved"))
      onClose()
    } catch (error) {
      toast.error(
        t("filters.messages.saveFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="lg"
      panelClassName="max-h-[85vh]"
      header={
        <div>
          <p className="text-base font-semibold">{t("filters.title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("filters.subtitle", { channel: channel.name })}
          </p>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("filters.actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} loading={isSaving}>
            {t("filters.actions.save")}
          </Button>
        </div>
      }
    >
      <ChannelFiltersEditor
        filters={filters}
        viewMode={viewMode}
        jsonText={jsonText}
        isLoading={isLoading}
        onAddFilter={handleAddFilter}
        onRemoveFilter={handleRemoveFilter}
        onFieldChange={handleFieldChange}
        onClickViewVisual={() => {
          if (viewMode === "visual") return
          try {
            const parsed = jsonText.trim() ? parseJsonFilters(jsonText) : []
            setFilters(parsed)
            setViewMode("visual")
          } catch (error) {
            toast.error(
              t("filters.messages.jsonInvalid", {
                error: getErrorMessage(error),
              }),
            )
          }
        }}
        onClickViewJson={() => {
          if (viewMode === "json") return
          try {
            setJsonText(JSON.stringify(filters, null, 2))
          } catch {
            setJsonText("")
          }
          setViewMode("json")
        }}
        onChangeJsonText={setJsonText}
      />
    </Modal>
  )
}
