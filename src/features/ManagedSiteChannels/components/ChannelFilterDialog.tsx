import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import { Modal } from "~/components/ui"
import { Button } from "~/components/ui/button"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import type { VerificationCredentials } from "~/types/channelConfig"
import type {
  ChannelFilterRuleType,
  ChannelModelFilterRule,
} from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/core/error"

import type { ChannelRow } from "../types"
import { saveChannelFilters } from "../utils/channelFilters"
import VerificationCredentialsEditor from "./VerificationCredentialsEditor"

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
  const [verificationCredentials, setVerificationCredentials] =
    useState<VerificationCredentials>()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual")

  const resetState = useCallback(() => {
    setFilters([])
    setVerificationCredentials(undefined)
    setIsLoading(false)
    setIsSaving(false)
    setJsonText("")
    setViewMode("visual")
  }, [])

  const loadFilters = useCallback(async () => {
    if (!channel) return
    setIsLoading(true)
    try {
      const channelConfig = await channelConfigStorage.getConfig(channel.id)
      const loadedFilters = channelConfig.modelFilterSettings.rules
      setFilters(loadedFilters)
      setVerificationCredentials(channelConfig.verificationCredentials)
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

  const handleAddFilter = (ruleType: ChannelFilterRuleType) => {
    const timestamp = Date.now()
    const baseRule = {
      id: nanoid(),
      ruleType,
      name: "",
      description: "",
      action: "include" as const,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    if (ruleType === "pattern") {
      setFilters((prev) => [
        ...prev,
        {
          ...baseRule,
          pattern: "",
          isRegex: false,
        },
      ])
    } else {
      setFilters((prev) => [
        ...prev,
        {
          ...baseRule,
          probeId: undefined,
          apiType: undefined,
          verificationBaseUrl: undefined,
          verificationApiKey: undefined,
        },
      ])
    }
  }

  const handleRemoveFilter = (filterId: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== filterId))
  }

  const validateFilters = (rules: EditableFilter[]) => {
    for (const filter of rules) {
      if (!filter.name.trim()) {
        return t("filters.messages.validationName")
      }

      const ruleType = filter.ruleType || "pattern"

      if (ruleType === "pattern") {
        if (!filter.pattern?.trim()) {
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
      } else if (ruleType === "probe") {
        if (!filter.probeId) {
          return t("filters.messages.validationProbeId")
        }
        if (!filter.apiType) {
          return t("filters.messages.validationApiType")
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
      const ruleType = anyItem.ruleType || "pattern"

      if (!name) {
        throw new Error(`Filter at index ${index} is missing a name`)
      }

      const action: "include" | "exclude" =
        anyItem.action === "exclude" ? "exclude" : "include"

      const baseRule = {
        id:
          typeof anyItem.id === "string" && anyItem.id.trim()
            ? anyItem.id.trim()
            : nanoid(),
        ruleType,
        name,
        description:
          typeof anyItem.description === "string"
            ? anyItem.description
            : anyItem.description ?? "",
        action,
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

      if (ruleType === "pattern") {
        const pattern =
          typeof anyItem.pattern === "string" ? anyItem.pattern.trim() : ""
        if (!pattern) {
          throw new Error(`Filter at index ${index} is missing a pattern`)
        }
        return {
          ...baseRule,
          pattern,
          isRegex: Boolean(anyItem.isRegex),
        } as ChannelModelFilterRule
      }

      if (ruleType === "probe") {
        return {
          ...baseRule,
          probeId: anyItem.probeId,
          apiType: anyItem.apiType,
          verificationBaseUrl: anyItem.verificationBaseUrl,
          verificationApiKey: anyItem.verificationApiKey,
        } as ChannelModelFilterRule
      }

      throw new Error(`Unknown rule type at index ${index}: ${ruleType}`)
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
      const payload = rulesToSave.map((filter) => {
        const ruleType = filter.ruleType || "pattern"
        const base = {
          ...filter,
          name: filter.name.trim(),
          description: filter.description?.trim() || undefined,
        }

        if (ruleType === "pattern") {
          return {
            ...base,
            pattern: filter.pattern?.trim() || "",
          }
        }

        return base
      })

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

  const handleSaveVerificationCredentials = async (
    credentials: VerificationCredentials,
  ) => {
    if (!channel) return

    try {
      const success = await channelConfigStorage.upsertVerificationCredentials(
        channel.id,
        credentials,
      )

      if (success) {
        setVerificationCredentials(credentials)
        toast.success(t("filters.verificationCredentials.messages.saved"))
      } else {
        throw new Error("Failed to save verification credentials")
      }
    } catch (error) {
      toast.error(
        t("filters.verificationCredentials.messages.saveFailed", {
          error: getErrorMessage(error),
        }),
      )
      throw error
    }
  }

  const handleClearVerificationCredentials = async () => {
    if (!channel) return

    try {
      const success = await channelConfigStorage.clearVerificationCredentials(
        channel.id,
      )

      if (success) {
        setVerificationCredentials(undefined)
        toast.success(t("filters.verificationCredentials.messages.cleared"))
      } else {
        throw new Error("Failed to clear verification credentials")
      }
    } catch (error) {
      toast.error(
        t("filters.verificationCredentials.messages.clearFailed", {
          error: getErrorMessage(error),
        }),
      )
      throw error
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
      <div className="space-y-6">
        <VerificationCredentialsEditor
          credentials={verificationCredentials}
          onSave={handleSaveVerificationCredentials}
          onClear={handleClearVerificationCredentials}
          isSaving={isSaving}
        />

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
      </div>
    </Modal>
  )
}
