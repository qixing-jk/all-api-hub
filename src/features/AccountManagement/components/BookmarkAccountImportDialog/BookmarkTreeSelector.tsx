import type { TFunction } from "i18next"
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  Globe2,
  Search,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

import type { NativeBookmarkTreeNode } from "../../bookmarkImport/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "../../testIds"

interface BookmarkTreeSelectorProps {
  tree: NativeBookmarkTreeNode[]
  selectedNodeIds: Set<string>
  onToggleNode: (nodeId: string) => void
  onSetNodeSelection: (
    nodeIds: string[],
    mode: "select" | "deselect" | "invert",
  ) => void
  className?: string
}

interface BookmarkTreeNodeData {
  id: string
  name: string
  url?: string
  source?: string
  bookmarkCount: number
  folderCount: number
  children?: BookmarkTreeNodeData[]
}

type BookmarkTreeSelectionState = boolean | "indeterminate"

const MIN_TREE_HEIGHT = 240

interface BookmarkTreeNodeRendererData extends BookmarkTreeNodeData {
  selectedNodeIds: Set<string>
  onToggleNode: (nodeId: string) => void
  t: TFunction
}

/** Resolves a display label for native bookmark folders and URL nodes. */
function getBookmarkNodeLabel(node: NativeBookmarkTreeNode, t: TFunction) {
  const title = typeof node.title === "string" ? node.title.trim() : ""
  if (title) return title

  if (typeof node.url === "string" && node.url.trim()) {
    return node.url
  }

  return t("ui:dialog.bookmarkAccountImport.untitledFolder")
}

/** Builds a compact source label that keeps bookmark rows scannable. */
function formatBookmarkSource(value: string | undefined) {
  if (!value) return undefined

  try {
    const parsedUrl = new URL(value)
    const path = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    return `${parsedUrl.host}${path === "/" ? "" : path}`
  } catch {
    return value
  }
}

/** Counts descendant folders and URL bookmarks for one rendered subtree. */
function summarizeBookmarkTreeNode(node: NativeBookmarkTreeNode) {
  let folderCount = Array.isArray(node.children) ? 1 : 0
  let bookmarkCount = typeof node.url === "string" ? 1 : 0

  for (const child of node.children ?? []) {
    const childSummary = summarizeBookmarkTreeNode(child)
    folderCount += childSummary.folderCount
    bookmarkCount += childSummary.bookmarkCount
  }

  return {
    folderCount,
    bookmarkCount,
  }
}

/** Converts browser bookmark nodes into the stable data shape used by the tree. */
function toTreeData(
  nodes: NativeBookmarkTreeNode[],
  t: TFunction,
): BookmarkTreeNodeData[] {
  return nodes.map((node) => {
    const summary = summarizeBookmarkTreeNode(node)
    return {
      id: node.id,
      name: getBookmarkNodeLabel(node, t),
      bookmarkCount: summary.bookmarkCount,
      folderCount: summary.folderCount,
      ...(typeof node.url === "string"
        ? {
            url: node.url,
            source: formatBookmarkSource(node.url),
          }
        : {}),
      ...(node.children
        ? {
            children: toTreeData(node.children, t),
          }
        : {}),
    }
  })
}

/** Keeps matching bookmark rows plus the ancestor folders needed for context. */
function filterTreeData(
  nodes: BookmarkTreeNodeData[],
  query: string,
): BookmarkTreeNodeData[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return nodes

  return nodes.flatMap((node): BookmarkTreeNodeData[] => {
    const filteredChildren = node.children
      ? filterTreeData(node.children, normalizedQuery)
      : undefined
    const nodeMatches = [node.name, node.source, node.url].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery),
    )

    if (!nodeMatches && (!filteredChildren || filteredChildren.length === 0)) {
      return []
    }

    return [
      {
        ...node,
        ...(filteredChildren
          ? {
              children: filteredChildren,
            }
          : {}),
      },
    ]
  })
}

