import { ArrowUpRight, ChevronDown, Clock3, Copy } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card } from "~/components/ui"
import type { ProtectionBypassHistoryEntry } from "~/services/protectionBypass/historyStorage"

import type {
  describeProtectionBypassHistory,
  getProtectionBypassHistoryLabels,
} from "./protectionBypassHistoryPresentation"

interface HistoryRowProps {
  entry: ProtectionBypassHistoryEntry
  description: ReturnType<typeof describeProtectionBypassHistory>
  labels: ReturnType<typeof getProtectionBypassHistoryLabels>
  dateFormat: Intl.DateTimeFormat
  onCopy: (entry: ProtectionBypassHistoryEntry) => void
  onNavigateToSettings: (target: string) => void
  onExpandedChange: (id: string, expanded: boolean) => void
}

/** Group related diagnostic facts without rendering empty fields. */
function HistoryDetailGroup({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string | undefined]>
}) {
  const visibleRows = rows.filter((row): row is [string, string] =>
    Boolean(row[1]),
  )
  if (visibleRows.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr]">
        {visibleRows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-x-4 gap-y-1 sm:col-span-2 sm:grid-cols-subgrid"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Render technical details only while the reader has expanded this record. */
function HistoryDetails({
  entry,
  description,
  labels,
  dateFormat,
  onCopy,
  onNavigateToSettings,
}: HistoryRowProps) {
  const { t, i18n } = useTranslation(["shieldBypass", "common", "settings"])
  const settingsTarget = description.settingsTarget
  const hasUnexpectedContent =
    entry.fallbackDiagnostic?.code === "CONTENT_TYPE_MISMATCH"
  const hasGuidance =
    Boolean(description.reason) ||
    entry.status === "started" ||
    hasUnexpectedContent
  const duration =
    entry.durationMs === undefined
      ? undefined
      : new Intl.NumberFormat(i18n.language, {
          style: "unit",
          unit: entry.durationMs < 1000 ? "millisecond" : "second",
          unitDisplay: "short",
          maximumFractionDigits: 1,
        }).format(
          entry.durationMs < 1000 ? entry.durationMs : entry.durationMs / 1000,
        )

  return (
    <div className="space-y-5 border-t p-4">
      {hasGuidance && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm">
          {description.reason && (
            <p className="font-medium">{description.reason}</p>
          )}
          {entry.status === "started" && (
            <p className="text-muted-foreground">
              {t("shieldBypass:history.pendingDescription")}
            </p>
          )}
          {hasUnexpectedContent && (
            <p className="text-muted-foreground">
              {t("shieldBypass:history.unexpectedContent")}
            </p>
          )}
          {settingsTarget && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateToSettings(settingsTarget)}
              rightIcon={<ArrowUpRight className="size-4" />}
            >
              {t("shieldBypass:history.openSettings")}
            </Button>
          )}
        </div>
      )}
      <HistoryDetailGroup
        title={t("shieldBypass:history.groups.trigger")}
        rows={[
          [t("shieldBypass:history.fields.operation"), description.operation],
          [t("shieldBypass:history.fields.trigger"), description.trigger],
          [t("shieldBypass:history.fields.surface"), description.surface],
          [t("shieldBypass:history.fields.evidence"), description.evidence],
        ]}
      />
      <HistoryDetailGroup
        title={t("shieldBypass:history.groups.outcome")}
        rows={[
          [t("shieldBypass:history.fields.result"), description.result],
          [
            t("shieldBypass:history.fields.verification"),
            description.verification,
          ],
          [t("shieldBypass:history.fields.mutation"), description.mutation],
          [t("shieldBypass:history.fields.duration"), duration],
          [
            t("shieldBypass:history.fields.finishedAt"),
            entry.finishedAt === undefined
              ? undefined
              : dateFormat.format(entry.finishedAt),
          ],
        ]}
      />
      <HistoryDetailGroup
        title={t("shieldBypass:history.groups.context")}
        rows={[
          [t("shieldBypass:history.fields.method"), entry.method],
          [
            t("shieldBypass:history.fields.preferredMode"),
            entry.preferredMode && labels.modes[entry.preferredMode],
          ],
          [
            t("shieldBypass:history.fields.contextMode"),
            entry.contextMode && labels.modes[entry.contextMode],
          ],
          [t("shieldBypass:history.fields.context"), description.context],
          [
            t("shieldBypass:history.fields.profile"),
            entry.incognito ? t("shieldBypass:history.incognito") : undefined,
          ],
        ]}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => onCopy(entry)}
        leftIcon={<Copy className="size-4" />}
      >
        {t("shieldBypass:history.copy")}
      </Button>
    </div>
  )
}

/** A stable summary with keyboard-accessible, lazily rendered diagnostic details. */
export default function ProtectionBypassHistoryRow(props: HistoryRowProps) {
  const { entry, description, onExpandedChange } = props
  const { t } = useTranslation(["shieldBypass", "common"])
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()
  useEffect(
    () => () => onExpandedChange(entry.id, false),
    [entry.id, onExpandedChange],
  )

  return (
    <Card padding="none">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => {
          onExpandedChange(entry.id, !isExpanded)
          setIsExpanded(!isExpanded)
        }}
        className="focus-visible:ring-ring w-full space-y-2 rounded-lg p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium break-all">
              {entry.origin ?? t("common:labels.unknown")}
            </span>
            <Badge
              variant={
                entry.status === "completed"
                  ? "success"
                  : entry.status === "failed"
                    ? "danger"
                    : entry.status === "started"
                      ? "secondary"
                      : "warning"
              }
            >
              {description.status}
            </Badge>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`mt-1 size-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </span>
        <span className="line-clamp-2 space-x-2 text-sm">
          {description.summaryEvidence && (
            <span className="bg-muted inline-block rounded px-1.5 py-0.5 font-mono text-xs">
              {description.summaryEvidence}
            </span>
          )}
          <span
            className={
              description.reason ? "text-foreground" : "text-muted-foreground"
            }
          >
            {description.reason || description.cause}
          </span>
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            {description.operation} · {description.trigger}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" aria-hidden="true" />
            <time dateTime={new Date(entry.startedAt).toISOString()}>
              {props.dateFormat.format(entry.startedAt)}
            </time>
          </span>
        </span>
      </button>
      {isExpanded && (
        <div id={detailsId}>
          <HistoryDetails {...props} />
        </div>
      )}
    </Card>
  )
}
