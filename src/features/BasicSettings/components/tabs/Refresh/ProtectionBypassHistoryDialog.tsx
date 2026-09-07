import {
  ArrowUp,
  Ellipsis,
  History,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Button,
  DestructiveConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  protectionBypassHistoryStorage,
  subscribeToProtectionBypassHistory,
  type ProtectionBypassHistoryEntry,
} from "~/services/protectionBypass/historyStorage"

import {
  describeProtectionBypassHistory,
  getProtectionBypassHistoryLabels,
} from "./protectionBypassHistoryPresentation"
import ProtectionBypassHistoryRow from "./ProtectionBypassHistoryRow"

/** A live local history of why protected tasks requested a temporary browser context. */
export default function ProtectionBypassHistoryDialog({
  onNavigateToSettings,
}: {
  onNavigateToSettings: (target: string) => void
}) {
  const { t, i18n } = useTranslation(["shieldBypass", "common", "settings"])
  const [history, setHistory] = useState<{
    latest: ProtectionBypassHistoryEntry[]
    displayed: ProtectionBypassHistoryEntry[]
  }>({ latest: [], displayed: [] })
  const entries = history.displayed
  const [isLoading, setIsLoading] = useState(true)
  const [hasReadError, setHasReadError] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [isClearOpen, setIsClearOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const readState = useRef({ sequence: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const expandedIds = useRef(new Set<string>())
  const onExpandedChange = useCallback((id: string, expanded: boolean) => {
    if (expanded) expandedIds.current.add(id)
    else expandedIds.current.delete(id)
  }, [])
  const labels = useMemo(() => getProtectionBypassHistoryLabels(t), [t])
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "medium",
      }),
    [i18n.language],
  )

  const reload = useCallback(async ({ revealNew = false } = {}) => {
    const state = readState.current
    const sequence = ++state.sequence
    setIsLoading(true)
    try {
      const next = await protectionBypassHistoryStorage.list()
      if (sequence !== state.sequence) return
      const deferNew =
        !revealNew &&
        ((scrollRef.current?.scrollTop ?? 0) > 0 ||
          expandedIds.current.size > 0)
      setHistory((previous) => {
        const displayedIds = new Set(
          previous.displayed.map((entry) => entry.id),
        )
        const hasPending = previous.latest.some(
          (entry) => !displayedIds.has(entry.id),
        )
        const nextById = new Map(next.map((entry) => [entry.id, entry]))
        return {
          latest: next,
          displayed:
            deferNew || (!revealNew && hasPending)
              ? previous.displayed.flatMap(
                  (entry) => nextById.get(entry.id) ?? [],
                )
              : next,
        }
      })
      if (revealNew && scrollRef.current) scrollRef.current.scrollTop = 0
      setHasReadError(false)
    } catch {
      if (sequence === state.sequence) setHasReadError(true)
    } finally {
      if (sequence === state.sequence) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const state = readState.current
    const unsubscribe = subscribeToProtectionBypassHistory(() => void reload())
    void reload()
    return () => {
      ++state.sequence
      unsubscribe()
    }
  }, [reload])

  const pendingCount = useMemo(() => {
    const displayedIds = new Set(history.displayed.map((entry) => entry.id))
    return history.latest.filter((entry) => !displayedIds.has(entry.id)).length
  }, [history])

  const showNewRecords = () => {
    setHistory((current) => ({ ...current, displayed: current.latest }))
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return entries.flatMap((entry) => {
      if (status !== "all" && entry.status !== status) return []
      const description = describeProtectionBypassHistory(entry, labels, t)
      const text = [
        entry.origin,
        entry.denialReason,
        entry.failureReason,
        ...Object.values(description),
      ]
        .join(" ")
        .toLocaleLowerCase()
      return !query || text.includes(query) ? [{ entry, description }] : []
    })
  }, [entries, labels, search, status, t])

  const clearHistory = async () => {
    setIsClearing(true)
    try {
      await protectionBypassHistoryStorage.clear()
      expandedIds.current.clear()
      setIsClearOpen(false)
      await reload({ revealNew: true })
    } catch {
      toast.error(t("shieldBypass:history.clearFailed"))
    } finally {
      setIsClearing(false)
    }
  }

  const copyEntry = async (entry: ProtectionBypassHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2))
      toast.success(t("shieldBypass:history.copied"))
    } catch {
      toast.error(t("shieldBypass:history.copyFailed"))
    }
  }

  return (
    <>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-4 sm:flex">
        <Input
          type="search"
          aria-label={t("shieldBypass:history.search")}
          placeholder={t("shieldBypass:history.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
          leftIcon={<Search className="size-4" aria-hidden="true" />}
          containerClassName="col-span-2 min-w-0 sm:flex-1"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
          }}
        >
          <SelectTrigger
            className="w-full min-w-0 sm:w-48"
            aria-label={t("shieldBypass:history.filterStatus")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("shieldBypass:history.allStatuses")}
            </SelectItem>
            {Object.entries(labels.statuses).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="outline"
              size="lg"
              aria-label={t("shieldBypass:history.actions")}
            >
              <Ellipsis className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (isClearOpen) event.preventDefault()
            }}
          >
            <DropdownMenuItem
              onSelect={() => void reload({ revealNew: true })}
              disabled={isLoading}
            >
              <RefreshCw className="size-4" />
              {t("common:actions.refresh")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setIsClearOpen(true)}
              disabled={history.latest.length === 0 || isClearing}
            >
              <Trash2 className="size-4" />
              {t("shieldBypass:history.clear")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="region"
          aria-label={t("shieldBypass:history.title")}
          tabIndex={0}
          className="h-full overflow-y-auto overscroll-contain px-4 pb-4"
        >
          {hasReadError ? (
            <EmptyState
              icon={<History className="size-8" />}
              variant="destructive"
              title={t("shieldBypass:history.loadFailed")}
              action={{
                label: t("common:actions.retry"),
                onClick: () => void reload(),
              }}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<History className="size-8" />}
              title={
                isLoading
                  ? t("common:status.loading")
                  : t("shieldBypass:history.empty")
              }
              description={
                isLoading
                  ? undefined
                  : t("shieldBypass:history.emptyDescription")
              }
            />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8" />}
              title={t("shieldBypass:history.noMatches")}
              action={{
                label: t("shieldBypass:history.clearFilters"),
                onClick: () => {
                  setSearch("")
                  setStatus("all")
                },
              }}
            />
          ) : (
            <div className="space-y-3">
              {filteredEntries.map(({ entry, description }) => (
                <ProtectionBypassHistoryRow
                  key={entry.id}
                  entry={entry}
                  description={description}
                  labels={labels}
                  dateFormat={dateFormat}
                  onCopy={(record) => void copyEntry(record)}
                  onNavigateToSettings={onNavigateToSettings}
                  onExpandedChange={onExpandedChange}
                />
              ))}
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm">
                  {t("shieldBypass:history.shown", {
                    visible: filteredEntries.length,
                    total: entries.length,
                  })}
                </p>
              </div>
            </div>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center"
          aria-live="polite"
        >
          {pendingCount > 0 && (
            <Button
              className="pointer-events-auto shadow-md"
              size="sm"
              onClick={showNewRecords}
              leftIcon={<ArrowUp className="size-4" />}
            >
              {t("shieldBypass:history.newRecords", { count: pendingCount })}
            </Button>
          )}
        </div>
      </div>
      <DestructiveConfirmDialog
        isOpen={isClearOpen}
        onClose={() => setIsClearOpen(false)}
        title={t("shieldBypass:history.clear")}
        description={t("shieldBypass:history.clearDescription")}
        confirmLabel={t("common:actions.clear")}
        cancelLabel={t("common:actions.cancel")}
        isWorking={isClearing}
        onConfirm={() => void clearHistory()}
      />
    </>
  )
}
