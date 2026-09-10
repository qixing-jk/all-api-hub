import { Bug } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { PricingConditionDetails } from "~/features/ModelList/components/PricingConditionDetails"
import {
  buildPricingDiagnostics,
  summarizePricingDiagnostics,
} from "~/features/ModelList/pricingDiagnostics"
import {
  groupPricingDiagnosticRows,
  matchesPricingDiagnosticSearch,
  PRICING_DIAGNOSTIC_GROUPINGS,
  type PricingDiagnosticGrouping,
  type PricingDiagnosticRow,
} from "~/features/ModelList/pricingDiagnosticView"
import { isDevelopmentMode } from "~/utils/core/environment"

const DIAGNOSTIC_FILTERS = { ISSUES: "issues", ALL: "all" } as const
const COPY_STATES = {
  IDLE: "idle",
  FILTERED: "filtered",
  FULL: "full",
  ERROR: "error",
} as const
const DIAGNOSTIC_PAGE_SIZE = 50

type Props = {
  models: Parameters<typeof buildPricingDiagnostics>[0]
  onLocate: (model: string) => void
}

/** Development-only inspection of the quotes already loaded by Model List. */
export function PricingDiagnostics(props: Props) {
  return isDevelopmentMode() ? <DiagnosticsPanel {...props} /> : null
}

