import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import type { EditableFilterField } from "~/components/ChannelFiltersEditor"
import { Modal } from "~/components/ui"
import { Button } from "~/components/ui/button"
import { normalizeChannelFilters } from "~/services/managedSites/channelModelFilterRules"
import { resolveApiVerificationTypeForChannelType } from "~/services/models/modelSync/channelModelFilterEvaluator"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { isProbeChannelModelFilterRule } from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"

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
  const probeRulesSupported = Boolean(
    resolveApiVerificationTypeForChannelType(channel.type),
  )

  const handleFieldChange = (
    filterId: string,
    field: EditableFilterField,
    value: any,
  ) => {
    setFilters((prev) =>
      prev.map((filter) => {
        if (filter.id !== filterId) {
          return filter
        }

        if (field === "kind") {
          if (value === "probe") {
            return {
              id: filter.id,
              name: filter.name,
              description: filter.description,
              kind: "probe",
              probeIds: ["text-generation"],
              match: "all",
              action: filter.action,
              enabled: filter.enabled,
              createdAt: filter.createdAt,
              updatedAt: Date.now(),
            }
          }

          return {
            id: filter.id,
            name: filter.name,
            description: filter.description,
            kind: "pattern",
            pattern: "",
            isRegex: false,
            action: filter.action,
            enabled: filter.enabled,
            createdAt: filter.createdAt,
            updatedAt: Date.now(),
          }
        }

        return {
          ...filter,
          [field]: value,
          updatedAt: Date.now(),
        }
      }),
    )
  }

  const handleAddFilter = (kind: "pattern" | "probe" = "pattern") => {
    const timestamp = Date.now()
    const base = {
      id: safeRandomUUID("channel-filter"),
      name: "",
      description: "",
      action: "include" as const,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    setFilters((prev) => [
      ...prev,
      kind === "probe"
        ? {
            ...base,
            kind: "probe",
            probeIds: ["text-generation"],
            match: "all",
          }
        : {
            ...base,
            kind: "pattern",
            pattern: "",
            isRegex: false,
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
      if (isProbeChannelModelFilterRule(filter)) {
        if (filter.probeIds.length === 0) {
          return t("filters.messages.validationProbeIds")
        }
        continue
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
      throw new Error(t("filters.messages.jsonArrayRequired"))
    }

    parsed.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(t("filters.messages.jsonItemNotObject", { index }))
      }
    })

    return normalizeChannelFilters(parsed as any[], {
      idPrefix: "channel-filter",
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
        probeRulesSupported={probeRulesSupported}
        probeRulesUnsupportedMessage={t("filters.hints.unsupportedChannelType")}
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
