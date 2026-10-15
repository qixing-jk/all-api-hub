import { Fragment, type ComponentType } from "react"

import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

type ActionIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

export interface MenuAction {
  id: string
  label: string
  icon: ActionIcon
  disabled?: boolean
  onSelect: () => void
}

export interface ActionMenuGroup {
  id: string
  label?: string
  actions: readonly MenuAction[]
}

/** Counts visible actions, keeping temporarily disabled actions in their usual place. */
export function ActionMenu({
  label,
  icon: Icon,
  groups,
}: {
  label: string
  icon: ActionIcon
  groups: readonly ActionMenuGroup[]
}) {
  const visibleGroups = groups.filter((group) => group.actions.length > 0)
  const actions = visibleGroups.flatMap((group) => group.actions)
  const [single] = actions
  if (!single) return null
  if (actions.length === 1) {
    const SingleIcon = single.icon
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={single.disabled}
        onClick={single.onSelect}
        leftIcon={<SingleIcon className="h-4 w-4" aria-hidden />}
      >
        {single.label}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={actions.every((action) => action.disabled)}
          leftIcon={<Icon className="h-4 w-4" aria-hidden />}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibleGroups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.label ? (
              <DropdownMenuLabel className="text-muted-foreground max-w-64 text-xs font-normal whitespace-normal">
                {group.label}
              </DropdownMenuLabel>
            ) : null}
            {group.actions.map((action) => {
              const ActionIcon = action.icon
              return (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  onSelect={action.onSelect}
                >
                  <ActionIcon className="h-4 w-4" aria-hidden />
                  {action.label}
                </DropdownMenuItem>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
