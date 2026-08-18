import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Link2,
  Link2Off,
} from "lucide-react"
import type { ReactNode } from "react"

import { ApiCredentialLibraryAddIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"

export type CredentialAssociationMenuItem = {
  id: string
  label?: ReactNode
  testId?: string
  onSaveAndAssociate?: () => void | Promise<void>
  onAssociate?: () => void
  onOpen?: () => void
  onConfirm?: () => void
  onUnlink?: () => void
}

export type CredentialAssociationMenuLabels = {
  saveAndAssociate?: string
  associate?: string
  open: string
  confirm?: string
  unlink?: string
}

export type CredentialAssociationMenuProps = {
  status: "linked" | "needs-confirmation" | "unlinked"
  items: readonly CredentialAssociationMenuItem[]
  labels: CredentialAssociationMenuLabels
  triggerLabel?: ReactNode
  triggerAriaLabel: string
  count?: number
  testId?: string
  className?: string
}

/** Renders one compact association action and its optional flat action menu. */
export function CredentialAssociationMenu({
  status,
  items,
  labels,
  triggerLabel,
  triggerAriaLabel,
  count,
  testId,
  className,
}: CredentialAssociationMenuProps) {
  const renderableItems = items.filter(
    (item) =>
      Boolean(item.onOpen && labels.open) ||
      Boolean(item.onSaveAndAssociate && labels.saveAndAssociate) ||
      Boolean(item.onConfirm && labels.confirm) ||
      Boolean(item.onAssociate && labels.associate) ||
      Boolean(item.onUnlink && labels.unlink),
  )

  if (renderableItems.length === 0) {
    return null
  }

  const isNeedsConfirmation = status === "needs-confirmation"
  const isUnlinked = status === "unlinked"
  const hasVisibleLabel = triggerLabel !== undefined
  const StatusIcon = isNeedsConfirmation
    ? CircleAlert
    : isUnlinked
      ? Link2Off
      : Link2
  const statusIconClassName = isNeedsConfirmation
    ? "text-amber-600 dark:text-amber-400"
    : isUnlinked
      ? "text-muted-foreground"
      : "text-emerald-600 dark:text-emerald-400"
  const hasVisibleCount = count !== undefined
  const triggerSize = hasVisibleLabel || hasVisibleCount ? "sm" : "icon-sm"
  const triggerClassName = cn(
    "max-w-full gap-1.5 px-2 text-xs",
    !hasVisibleLabel && !hasVisibleCount && "p-0",
    className,
  )
  const triggerVariant = hasVisibleLabel
    ? isNeedsConfirmation
      ? "warning"
      : "outline"
    : "ghost"
  const statusIcon = (
    <StatusIcon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        statusIconClassName,
        hasVisibleLabel ? "h-3.5 w-3.5" : "h-4 w-4",
      )}
    />
  )
  const directAssociateItem =
    status === "unlinked" &&
    renderableItems.length === 1 &&
    !renderableItems[0].onSaveAndAssociate
      ? renderableItems[0]
      : undefined

  if (directAssociateItem?.onAssociate && labels.associate) {
    return (
      <Tooltip content={triggerAriaLabel} anchorAsChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          aria-label={triggerAriaLabel}
          data-testid={testId}
          className={triggerClassName}
          onClick={() => directAssociateItem.onAssociate?.()}
        >
          {statusIcon}
          {hasVisibleLabel ? (
            <span className="min-w-0 truncate">{triggerLabel}</span>
          ) : null}
        </Button>
      </Tooltip>
    )
  }

  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        aria-label={triggerAriaLabel}
        data-testid={testId}
        className={triggerClassName}
      >
        {statusIcon}
        {hasVisibleLabel ? (
          <span className="min-w-0 truncate">{triggerLabel}</span>
        ) : null}
        {hasVisibleCount ? <span className="tabular-nums">{count}</span> : null}
        {hasVisibleLabel ? (
          <ChevronDown
            aria-hidden="true"
            className="h-3 w-3 shrink-0 opacity-60"
          />
        ) : null}
      </Button>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {hasVisibleLabel ? (
        trigger
      ) : (
        <Tooltip content={triggerAriaLabel} anchorAsChild>
          {trigger}
        </Tooltip>
      )}
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="min-w-44"
      >
        {renderableItems.map((item, index) => (
          <DropdownMenuGroup
            key={item.id}
            aria-label={typeof item.label === "string" ? item.label : undefined}
          >
            {renderableItems.length > 1 && item.label ? (
              <DropdownMenuLabel className="text-muted-foreground max-w-56 truncate text-xs">
                {item.label}
              </DropdownMenuLabel>
            ) : null}
            {item.onOpen && status === "linked" ? (
              <DropdownMenuItem onSelect={item.onOpen}>
                <ArrowUpRight />
                {labels.open}
              </DropdownMenuItem>
            ) : null}
            {item.onSaveAndAssociate && labels.saveAndAssociate ? (
              <DropdownMenuItem
                data-testid={item.testId}
                onSelect={() => {
                  void Promise.resolve()
                    .then(() => item.onSaveAndAssociate?.())
                    .catch(() => undefined)
                }}
              >
                <ApiCredentialLibraryAddIcon />
                {labels.saveAndAssociate}
              </DropdownMenuItem>
            ) : null}
            {item.onConfirm && labels.confirm ? (
              <DropdownMenuItem onSelect={item.onConfirm}>
                <Check className="text-emerald-600 dark:text-emerald-400" />
                {labels.confirm}
              </DropdownMenuItem>
            ) : null}
            {item.onAssociate && labels.associate ? (
              <DropdownMenuItem onSelect={item.onAssociate}>
                <Link2 />
                {labels.associate}
              </DropdownMenuItem>
            ) : null}
            {item.onOpen && status !== "linked" ? (
              <DropdownMenuItem onSelect={item.onOpen}>
                <ArrowUpRight />
                {labels.open}
              </DropdownMenuItem>
            ) : null}
            {item.onUnlink && labels.unlink ? (
              <DropdownMenuItem variant="destructive" onSelect={item.onUnlink}>
                <Link2Off />
                {labels.unlink}
              </DropdownMenuItem>
            ) : null}
            {index < renderableItems.length - 1 ? (
              <DropdownMenuSeparator />
            ) : null}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
