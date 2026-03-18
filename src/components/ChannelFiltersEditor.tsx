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
import type {
  ChannelFilterProbeId,
  ChannelFilterRuleType,
  ChannelModelFilterRule,
} from "~/types/channelModelFilters"

export type EditableFilter = ChannelModelFilterRule

interface ChannelFiltersEditorProps {
  filters: EditableFilter[]
  viewMode: "visual" | "json"
  jsonText: string
  isLoading?: boolean
  /**
   * When true, probe rules hide apiType/baseUrl/apiKey fields and show a hint
   * that credentials will be sourced from each channel's verificationCredentials.
   */
  isGlobalFilter?: boolean
  onAddFilter: (ruleType: ChannelFilterRuleType) => void
  onRemoveFilter: (id: string) => void
  onFieldChange: (id: string, field: keyof EditableFilter, value: any) => void
  onClickViewVisual: () => void
  onClickViewJson: () => void
  onChangeJsonText: (value: string) => void
}

const PROBE_IDS: ChannelFilterProbeId[] = [
  "models",
  "text-generation",
  "tool-calling",
  "structured-output",
  "web-search",
]

/**
 * Editor for New API channel filtering rules supporting visual and JSON modes.
 * Provides UX to add/remove rules, toggle regex behavior, and edit raw JSON definitions.
 * @param props Component props bundle.
 * @param props.filters Array of editable filter rules rendered in visual mode.
 * @param props.viewMode Visual or JSON editing mode flag.
 * @param props.jsonText Raw JSON string for manual editing.
 * @param props.isLoading Whether filter data is still loading.
 * @param props.onAddFilter Handler invoked when user adds a rule.
 * @param props.onRemoveFilter Handler to delete a rule by id.
 * @param props.onFieldChange Field update callback for rule edits.
 * @param props.onClickViewVisual Switcher handler for the visual view.
 * @param props.onClickViewJson Switcher handler for the JSON view.
 * @param props.onChangeJsonText Controlled change handler for JSON textarea.
 * @returns Visual or JSON editing surface depending on selected view mode.
 */
export default function ChannelFiltersEditor(props: ChannelFiltersEditorProps) {
  const {
    filters,
    viewMode,
    jsonText,
    isLoading,
    isGlobalFilter = false,
    onAddFilter,
    onRemoveFilter,
    onFieldChange,
    onClickViewVisual,
    onClickViewJson,
    onChangeJsonText,
  } = props
  const { t } = useTranslation("managedSiteChannels")
  const [showAddRuleMenu, setShowAddRuleMenu] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[160px] items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("filters.loading")}
      </div>
    )
  }

  const handleAddRule = (ruleType: ChannelFilterRuleType) => {
    onAddFilter(ruleType)
    setShowAddRuleMenu(false)
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
            <div className="relative inline-block">
              <Button onClick={() => setShowAddRuleMenu(!showAddRuleMenu)}>
                {t("filters.addRule")}
              </Button>
              {showAddRuleMenu && (
                <div className="bg-popover border-border absolute left-0 top-full z-10 mt-2 w-48 rounded-lg border shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleAddRule("pattern")}
                    className="hover:bg-accent w-full px-4 py-2 text-left text-sm"
                  >
                    {t("filters.ruleTypes.pattern")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRule("probe")}
                    className="hover:bg-accent w-full px-4 py-2 text-left text-sm"
                  >
                    {t("filters.ruleTypes.probe")}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {filters.map((filter) => (
              <FilterRuleCard
                key={filter.id}
                filter={filter}
                isGlobalFilter={isGlobalFilter}
                onFieldChange={onFieldChange}
                onRemoveFilter={onRemoveFilter}
              />
            ))}

            <div className="relative inline-block">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddRuleMenu(!showAddRuleMenu)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {t("filters.addRule")}
              </Button>
              {showAddRuleMenu && (
                <div className="bg-popover border-border absolute left-0 top-full z-10 mt-2 w-48 rounded-lg border shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleAddRule("pattern")}
                    className="hover:bg-accent w-full px-4 py-2 text-left text-sm"
                  >
                    {t("filters.ruleTypes.pattern")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRule("probe")}
                    className="hover:bg-accent w-full px-4 py-2 text-left text-sm"
                  >
                    {t("filters.ruleTypes.probe")}
                  </button>
                </div>
              )}
            </div>
          </>
        )
      ) : (
        <div className="space-y-2">
          <Label>{t("filters.jsonEditor.label")}</Label>
          <Textarea
            value={jsonText}
            onChange={(event) => onChangeJsonText(event.target.value)}
            placeholder={t("filters.jsonEditor.placeholder")}
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

interface FilterRuleCardProps {
  filter: EditableFilter
  isGlobalFilter?: boolean
  onFieldChange: (id: string, field: keyof EditableFilter, value: any) => void
  onRemoveFilter: (id: string) => void
}

function FilterRuleCard({
  filter,
  isGlobalFilter = false,
  onFieldChange,
  onRemoveFilter,
}: FilterRuleCardProps) {
  const { t } = useTranslation("managedSiteChannels")

  const ruleType = filter.ruleType || "pattern"

  return (
    <div className="border-border space-y-5 rounded-lg border p-5">
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
            aria-label={t("filters.labels.delete")}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("filters.labels.ruleType")}</Label>
        <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">
          {ruleType === "pattern"
            ? t("filters.ruleTypes.pattern")
            : t("filters.ruleTypes.probe")}
        </div>
      </div>

      {ruleType === "pattern" ? (
        <>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label>{t("filters.labels.pattern")}</Label>
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span>{t("filters.labels.regex")}</span>
                  <Switch
                    size={"sm"}
                    id={`filter-regex-${filter.id}`}
                    checked={filter.isRegex ?? false}
                    onChange={(value: boolean) =>
                      onFieldChange(filter.id, "isRegex", value)
                    }
                  />
                </div>
              </div>
              <Input
                value={filter.pattern ?? ""}
                onChange={(event) =>
                  onFieldChange(filter.id, "pattern", event.target.value)
                }
                placeholder={t("filters.placeholders.pattern")}
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
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("filters.labels.probeType")}</Label>
              <Select
                value={filter.probeId ?? ""}
                onValueChange={(value: ChannelFilterProbeId) =>
                  onFieldChange(filter.id, "probeId", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.labels.probeType")} />
                </SelectTrigger>
                <SelectContent>
                  {PROBE_IDS.map((probeId) => (
                    <SelectItem key={probeId} value={probeId}>
                      {t(`filters.probeTypes.${probeId}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="bg-muted text-muted-foreground rounded-lg p-3 text-xs">
            {isGlobalFilter
              ? t("filters.hints.globalProbeCredentials")
              : t("filters.hints.probeCredentialsFromChannel")}
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 rounded-lg p-3 text-xs">
            {t("filters.hints.probePerformance")}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>{t("filters.labels.description")}</Label>
        <Textarea
          value={filter.description ?? ""}
          onChange={(event) =>
            onFieldChange(filter.id, "description", event.target.value)
          }
          placeholder={t("filters.placeholders.description")}
          rows={2}
        />
      </div>
    </div>
  )
}
