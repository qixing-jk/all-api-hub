import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import {
  normalizeChannelFilters,
  type IncomingChannelFilter,
} from "~/services/managedSites/channelModelFilterRules"
import {
  CHANNEL_FILTER_ACTIONS,
  CHANNEL_FILTER_EDITOR_VIEW_MODES,
  CHANNEL_MODEL_FILTER_RULE_KINDS,
  CHANNEL_MODEL_PROBE_FILTER_MATCH_MODES,
  DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS,
  isProbeChannelModelFilterRule,
  type ChannelFilterEditorViewMode,
  type ChannelModelFilterRule,
  type ChannelModelFilterRuleKind,
  type EditableFilterField,
} from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"

type EditableFilter = ChannelModelFilterRule

/**
 * Moves a filter one position up or down within the editable filter list.
 */
function moveFilterById(
  filters: EditableFilter[],
  filterId: string,
  direction: "up" | "down",
) {
  const index = filters.findIndex((filter) => filter.id === filterId)
  if (index < 0) {
    return filters
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= filters.length) {
    return filters
  }

  const next = [...filters]
  const current = next[index]
  const target = next[targetIndex]
  if (current === undefined || target === undefined) return filters
  next[index] = target
  next[targetIndex] = current
  return next
}

/** Owns the common visual/JSON draft and filter editing rules; callers own persistence. */
export function useChannelFilterEditor(idPrefix: string) {
  const { t } = useTranslation("managedSiteChannels")
  const [filters, setFilters] = useState<EditableFilter[]>([])
  const [jsonText, setJsonText] = useState("")
  const [viewMode, setViewMode] = useState<ChannelFilterEditorViewMode>(
    CHANNEL_FILTER_EDITOR_VIEW_MODES.Visual,
  )
  const handleFieldChange = useCallback(
    (filterId: string, field: EditableFilterField, value: unknown) => {
      setFilters((prev) =>
        prev.map((filter) => {
          if (filter.id !== filterId) {
            return filter
          }

          if (field === "kind") {
            if (value === CHANNEL_MODEL_FILTER_RULE_KINDS.Probe) {
              return {
                id: filter.id,
                name: filter.name,
                description: filter.description,
                kind: CHANNEL_MODEL_FILTER_RULE_KINDS.Probe,
                probeIds: [...DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS],
                match: CHANNEL_MODEL_PROBE_FILTER_MATCH_MODES.All,
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
              kind: CHANNEL_MODEL_FILTER_RULE_KINDS.Pattern,
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
    },
    [],
  )

  const handleAddFilter = useCallback(
    (
      kind: ChannelModelFilterRuleKind = CHANNEL_MODEL_FILTER_RULE_KINDS.Pattern,
    ) => {
      const timestamp = Date.now()
      const base = {
        id: safeRandomUUID(idPrefix),
        name: "",
        description: "",
        action: CHANNEL_FILTER_ACTIONS.Include,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      setFilters((prev) => [
        ...prev,
        kind === CHANNEL_MODEL_FILTER_RULE_KINDS.Probe
          ? {
              ...base,
              kind: CHANNEL_MODEL_FILTER_RULE_KINDS.Probe,
              probeIds: [...DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS],
              match: CHANNEL_MODEL_PROBE_FILTER_MATCH_MODES.All,
            }
          : {
              ...base,
              kind: CHANNEL_MODEL_FILTER_RULE_KINDS.Pattern,
              pattern: "",
              isRegex: false,
            },
      ])
    },
    [idPrefix],
  )

  const handleRemoveFilter = useCallback((filterId: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== filterId))
  }, [])

  const handleMoveFilter = useCallback(
    (filterId: string, direction: "up" | "down") => {
      setFilters((prev) => moveFilterById(prev, filterId, direction))
    },
    [],
  )

  const validateFilters = useCallback(
    (rules: EditableFilter[]) => {
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
    },
    [t],
  )

  const parseJsonFilters = useCallback(
    (rawJson: string): EditableFilter[] => {
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

      return normalizeChannelFilters(parsed as IncomingChannelFilter[], {
        idPrefix,
      })
    },
    [idPrefix, t],
  )

  const resetEditor = useCallback(
    (nextFilters: EditableFilter[], initialJsonText?: string) => {
      setFilters(nextFilters)
      try {
        setJsonText(initialJsonText ?? JSON.stringify(nextFilters, null, 2))
      } catch {
        setJsonText("")
      }
      setViewMode(CHANNEL_FILTER_EDITOR_VIEW_MODES.Visual)
    },
    [],
  )

  const showVisual = useCallback(() => {
    if (viewMode === CHANNEL_FILTER_EDITOR_VIEW_MODES.Visual) return
    try {
      setFilters(jsonText.trim() ? parseJsonFilters(jsonText) : [])
      setViewMode(CHANNEL_FILTER_EDITOR_VIEW_MODES.Visual)
    } catch (error) {
      toast.error(
        t("filters.messages.jsonInvalid", { error: getErrorMessage(error) }),
      )
    }
  }, [jsonText, parseJsonFilters, t, viewMode])

  const showJson = useCallback(() => {
    if (viewMode === CHANNEL_FILTER_EDITOR_VIEW_MODES.Json) return
    try {
      setJsonText(JSON.stringify(filters, null, 2))
    } catch {
      setJsonText("")
    }
    setViewMode(CHANNEL_FILTER_EDITOR_VIEW_MODES.Json)
  }, [filters, viewMode])
  return {
    filters,
    setFilters,
    jsonText,
    setJsonText,
    viewMode,
    resetEditor,
    handleFieldChange,
    handleAddFilter,
    handleRemoveFilter,
    handleMoveFilter,
    validateFilters,
    parseJsonFilters,
    showVisual,
    showJson,
  }
}
