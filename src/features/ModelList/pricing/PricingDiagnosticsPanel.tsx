import { Bug, ChevronDown, ChevronUp, X } from "lucide-react"
import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
} from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui"
import { ModelPricingSchedule } from "~/features/ModelList/presentation/ModelItem/ModelPricingSchedule"
import { PricingConditionDetails } from "~/features/ModelList/pricing/PricingConditionDetails"
import {
  buildPricingDiagnostics,
  PRICING_DIAGNOSTIC_STATUSES,
  summarizePricingDiagnostics,
} from "~/features/ModelList/pricing/pricingDiagnostics"
import {
  getPricingDiagnosticIssueLabel,
  groupPricingDiagnosticRows,
  matchesPricingDiagnosticSearch,
  PRICING_DIAGNOSTIC_GROUPINGS,
  type PricingDiagnosticGrouping,
  type PricingDiagnosticRow,
} from "~/features/ModelList/pricing/pricingDiagnosticView"
import toast from "~/lib/notify"
import { isDevelopmentMode } from "~/utils/core/environment"

const DIAGNOSTIC_FILTERS = { ISSUES: "issues", ALL: "all" } as const
const COPY_SCOPES = {
  FILTERED: "filtered",
  FULL: "full",
  RECORD: "record",
} as const

type Props = {
  models: Parameters<typeof buildPricingDiagnostics>[0]
  onLocate: (model: string) => void
}

/** Development-only inspection of the prices and quotes already loaded by Model List. */
export function PricingDiagnostics(props: Props) {
  return isDevelopmentMode() ? <DiagnosticsPanel {...props} /> : null
}

