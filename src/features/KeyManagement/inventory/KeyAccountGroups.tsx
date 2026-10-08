import { Fragment, type ReactNode } from "react"
import { Virtuoso } from "react-virtuoso"

/** Bound mounted key cards on large inventories while retaining small-list layout. */
export function KeyAccountGroups<Group extends { account: { id: string } }>({
  groups,
  renderGroup,
  hasNavigationTarget,
}: {
  groups: Group[]
  renderGroup: (group: Group) => ReactNode
  hasNavigationTarget: boolean
}) {
  // Targeted workflows locate and focus a concrete DOM row. Keep that row
  // mounted for their existing navigation and guided-action lifecycle.
  if (groups.length <= 20 || hasNavigationTarget) {
    return (
      <div className="space-y-density-3">
        {groups.map((group) => (
          <Fragment key={group.account.id}>{renderGroup(group)}</Fragment>
        ))}
      </div>
    )
  }

  return (
    <Virtuoso
      data={groups}
      computeItemKey={(_, group) => group.account.id}
      defaultItemHeight={64}
      increaseViewportBy={240}
      useWindowScroll
      itemContent={(_, group) => (
        <div className="pb-density-3">{renderGroup(group)}</div>
      )}
    />
  )
}
