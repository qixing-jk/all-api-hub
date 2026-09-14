import { Ban, ChevronDown, Copy, ListChecks, Trash2 } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Checkbox, Modal } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"

interface AccountBulkToolbarProps {
  selectedAccounts: DisplaySiteData[]
  visibleAccountIds: Set<string>
  isBusy: boolean
  isDisabling: boolean
  isCopying: boolean
  onSelectVisible: () => void
  onClearVisible: () => void
  onClearAll: () => void
  onDeselect: (id: string) => void
  onDisable: () => void
  onCopy: () => void
  onDelete: () => void
  onExit: () => void
}

const controlClass = "min-h-7 shrink-0 px-2 text-xs shadow-xs"

/** Keeps selection scope, inspection, and account mutations visually separate. */
export function AccountBulkToolbar({
  selectedAccounts,
  visibleAccountIds,
  isBusy,
  isDisabling,
  isCopying,
  onSelectVisible,
  onClearVisible,
  onClearAll,
  onDeselect,
  onDisable,
  onCopy,
  onDelete,
  onExit,
}: AccountBulkToolbarProps) {
  const { t } = useTranslation(["account", "common"])
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const exitButtonRef = useRef<HTMLButtonElement>(null)
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const selectionGroupRef = useRef<HTMLDivElement>(null)
  const actionGroupRef = useRef<HTMLDivElement>(null)
  const selectionPairRef = useRef<HTMLDivElement>(null)
  const clearButtonRef = useRef<HTMLButtonElement>(null)
  const [compactSelection, setCompactSelection] = useState(true)
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false)
  const [actionsWrapped, setActionsWrapped] = useState(false)

  useLayoutEffect(() => {
    const content = contentRef.current
    const pair = selectionPairRef.current
    const clear = clearButtonRef.current
    const selectionGroup = selectionGroupRef.current
    const actionGroup = actionGroupRef.current
    if (!content || !pair || !clear || !selectionGroup || !actionGroup) return
    const measure = () => {
      if (!content.clientWidth) return
      setCompactSelection(
        pair.getBoundingClientRect().width +
          clear.getBoundingClientRect().width +
          6 >
          content.clientWidth,
      )
      // The separator follows the actual flex line, including translated labels.
      // Its absolute positioning keeps this measurement independent of styling.
      setActionsWrapped(
        actionGroup.getBoundingClientRect().top >=
          selectionGroup.getBoundingClientRect().bottom,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const element of [content, pair, clear, selectionGroup, actionGroup])
      observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const selectedCount = selectedAccounts.length
  const visibleCount = selectedAccounts.filter((account) =>
    visibleAccountIds.has(account.id),
  ).length
  const hiddenCount = selectedCount - visibleCount
  const enabledCount = selectedAccounts.filter(
    (account) => account.disabled !== true,
  ).length

  return (
    <section
      data-testid="account-bulk-toolbar"
      aria-label={t("account:bulk.manage")}
      className="border-b border-blue-100 bg-blue-50/40 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/15"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div
          ref={contentRef}
          className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-4"
        >
          <div
            ref={selectionGroupRef}
            data-testid="account-bulk-selection-group"
            className="flex max-w-full flex-wrap items-center gap-1.5"
          >
            <Button
              variant="outline"
              size="sm"
              className={cn(
                controlClass,
                "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/40",
              )}
              onClick={() => setIsReviewOpen(true)}
              ref={reviewButtonRef}
              disabled={selectedCount === 0 || isBusy}
              aria-label={t("account:bulk.reviewSelection")}
            >
              <ListChecks className="size-3.5" aria-hidden="true" />
              <span role="status" className="tabular-nums">
                {t("account:bulk.selectedSummary", {
                  count: selectedCount,
                  selected: selectedCount,
                })}
              </span>
              <span
                className="h-3 w-px bg-blue-200 dark:bg-blue-700"
                aria-hidden="true"
              />
              {t("account:bulk.reviewSelection")}
            </Button>
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              <div
                ref={selectionPairRef}
                aria-hidden={compactSelection}
                inert={compactSelection}
                className={cn(
                  "inline-flex w-max shrink-0 items-center -space-x-px",
                  compactSelection &&
                    "pointer-events-none invisible fixed top-0 -left-[10000px]",
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    controlClass,
                    "rounded-r-none focus-visible:z-10",
                  )}
                  onClick={onSelectVisible}
                  disabled={visibleAccountIds.size === 0 || isBusy}
                >
                  {t("account:bulk.selectVisible")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    controlClass,
                    "rounded-l-none focus-visible:z-10",
                  )}
                  onClick={onClearVisible}
                  disabled={visibleCount === 0 || isBusy}
                >
                  {t("account:bulk.clearVisible")}
                </Button>
              </div>
              {compactSelection && (
                <DropdownMenu
                  open={selectionMenuOpen}
                  onOpenChange={setSelectionMenuOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={controlClass}
                      disabled={isBusy}
                    >
                      {t("account:bulk.selectionScope")}
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={onSelectVisible}
                      disabled={visibleAccountIds.size === 0}
                    >
                      {t("account:bulk.selectVisible")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={onClearVisible}
                      disabled={visibleCount === 0}
                    >
                      {t("account:bulk.clearVisible")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                ref={clearButtonRef}
                variant="outline"
                size="sm"
                className={controlClass}
                onClick={onClearAll}
                disabled={selectedCount === 0 || isBusy}
              >
                {t("account:bulk.clearAll")}
              </Button>
            </div>
          </div>
          <div
            ref={actionGroupRef}
            data-testid="account-bulk-action-group"
            className={cn(
              "relative flex max-w-full flex-wrap items-center gap-1.5 before:pointer-events-none before:absolute before:bg-slate-300 before:content-[''] dark:before:bg-slate-600",
              actionsWrapped
                ? "before:-top-2 before:right-0 before:left-0 before:h-px"
                : "before:top-1 before:bottom-1 before:-left-4 before:w-px",
            )}
          >
            <Button
              variant="outline"
              size="sm"
              className={controlClass}
              onClick={onDisable}
              leftIcon={
                <Ban className="hidden size-3.5 [@container(min-width:24rem)]:block" />
              }
              disabled={enabledCount === 0 || isBusy}
              loading={isDisabling}
            >
              {isDisabling
                ? t("common:status.disabling")
                : t("account:bulk.disableSelected")}
              <span className="tabular-nums">{enabledCount}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={controlClass}
              onClick={onCopy}
              leftIcon={
                <Copy className="hidden size-3.5 [@container(min-width:24rem)]:block" />
              }
              disabled={enabledCount === 0 || isBusy}
              loading={isCopying}
            >
              {isCopying
                ? t("common:status.copying")
                : t("account:bulk.copyInviteLinks")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                controlClass,
                "border-red-200 bg-red-50/60 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40",
              )}
              onClick={onDelete}
              leftIcon={
                <Trash2 className="hidden size-3.5 [@container(min-width:24rem)]:block" />
              }
              disabled={selectedCount === 0 || isBusy}
            >
              {t("account:bulk.deleteSelected")}
              <span className="tabular-nums">{selectedCount}</span>
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn(controlClass, "text-gray-500 dark:text-gray-400")}
          onClick={onExit}
          disabled={isBusy}
          ref={exitButtonRef}
        >
          {t("account:bulk.exit")}
        </Button>
      </div>
      {hiddenCount > 0 && (
        <p className="mt-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {t("account:bulk.hiddenSelectedHint", { count: hiddenCount })}
        </p>
      )}
      <Modal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        onCloseComplete={() => {
          if (reviewButtonRef.current?.disabled) exitButtonRef.current?.focus()
        }}
        title={t("account:bulk.reviewSelection")}
        header={
          <h2 className="pr-8 text-sm font-medium">
            {t("account:bulk.reviewSelection")}
          </h2>
        }
        size="md"
        focusFallbackKey={selectedCount}
        footer={
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            disabled={selectedCount === 0 || isBusy}
          >
            {t("account:bulk.clearAll")}
          </Button>
        }
      >
        <div className="space-y-3 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("account:bulk.reviewHint")}
          </p>
          {selectedCount === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {t("account:bulk.selectionEmpty")}
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {selectedAccounts.map((account) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-white/5"
                >
                  <Checkbox
                    checked
                    onCheckedChange={() => onDeselect(account.id)}
                    disabled={isBusy}
                    aria-label={t("account:bulk.selectAccount", {
                      accountName: account.name,
                    })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm break-words">
                      {account.name}
                    </span>
                    {!visibleAccountIds.has(account.id) && (
                      <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                        {t("account:bulk.hiddenAccount")}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </section>
  )
}