/** Summarizes loaded pricing and reveals compact records in a bounded scroll region. */
function DiagnosticsPanel({ models, onLocate }: Props) {
  const { t } = useTranslation("modelList")
  const id = useId()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<string>(DIAGNOSTIC_FILTERS.ALL)
  const [search, setSearch] = useState("")
  const [grouping, setGrouping] = useState<PricingDiagnosticGrouping>(
    PRICING_DIAGNOSTIC_GROUPINGS.NONE,
  )
  const report = useMemo(() => buildPricingDiagnostics(models), [models])
  const [selectedKey, setSelectedKey] = useState<string>()
  const [groupKey, setGroupKey] = useState<string>()
  const rowKeys = useMemo(
    () =>
      new Map(
        report.rows.map((row, index) => {
          const item = models[index]!
          const source =
            item.source.kind === "account"
              ? item.source.account
              : item.source.profile
          return [
            row,
            JSON.stringify([item.source.kind, source.id, row.model, row.group]),
          ] as const
        }),
      ),
    [models, report],
  )
  const selected = report.rows.find((row) => rowKeys.get(row) === selectedKey)
  const effectiveFilter =
    filter.startsWith("code:") &&
    !report.issueCounts.some((issue) => `code:${issue.code}` === filter)
      ? DIAGNOSTIC_FILTERS.ISSUES
      : filter
  const query = search.trim().toLowerCase()
  const matchingRows = report.rows.filter(
    (row) =>
      (effectiveFilter === DIAGNOSTIC_FILTERS.ALL ||
        (effectiveFilter === DIAGNOSTIC_FILTERS.ISSUES
          ? row.issues.length > 0
          : row.issues.some(
              (issue) => `code:${issue.code}` === effectiveFilter,
            ))) &&
      matchesPricingDiagnosticSearch(row, query),
  )

  const groups = groupPricingDiagnosticRows(matchingRows, grouping)
  const rows =
    groups.find((group) => group.key === groupKey)?.rows ?? matchingRows
  const copy = async (
    scope: (typeof COPY_SCOPES)[keyof typeof COPY_SCOPES],
  ) => {
    try {
      const exportedRows =
        scope === COPY_SCOPES.RECORD && selected ? [selected] : rows
      await navigator.clipboard.writeText(
        JSON.stringify(
          scope === COPY_SCOPES.FULL
            ? report
            : {
                ...report,
                scope:
                  scope === COPY_SCOPES.RECORD
                    ? "selected-diagnostic"
                    : "filtered-diagnostics",
                ...summarizePricingDiagnostics(exportedRows),
                rows: exportedRows,
              },
          null,
          2,
        ),
      )
      toast.success(
        scope === COPY_SCOPES.FILTERED
          ? t("diagnostics.copiedFiltered")
          : t("diagnostics.copied"),
      )
    } catch {
      toast.error(t("diagnostics.copyFailed"))
    }
  }

  return (
    <section className="bg-card my-density-4 overflow-hidden rounded-lg border text-sm">
      <div className="bg-muted/30 gap-y-density-3 flex flex-wrap items-center justify-between gap-x-4 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen(!open)
          }}
        >
          <Bug className="mr-2 size-4" aria-hidden="true" />
          {t("diagnostics.title")}
          {open ? (
            <ChevronUp className="ml-2 size-4" aria-hidden />
          ) : (
            <ChevronDown className="ml-2 size-4" aria-hidden />
          )}
        </Button>
        <p className="text-muted-foreground order-3 w-full text-xs sm:order-none sm:w-auto">
          {t("diagnostics.overview", {
            total: report.summary.total,
            published: report.summary.published,
            quoted: report.summary.quoted,
            attention: report.summary.attention,
          })}
        </p>
        {report.summary.attention > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(true)
              setFilter(DIAGNOSTIC_FILTERS.ISSUES)
              setGroupKey(undefined)
            }}
          >
            {t("diagnostics.attention", { value: report.summary.attention })}
          </Button>
        )}
      </div>
      {open && (
        <div id={id} className="space-y-density-4 border-t px-4 py-4">
          <div className="flex items-center gap-2">
            <Input
              containerClassName="min-w-0 flex-1"
              aria-label={t("diagnostics.search")}
              placeholder={t("diagnostics.searchHint")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
              }}
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("diagnostics.clearSearch")}
                onClick={() => {
                  setSearch("")
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-density-1-5 min-w-0">
              <Label htmlFor={`${id}-grouping`} className="text-xs">
                {t("diagnostics.groupBy")}
              </Label>
              <Select
                value={grouping}
                onValueChange={(value: PricingDiagnosticGrouping) => {
                  setGrouping(value)
                  setGroupKey(undefined)
                }}
              >
                <SelectTrigger
                  id={`${id}-grouping`}
                  aria-label={t("diagnostics.groupBy")}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN}>
                    {t("diagnostics.byOrigin")}
                  </SelectItem>
                  <SelectItem value={PRICING_DIAGNOSTIC_GROUPINGS.GROUP}>
                    {t("diagnostics.byGroup")}
                  </SelectItem>
                  <SelectItem value={PRICING_DIAGNOSTIC_GROUPINGS.NONE}>
                    {t("diagnostics.flat")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-density-1-5 min-w-0">
              <Label htmlFor={`${id}-filter`} className="text-xs">
                {t("diagnostics.filter")}
              </Label>
              <Select
                value={effectiveFilter}
                onValueChange={(value) => {
                  setFilter(value)
                }}
              >
                <SelectTrigger
                  id={`${id}-filter`}
                  aria-label={t("diagnostics.filter")}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIAGNOSTIC_FILTERS.ISSUES}>
                    {t("diagnostics.issuesOnly")}
                  </SelectItem>
                  <SelectItem value={DIAGNOSTIC_FILTERS.ALL}>
                    {t("diagnostics.all")}
                  </SelectItem>
                  {report.issueCounts.map(({ code, count }) => (
                    <SelectItem key={code} value={`code:${code}`}>
                      {getPricingDiagnosticIssueLabel(code, t)} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span
              className="text-muted-foreground text-xs sm:col-span-2"
              aria-live="polite"
            >
              {t("diagnostics.matched", {
                records: rows.length,
                models: new Set(rows.map((row) => row.model)).size,
              })}
            </span>
          </div>
          {rows.length === 0 && <p>{t("diagnostics.empty")}</p>}
          {grouping !== PRICING_DIAGNOSTIC_GROUPINGS.NONE &&
            groups.length > 1 && (
              <div className="gap-density-2 flex max-h-24 flex-wrap overflow-auto">
                {groups.map((group) => (
                  <Button
                    key={group.key}
                    variant={groupKey === group.key ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={groupKey === group.key}
                    onClick={() => {
                      setGroupKey(
                        groupKey === group.key ? undefined : group.key,
                      )
                    }}
                  >
                    {group.label ??
                      t(
                        grouping === PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN
                          ? "diagnostics.noOrigin"
                          : "diagnostics.noGroup",
                      )}{" "}
                    ({group.rows.length})
                  </Button>
                ))}
              </div>
            )}
          {rows.length > 0 && (
            <Virtuoso
              key={`${effectiveFilter}:${query}:${grouping}:${groupKey ?? "all"}`}
              role="region"
              tabIndex={0}
              aria-label={t("diagnostics.results")}
              style={{ height: `min(24rem, ${rows.length * 84}px, 50vh)` }}
              className="rounded-md border"
              data={rows}
              initialItemCount={Math.min(10, rows.length)}
              components={{
                List: DiagnosticRowsList,
                Item: DiagnosticRowsItem,
              }}
              itemContent={(_, row) => (
                <div className="gap-density-2 flex items-center px-3 py-2">
                  <button
                    type="button"
                    aria-label={`${t("diagnostics.inspect")}: ${row.model}`}
                    className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={() => {
                      setSelectedKey(rowKeys.get(row))
                    }}
                  >
                    <div className="gap-density-2 flex flex-wrap items-center">
                      <strong
                        className="min-w-0 truncate font-mono text-xs"
                        title={row.model}
                      >
                        {row.displayName ?? row.model}
                      </strong>
                      <DiagnosticStatus row={row} />
                    </div>
                    <p
                      className="text-muted-foreground mt-density-1 truncate text-xs"
                      title={[row.source.name, row.source.origin, row.group]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {[row.source.name, row.source.origin, row.group]
                        .filter(Boolean)
                        .join(" · ")}{" "}
                      · {row.unit}
                    </p>
                    {row.issues.length > 0 && (
                      <p
                        className="text-muted-foreground mt-density-1 truncate font-mono text-xs"
                        title={row.issues
                          .map((issue) =>
                            issue.meter
                              ? `${issue.code}:${issue.meter}`
                              : issue.code,
                          )
                          .join(" · ")}
                      >
                        {getPricingDiagnosticIssueLabel(row.issues[0]!.code, t)}
                        {row.issues[0]!.meter ? `:${row.issues[0]!.meter}` : ""}
                        {row.issues.length > 1
                          ? ` +${row.issues.length - 1}`
                          : ""}
                      </p>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onLocate(row.model)}
                  >
                    {t("diagnostics.locate")}
                  </Button>
                </div>
              )}
            />
          )}
          <div className="space-y-density-3 border-t pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!rows.length}
                onClick={() => copy(COPY_SCOPES.FILTERED)}
              >
                {t("diagnostics.copyFiltered")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(COPY_SCOPES.FULL)}
              >
                {t("diagnostics.copy")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("diagnostics.scope")}
            </p>
          </div>
        </div>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) {
            setSelectedKey(undefined)
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 font-mono text-sm break-all">
                  {selected.model}
                </SheetTitle>
                <SheetDescription>
                  {[
                    selected.source.name,
                    selected.source.origin,
                    selected.group,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-density-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-sm">
                <div className="gap-density-2 flex flex-wrap items-center">
                  <DiagnosticStatus row={selected} />
                  <code>{selected.unit}</code>
                </div>
                <div className="gap-density-2 flex flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedKey(undefined)
                      onLocate(selected.model)
                    }}
                  >
                    {t("diagnostics.locate")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(COPY_SCOPES.RECORD)}
                  >
                    {t("diagnostics.copyRecord")}
                  </Button>
                </div>
                <div className="gap-density-2 flex flex-wrap">
                  {selected.issues.map((issue, index) => (
                    <div
                      key={index}
                      className="bg-muted rounded px-1 text-xs break-all"
                    >
                      {getPricingDiagnosticIssueLabel(issue.code, t) !==
                        issue.code && (
                        <p>{getPricingDiagnosticIssueLabel(issue.code, t)}</p>
                      )}
                      <code>
                        {issue.code}
                        {issue.meter ? `:${issue.meter}` : ""}
                      </code>
                    </div>
                  ))}
                </div>
                <PricingConditionDetails
                  details={selected.conditionDetails}
                  requirements={selected.requirementDetails}
                  issues={selected.issues}
                />
                {selected.publishedPricing && (
                  <ModelPricingSchedule
                    schedule={selected.publishedPricing.schedule}
                    source={selected.publishedPricing.source}
                  />
                )}
                <details>
                  <summary className="text-link cursor-pointer text-xs">
                    {t("diagnostics.inspect")}
                  </summary>
                  <pre className="bg-muted mt-density-2 max-h-96 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

/** Labels publication separately from scenario-quote status. */
function DiagnosticStatus({ row }: { row: PricingDiagnosticRow }) {
  const { t } = useTranslation("modelList")
  const labels: Record<PricingDiagnosticRow["status"], string> = {
    [PRICING_DIAGNOSTIC_STATUSES.PUBLISHED]: t("diagnostics.status.published"),
    [PRICING_DIAGNOSTIC_STATUSES.REFERENCE]: t("diagnostics.status.reference"),
    [PRICING_DIAGNOSTIC_STATUSES.COMPLETE]: t("diagnostics.status.complete"),
    [PRICING_DIAGNOSTIC_STATUSES.PARTIAL]: t("diagnostics.status.partial"),
    [PRICING_DIAGNOSTIC_STATUSES.UNAVAILABLE]: t(
      "diagnostics.status.unavailable",
    ),
    [PRICING_DIAGNOSTIC_STATUSES.NOT_QUOTED]: t("diagnostics.status.notQuoted"),
  }
  return (
    <Badge variant={row.issues.length ? "warning" : "secondary"} size="sm">
      {labels[row.status]}
    </Badge>
  )
}

const DiagnosticRowsList = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DiagnosticRowsList({ children, ...props }, ref) {
  return (
    <div {...props} ref={ref} role="list" className="divide-y">
      {children}
    </div>
  )
})
const DiagnosticRowsItem = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DiagnosticRowsItem(props, ref) {
  return <div {...props} ref={ref} role="listitem" />
})
