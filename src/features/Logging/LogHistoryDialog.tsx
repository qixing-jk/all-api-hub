import { Copy, Pause, Play, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "~/components/ui"
import toast from "~/lib/notify"
import {
  clearLogHistory,
  listLogHistory,
  subscribeToLogHistory,
} from "~/services/logging/logHistory"
import { LOG_CONTEXTS, LOG_LEVELS, type LogHistoryEntry } from "~/types/logging"

const PAGE_SIZE = 100
const TIME_WINDOWS = {
  all: Infinity,
  minutes: 5 * 60 * 1000,
  hour: 60 * 60 * 1000,
} as const

/** View recent persisted logs and follow live storage updates without a console. */
export default function LogHistoryDialog() {
  const { t, i18n } = useTranslation(["settings", "common"])
  const [entries, setEntries] = useState<LogHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasReadError, setHasReadError] = useState(false)
  const [isLive, setIsLive] = useState(true)
  const liveRef = useRef(true)
  const readState = useRef({ sequence: 0 })
  const [search, setSearch] = useState("")
  const [level, setLevel] = useState("all")
  const [context, setContext] = useState("all")
  const [period, setPeriod] = useState<keyof typeof TIME_WINDOWS>("all")
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [isClearOpen, setIsClearOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const levelLabels = {
    debug: t("settings:logging.levels.debug"),
    info: t("settings:logging.levels.info"),
    warn: t("settings:logging.levels.warn"),
    error: t("settings:logging.levels.error"),
  }
  const periodLabels = {
    all: t("settings:logging.history.allTime"),
    minutes: t("settings:logging.history.lastMinutes"),
    hour: t("settings:logging.history.lastHour"),
  }

  const reload = useCallback(async () => {
    const sequence = ++readState.current.sequence
    try {
      const next = await listLogHistory()
      if (sequence !== readState.current.sequence) return
      setEntries(next)
      setHasReadError(false)
    } catch {
      if (sequence === readState.current.sequence) setHasReadError(true)
    } finally {
      if (sequence === readState.current.sequence) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const state = readState.current
    const unsubscribe = subscribeToLogHistory(() => {
      if (liveRef.current) void reload()
    })
    void reload()
    const timer = window.setInterval(() => {
      if (liveRef.current) void reload()
    }, 30_000)
    return () => {
      state.sequence++
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [reload])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const cutoff = Date.now() - TIME_WINDOWS[period]
    return entries.filter(
      (entry) =>
        entry.timestamp >= cutoff &&
        (level === "all" || entry.level === level) &&
        (context === "all" || entry.context === context) &&
        (!query ||
          `${entry.scope} ${entry.message} ${entry.details ?? ""}`
            .toLowerCase()
            .includes(query)),
    )
  }, [entries, search, level, context, period])
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "medium",
      }),
    [i18n.language],
  )

  const toggleLive = () => {
    liveRef.current = !liveRef.current
    readState.current.sequence++
    setIsLive(liveRef.current)
    setIsLoading(false)
    if (liveRef.current) void reload()
  }
  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2))
      toast.success(t("settings:logging.history.copied"))
    } catch {
      toast.error(t("settings:logging.history.copyError"))
    }
  }
  const clearHistory = async () => {
    setIsClearing(true)
    try {
      await clearLogHistory()
      setIsClearOpen(false)
      await reload()
    } catch {
      toast.error(t("settings:logging.history.clearError"))
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <>
      <div className="gap-y-density-2 py-density-4 grid shrink-0 grid-cols-2 gap-x-2 border-b px-4 sm:grid-cols-4">
        <Input
          className="w-full"
          containerClassName="col-span-2 sm:col-span-4"
          aria-label={t("settings:logging.history.search")}
          placeholder={t("settings:logging.history.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setVisibleLimit(PAGE_SIZE)
          }}
        />
        <Select
          value={period}
          onValueChange={(value) => {
            setPeriod(value as keyof typeof TIME_WINDOWS)
            setVisibleLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger
            className="w-full min-w-0"
            aria-label={t("settings:logging.history.period")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(periodLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={level}
          onValueChange={(value) => {
            setLevel(value)
            setVisibleLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger
            className="w-full min-w-0"
            aria-label={t("settings:logging.history.level")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings:logging.history.allLevels")}
            </SelectItem>
            {LOG_LEVELS.map((value) => (
              <SelectItem key={value} value={value}>
                {levelLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={context}
          onValueChange={(value) => {
            setContext(value)
            setVisibleLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger
            className="w-full min-w-0"
            aria-label={t("settings:logging.history.context")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings:logging.history.allContexts")}
            </SelectItem>
            {LOG_CONTEXTS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={isLive}
          onClick={toggleLive}
          leftIcon={
            isLive ? <Pause className="size-4" /> : <Play className="size-4" />
          }
        >
          {isLive
            ? t("settings:logging.history.pause")
            : t("settings:logging.history.resume")}
        </Button>
        <div className="gap-y-density-2 col-span-2 flex flex-wrap gap-x-2 sm:col-span-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reload()}
            leftIcon={<RefreshCw className="size-4" />}
          >
            {t("common:actions.refresh")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!filtered.length || hasReadError}
            onClick={() => void copyLogs()}
            leftIcon={<Copy className="size-4" />}
          >
            {t("settings:logging.history.copy")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!entries.length || hasReadError}
            onClick={() => setIsClearOpen(true)}
            leftIcon={<Trash2 className="size-4" />}
          >
            {t("common:actions.clear")}
          </Button>
        </div>
      </div>
      {hasReadError && (
        <p
          role="alert"
          className="text-destructive-text py-density-2 px-4 text-sm"
        >
          {t("settings:logging.history.loadError")}
        </p>
      )}
      <div className="py-density-3 min-h-0 flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-density-6 text-center text-sm">
            {t("settings:logging.history.empty")}
          </p>
        ) : (
          <ol className="space-y-density-3">
            {filtered.slice(0, visibleLimit).map((entry) => (
              <li key={entry.id} className="bg-card rounded-lg border p-3">
                <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                  <time dateTime={new Date(entry.timestamp).toISOString()}>
                    {dateFormat.format(entry.timestamp)}
                  </time>
                  <span>{levelLabels[entry.level]}</span>
                  <span>{entry.context}</span>
                  <span className="break-all">{entry.scope}</span>
                </div>
                <p className="mt-density-1 text-foreground text-sm break-words whitespace-pre-wrap">
                  {entry.message}
                </p>
                {entry.details && (
                  <details className="mt-density-2">
                    <summary className="text-muted-foreground cursor-pointer text-xs">
                      {t("settings:logging.history.details")}
                    </summary>
                    <pre className="bg-muted mt-density-2 rounded p-2 font-mono text-xs break-all whitespace-pre-wrap">
                      {entry.details}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
        {filtered.length > visibleLimit && (
          <Button
            className="mt-density-3 w-full"
            variant="outline"
            size="sm"
            onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}
          >
            {t("settings:logging.history.more")}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground py-density-2 shrink-0 border-t px-4 text-xs">
        {t("settings:logging.history.showing", {
          visible: Math.min(visibleLimit, filtered.length),
          total: entries.length,
        })}
      </p>
      <ConfirmDialog
        intent="destructive"
        isOpen={isClearOpen}
        onClose={() => setIsClearOpen(false)}
        title={t("settings:logging.history.clearTitle")}
        description={t("settings:logging.history.clearDescription")}
        confirmLabel={t("common:actions.clear")}
        cancelLabel={t("common:actions.cancel")}
        isWorking={isClearing}
        onConfirm={() => void clearHistory()}
      />
    </>
  )
}
