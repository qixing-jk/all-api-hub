import { forwardRef, type ReactNode } from "react"
import { Virtuoso, type ListProps } from "react-virtuoso"

import { CardList } from "~/components/ui"

interface VirtualizedAccountListProps<Item> {
  items: Item[]
  renderItem: (item: Item) => ReactNode
  scrollParent?: HTMLElement | null
  getItemKey: (item: Item) => React.Key
}

const VirtualizedCardList = forwardRef<HTMLDivElement, ListProps>(
  function VirtualizedCardList({ children, ...props }, ref) {
    return (
      <CardList ref={ref} {...props}>
        {children}
      </CardList>
    )
  },
)

/** Renders account rows against either the page or a supplied popup scroller. */
export function VirtualizedAccountList<Item>({
  getItemKey,
  items,
  renderItem,
  scrollParent,
}: VirtualizedAccountListProps<Item>) {
  return (
    <Virtuoso
      components={{ List: VirtualizedCardList }}
      computeItemKey={(_, item) => getItemKey(item)}
      customScrollParent={scrollParent ?? undefined}
      data={items}
      defaultItemHeight={112}
      increaseViewportBy={240}
      itemContent={(_, item) => renderItem(item)}
      useWindowScroll={scrollParent == null}
    />
  )
}