/** Collects ids from the rendered data, preserving filtered search scope. */
function collectTreeDataNodeIds(nodes: BookmarkTreeNodeData[]) {
  const ids: string[] = []
  const visit = (node: BookmarkTreeNodeData) => {
    ids.push(node.id)
    for (const child of node.children ?? []) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return ids
}

/** Opens only the browser bookmark root layer by default. */
function buildInitialOpenState(nodes: BookmarkTreeNodeData[]) {
  return Object.fromEntries(nodes.map((node) => [node.id, true]))
}

/** Adds controlled selection callbacks to every rendered tree node. */
function withRendererData(
  nodes: BookmarkTreeNodeData[],
  props: {
    selectedNodeIds: Set<string>
    onToggleNode: (nodeId: string) => void
    t: TFunction
  },
): BookmarkTreeNodeRendererData[] {
  return nodes.map((node) => ({
    ...node,
    selectedNodeIds: props.selectedNodeIds,
    onToggleNode: props.onToggleNode,
    t: props.t,
    ...(node.children
      ? {
          children: withRendererData(node.children, props),
        }
      : {}),
  }))
}

/** Computes checked, unchecked, or indeterminate state from descendant selection. */
function getNodeSelectionState(
  node: BookmarkTreeNodeData,
  selectedNodeIds: Set<string>,
): BookmarkTreeSelectionState {
  if (!node.children || node.children.length === 0) {
    return selectedNodeIds.has(node.id)
  }

  const childStates = node.children.map((child) =>
    getNodeSelectionState(child, selectedNodeIds),
  )
  if (childStates.every((state) => state === true)) {
    return true
  }
  if (childStates.every((state) => state === false)) {
    return selectedNodeIds.has(node.id)
  }

  return "indeterminate"
}

/** Formats compact folder metadata without exposing bookmark titles twice. */
function formatFolderSummary(node: BookmarkTreeNodeRendererData) {
  const folderText = node.t("ui:dialog.bookmarkAccountImport.folderCount", {
    count: Math.max(0, node.folderCount - 1),
  })
  const bookmarkText = node.t("ui:dialog.bookmarkAccountImport.bookmarkCount", {
    count: node.bookmarkCount,
  })

  if (node.folderCount <= 1) {
    return bookmarkText
  }

  return `${folderText} / ${bookmarkText}`
}

/** Renders one virtualized bookmark tree row with expansion and selection controls. */
function BookmarkTreeNode({
  node,
  style,
}: NodeRendererProps<BookmarkTreeNodeRendererData>) {
  const isFolder = node.isInternal
  const checked = getNodeSelectionState(node.data, node.data.selectedNodeIds)
  const folderSummary = isFolder ? formatFolderSummary(node.data) : undefined
  const bookmarkSource = isFolder ? undefined : node.data.source

  return (
    <div
      style={style}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-2 text-sm",
        node.isFocused && "bg-blue-50 dark:bg-blue-950/30",
      )}
      title={node.data.url}
    >
      <button
        type="button"
        className="dark:hover:bg-dark-bg-tertiary grid size-7 shrink-0 place-content-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-0 dark:text-gray-400"
        onClick={(event) => {
          event.stopPropagation()
          if (isFolder) node.toggle()
        }}
        aria-label={
          isFolder
            ? node.data.t(
                node.isOpen
                  ? "ui:dialog.bookmarkAccountImport.actions.collapseFolder"
                  : "ui:dialog.bookmarkAccountImport.actions.expandFolder",
              )
            : undefined
        }
        disabled={!isFolder}
      >
        {isFolder ? (
          node.isOpen ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )
        ) : null}
      </button>
      <Checkbox
        checked={checked}
        onCheckedChange={() => node.data.onToggleNode(node.id)}
        aria-label={node.data.name}
        data-testid={`${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-${node.id}`}
      />
      {isFolder ? (
        <Folder className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
      ) : (
        <Globe2 className="size-4 shrink-0 text-sky-500" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 truncate",
              isFolder
                ? "dark:text-dark-text-primary font-medium text-gray-800"
                : "dark:text-dark-text-primary text-gray-800",
            )}
          >
            {node.data.name}
          </span>
          {folderSummary ? (
            <span className="dark:text-dark-text-tertiary shrink-0 text-xs text-gray-500">
              {folderSummary}
            </span>
          ) : null}
          {bookmarkSource ? (
            <>
              <span className="dark:text-dark-text-tertiary shrink-0 text-xs text-gray-400">
                |
              </span>
              <span className="dark:text-dark-text-tertiary min-w-0 truncate text-xs text-gray-500">
                {bookmarkSource}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Renders the bookmark scope selector used before scanning import candidates. */
export function BookmarkTreeSelector({
  tree,
  selectedNodeIds,
  onToggleNode,
  onSetNodeSelection,
  className,
}: BookmarkTreeSelectorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<BookmarkTreeNodeRendererData> | undefined>(
    undefined,
  )
  const [treeHeight, setTreeHeight] = useState(MIN_TREE_HEIGHT)
  const [searchQuery, setSearchQuery] = useState("")
  const rawTreeData = useMemo(() => toTreeData(tree, t), [tree, t])
  const initialOpenState = useMemo(
    () => buildInitialOpenState(rawTreeData),
    [rawTreeData],
  )
  const filteredTreeData = useMemo(
    () => filterTreeData(rawTreeData, searchQuery),
    [rawTreeData, searchQuery],
  )
  const treeData = useMemo(
    () =>
      withRendererData(filteredTreeData, {
        selectedNodeIds,
        onToggleNode,
        t,
      }),
    [filteredTreeData, onToggleNode, selectedNodeIds, t],
  )
  const visibleNodeIds = useMemo(
    () => collectTreeDataNodeIds(filteredTreeData),
    [filteredTreeData],
  )
  const isSearching = searchQuery.trim().length > 0
  const hasVisibleNodes = visibleNodeIds.length > 0

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateHeight = (height: number) => {
      setTreeHeight(Math.max(MIN_TREE_HEIGHT, Math.floor(height)))
    }

    updateHeight(element.clientHeight)

    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const measuredHeight = entries[0]?.contentRect.height
      updateHeight(measuredHeight ?? element.clientHeight)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isSearching) {
      treeRef.current?.openAll()
    }
  }, [isSearching, treeData])

  return (
    <div
      ref={containerRef}
      className={cn(
        "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary flex min-h-[240px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-2",
        className,
      )}
    >
      <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onClear={() => setSearchQuery("")}
          clearButtonLabel={t(
            "ui:dialog.bookmarkAccountImport.actions.clearSearch",
          )}
          placeholder={t("ui:dialog.bookmarkAccountImport.searchPlaceholder")}
          aria-label={t("ui:dialog.bookmarkAccountImport.searchLabel")}
          leftIcon={<Search className="size-4" aria-hidden="true" />}
          containerClassName="min-w-0 flex-1"
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!hasVisibleNodes}
            onClick={() => onSetNodeSelection(visibleNodeIds, "select")}
          >
            {t("ui:dialog.bookmarkAccountImport.actions.selectAll")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!hasVisibleNodes}
            onClick={() => onSetNodeSelection(visibleNodeIds, "deselect")}
          >
            {t("ui:dialog.bookmarkAccountImport.actions.clearSelected")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!hasVisibleNodes}
            onClick={() => onSetNodeSelection(visibleNodeIds, "invert")}
          >
            {t("ui:dialog.bookmarkAccountImport.actions.invertSelected")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => treeRef.current?.closeAll()}
            leftIcon={<ChevronsDownUp className="size-4" />}
          >
            {t("ui:dialog.bookmarkAccountImport.actions.collapseAll")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => treeRef.current?.openAll()}
            leftIcon={<ChevronsUpDown className="size-4" />}
          >
            {t("ui:dialog.bookmarkAccountImport.actions.expandAll")}
          </Button>
        </div>
      </div>
      <div
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree}
        className="min-h-0 flex-1"
        style={{ height: treeHeight }}
      >
        {treeData.length > 0 ? (
          <Tree<BookmarkTreeNodeRendererData>
            ref={treeRef}
            data={treeData}
            idAccessor="id"
            childrenAccessor="children"
            openByDefault={false}
            initialOpenState={initialOpenState}
            disableDrag
            disableDrop
            disableEdit
            width="100%"
            height={treeHeight}
            rowHeight={34}
            indent={16}
            overscanCount={4}
          >
            {BookmarkTreeNode}
          </Tree>
        ) : (
          <div className="dark:text-dark-text-secondary dark:border-dark-bg-tertiary grid h-full place-content-center rounded-md border border-dashed border-gray-200 px-4 text-center text-sm text-gray-500">
            {t("ui:dialog.bookmarkAccountImport.searchEmpty")}
          </div>
        )}
      </div>
    </div>
  )
}
