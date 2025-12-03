import { Loader2, Plus, Settings2, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Input, Textarea } from "~/components/ui"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/Switch"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"

export type EditableFilter = ChannelModelFilterRule

interface ChannelFiltersEditorProps {
  filters: EditableFilter[]
  viewMode: "visual" | "json"
  jsonText: string
  isLoading?: boolean
  onAddFilter: () => void
  onRemoveFilter: (id: string) => void
  onFieldChange: (id: string, field: keyof EditableFilter, value: any) => void
  onClickViewVisual: () => void
  onClickViewJson: () => void
  onChangeJsonText: (value: string) => void
}

export default function ChannelFiltersEditor({
  filters,
  viewMode,
  jsonText,
  isLoading,
  onAddFilter,
  onRemoveFilter,
  onFieldChange,
  onClickViewVisual,
  onClickViewJson,
  onChangeJsonText,
}: ChannelFiltersEditorProps) {
  const { t } = useTranslation("newApiChannels")

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[160px] items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("filters.loading")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-xs font-medium">
          {t("filters.viewMode.label")}
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "visual" ? "secondary" : "ghost"}
            onClick={onClickViewVisual}
          >
            {t("filters.viewMode.visual")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "json" ? "secondary" : "ghost"}
            onClick={onClickViewJson}
          >
            {t("filters.viewMode.json")}
          </Button>
        </div>
      </div>

      {viewMode === "visual" ? (
        !filters.length ? (
          <div className="text-center">
            <div className="bg-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <Settings2 className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-base font-semibold">
              {t("filters.empty.title")}
            </p>
            <p className="text-muted-foreground mb-6 text-sm">
              {t("filters.empty.description")}
            </p>
            <Button onClick={onAddFilter}>{t("filters.addRule")}</Button>
          </div>
        ) : (
          <>
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="border-border space-y-5 rounded-lg border p-5"
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>{t("filters.labels.name")}</Label>
                    <Input
                      value={filter.name}
                      onChange={(event) =>
                        onFieldChange(filter.id, "name", event.target.value)
                      }
                      placeholder={t("filters.placeholders.name")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("filters.labels.enabled")}</Label>
                    <div className="border-input flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {filter.enabled
                          ? t("common:status.enabled")
                          : t("common:status.disabled")}
                      </span>
                      <Switch
                        id={`filter-enabled-${filter.id}`}
                        checked={filter.enabled}
                        onChange={(value: boolean) =>
                          onFieldChange(filter.id, "enabled", value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => onRemoveFilter(filter.id)}
                      aria-label={t("filters.labels.delete") ?? "Delete"}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label>{t("filters.labels.pattern")}</Label>
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <span>{t("filters.labels.regex")}</span>
                        <Switch
                          size={"sm"}
                          id={`filter-regex-${filter.id}`}
                          checked={filter.isRegex}
                          onChange={(value: boolean) =>
                            onFieldChange(filter.id, "isRegex", value)
                          }
                        />
                      </div>
                    </div>
                    <Input
                      value={filter.pattern}
                      onChange={(event) =>
                        onFieldChange(filter.id, "pattern", event.target.value)
                      }
                      placeholder={t("filters.placeholders.pattern") ?? ""}
                    />
                    <p className="text-muted-foreground text-xs">
                      {filter.isRegex
                        ? t("filters.hints.regex")
                        : t("filters.hints.substring")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("filters.labels.action")}</Label>
                    <Select
                      value={filter.action}
                      onValueChange={(value: "include" | "exclude") =>
                        onFieldChange(filter.id, "action", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="include">
                          {t("filters.actionOptions.include")}
                        </SelectItem>
                        <SelectItem value="exclude">
                          {t("filters.actionOptions.exclude")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("filters.labels.description")}</Label>
                  <Textarea
                    value={filter.description ?? ""}
                    onChange={(event) =>
                      onFieldChange(
                        filter.id,
                        "description",
                        event.target.value,
                      )
                    }
                    placeholder={t("filters.placeholders.description") ?? ""}
                    rows={2}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={onAddFilter}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("filters.addRule")}
            </Button>
          </>
        )
      ) : (
        <div className="space-y-2">
          <Label>{t("filters.jsonEditor.label")}</Label>
          <Textarea
            value={jsonText}
            onChange={(event) => onChangeJsonText(event.target.value)}
            placeholder={t("filters.jsonEditor.placeholder") ?? ""}
            rows={10}
          />
          <p className="text-muted-foreground text-xs">
            {t("filters.jsonEditor.hint")}
          </p>
        </div>
      )}
    </div>
  )
}