/** Builds reports only while open; exporting is an explicit local clipboard action. */
function DiagnosticsPanel({ models, onLocate }: Props) {
  const { t } = useTranslation("modelList")
  const id = useId()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<string>(DIAGNOSTIC_FILTERS.ISSUES)
  const [search, setSearch] = useState("")
  const [grouping, setGrouping] = useState<PricingDiagnosticGrouping>(
    PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN,
  )
  const [copyState, setCopyState] = useState<
    (typeof COPY_STATES)[keyof typeof COPY_STATES]
  >(COPY_STATES.IDLE)
  const report = useMemo(
    () => (open ? buildPricingDiagnostics(models) : null),
    [open, models],
  )
  const effectiveFilter =
    filter.startsWith("code:") &&
    !report?.issueCounts.some((issue) => `code:${issue.code}` === filter)
      ? DIAGNOSTIC_FILTERS.ISSUES
      : filter
  const query = search.trim().toLowerCase()
  const rows =
    report?.rows.filter(
      (row) =>
        (effectiveFilter === DIAGNOSTIC_FILTERS.ALL ||
          (effectiveFilter === DIAGNOSTIC_FILTERS.ISSUES
            ? row.issues.length > 0
            : row.issues.some(
                (issue) => `code:${issue.code}` === effectiveFilter,
              ))) &&
        matchesPricingDiagnosticSearch(row, query),
    ) ?? []

  const groups = groupPricingDiagnosticRows(rows, grouping)
  const copy = async (
    scope: typeof COPY_STATES.FILTERED | typeof COPY_STATES.FULL,
  ) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          scope === COPY_STATES.FULL
            ? report
            : {
                ...report,
                scope: "filtered-diagnostics",
                ...summarizePricingDiagnostics(rows),
                rows,
              },
          null,
          2,
        ),
      )
      setCopyState(scope)
    } catch {
      setCopyState(COPY_STATES.ERROR)
    }
  }

  return (
    <section className="my-3 rounded-md border p-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open)
          setCopyState(COPY_STATES.IDLE)
        }}
      >
        <Bug className="mr-2 size-4" aria-hidden="true" />
        {t("diagnostics.title")} ({models.length})
      </Button>
      {open && report && (
        <div id={id} className="mt-3 space-y-3">
          <p className="text-muted-foreground text-xs">
            {t("diagnostics.scope")}
          </p>
          <p>{t("diagnostics.summary", report.summary)}</p>
          <p className="text-muted-foreground text-xs">
            {t("diagnostics.units")}:{" "}
            {report.units
              .map(({ unit, count }) => `${unit} (${count})`)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={grouping}
              onValueChange={(value: PricingDiagnosticGrouping) =>
                setGrouping(value)
              }
            >
              <SelectTrigger
                aria-label={t("diagnostics.groupBy")}
                className="w-48"
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
            <Select
              value={effectiveFilter}
              onValueChange={(value) => {
                setFilter(value)
                setCopyState(COPY_STATES.IDLE)
              }}
            >
              <SelectTrigger
                aria-label={t("diagnostics.filter")}
                className="w-64"
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
                    {code} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-xs" aria-live="polite">
              {t("diagnostics.matched", {
                records: rows.length,
                models: new Set(rows.map((row) => row.model)).size,
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-48 flex-1"
              aria-label={t("diagnostics.search")}
              placeholder={t("diagnostics.searchHint")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setCopyState(COPY_STATES.IDLE)
              }}
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setCopyState(COPY_STATES.IDLE)
                }}
              >
                {t("diagnostics.clearSearch")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={() => copy(COPY_STATES.FILTERED)}
            >
              {t("diagnostics.copyFiltered")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(COPY_STATES.FULL)}
            >
              {t("diagnostics.copy")}
            </Button>
            {copyState !== COPY_STATES.IDLE && (
              <p role={copyState === COPY_STATES.ERROR ? "alert" : "status"}>
                {copyState === COPY_STATES.ERROR
                  ? t("diagnostics.copyFailed")
                  : copyState === COPY_STATES.FILTERED
                    ? t("diagnostics.copiedFiltered")
                    : t("diagnostics.copied")}
              </p>
            )}
          </div>
          {rows.length === 0 && <p>{t("diagnostics.empty")}</p>}
          {groups.map((group) => (
            <DiagnosticGroup
              key={`${grouping}:${effectiveFilter}:${query}:${group.key}`}
              rows={group.rows}
              label={
                group.label ??
                t(
                  grouping === PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN
                    ? "diagnostics.noOrigin"
                    : "diagnostics.noGroup",
                )
              }
              flat={grouping === PRICING_DIAGNOSTIC_GROUPINGS.NONE}
              initiallyOpen={groups.length === 1}
              onLocate={onLocate}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Mount a bounded set of records only after a group is expanded. */
function DiagnosticGroup({
  rows,
  label,
  flat,
  initiallyOpen,
  onLocate,
}: {
  rows: PricingDiagnosticRow[]
  label: string
  flat: boolean
  initiallyOpen: boolean
  onLocate: Props["onLocate"]
}) {
  const { t } = useTranslation("modelList")
  const id = useId()
  const [open, setOpen] = useState(initiallyOpen)
  const [limit, setLimit] = useState(DIAGNOSTIC_PAGE_SIZE)
  return (
    <div className="overflow-hidden rounded-md border">
      {!flat && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          <strong className="min-w-0 flex-1 font-mono text-xs break-all">
            {label}
          </strong>
          <Badge variant="secondary">{rows.length}</Badge>
        </button>
      )}
      {(flat || open) && (
        <div id={id} className="p-2">
          <p className="text-muted-foreground mb-2 text-xs">
            {t("diagnostics.shown", {
              shown: Math.min(limit, rows.length),
              total: rows.length,
            })}
          </p>
          <ul className="divide-y">
            {rows.slice(0, limit).map((row, index) => (
              <li
                key={`${row.source.origin}:${row.source.name}:${row.model}:${row.group}:${index}`}
                className="py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <strong className="font-mono break-all">{row.model}</strong>
                    <p className="text-muted-foreground text-xs break-all">
                      {[row.source.name, row.source.origin, row.group]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onLocate(row.model)}
                  >
                    {t("diagnostics.locate")}
                  </Button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant={row.issues.length ? "warning" : "secondary"}>
                    {row.status}
                  </Badge>
                  <span className="text-muted-foreground font-mono">
                    {row.unit}
                  </span>
                  {row.issues.map((issue, i) => (
                    <code key={i} className="bg-muted rounded px-1 break-all">
                      {issue.meter
                        ? `${issue.code}:${issue.meter}`
                        : issue.code}
                    </code>
                  ))}
                </div>
                <PricingConditionDetails
                  details={row.conditionDetails}
                  requirements={row.requirementDetails}
                  issues={row.issues}
                  actions
                />
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    {t("diagnostics.inspect")}
                  </summary>
                  <pre className="bg-muted/40 mt-2 max-h-80 overflow-auto rounded p-2 text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(row, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLimit(limit + DIAGNOSTIC_PAGE_SIZE)}
            >
              {t("diagnostics.more")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
