import { useCallback, useMemo, useState } from "react"

import type { NativeBookmarkTreeNode } from "~/features/AccountManagement/bookmarkImport/types"

/** Collects every native bookmark node id from the provided subtrees. */
function collectBookmarkNodeIds(nodes: NativeBookmarkTreeNode[]) {
  const ids = new Set<string>()
  const visit = (node: NativeBookmarkTreeNode) => {
    ids.add(node.id)
    for (const child of node.children ?? []) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return ids
}

/** Collects every node id under one native bookmark subtree. */
function collectBookmarkSubtreeIds(node: NativeBookmarkTreeNode) {
  return collectBookmarkNodeIds([node])
}

/** Returns whether a node or any descendant is currently selected. */
function hasSelectedDescendant(
  node: NativeBookmarkTreeNode,
  selectedNodeIds: Set<string>,
): boolean {
  if (selectedNodeIds.has(node.id)) {
    return true
  }

  return (node.children ?? []).some((child) =>
    hasSelectedDescendant(child, selectedNodeIds),
  )
}

/** Counts selected URL bookmarks after applying folder and bookmark selections. */
function countSelectedBookmarkUrls(
  nodes: NativeBookmarkTreeNode[],
  selectedNodeIds: Set<string>,
) {
  let count = 0
  const visit = (node: NativeBookmarkTreeNode, ancestorSelected: boolean) => {
    const isSelected = ancestorSelected || selectedNodeIds.has(node.id)
    if (isSelected && typeof node.url === "string" && node.url.trim()) {
      count += 1
    }

    for (const child of node.children ?? []) {
      visit(child, isSelected)
    }
  }

  for (const node of nodes) {
    visit(node, false)
  }

  return count
}

/** Preserves only selected bookmark nodes and their required ancestor folders. */
function filterBookmarkTreeBySelection(
  nodes: NativeBookmarkTreeNode[],
  selectedNodeIds: Set<string>,
): NativeBookmarkTreeNode[] {
  const result: NativeBookmarkTreeNode[] = []

  for (const node of nodes) {
    if (selectedNodeIds.has(node.id)) {
      result.push(node)
      continue
    }

    const selectedChildren = filterBookmarkTreeBySelection(
      node.children ?? [],
      selectedNodeIds,
    )
    if (selectedChildren.length === 0) continue

    result.push({
      ...node,
      children: selectedChildren,
    })
  }

  return result
}

/** Finds the root-to-node path for a native bookmark node id. */
function findBookmarkNodePath(
  nodes: NativeBookmarkTreeNode[],
  nodeId: string,
  path: NativeBookmarkTreeNode[] = [],
): NativeBookmarkTreeNode[] {
  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.id === nodeId) {
      return nextPath
    }

    const childPath = findBookmarkNodePath(
      node.children ?? [],
      nodeId,
      nextPath,
    )
    if (childPath.length > 0) {
      return childPath
    }
  }

  return []
}

/**
 * Owns native bookmark scope selection, subtree rules and its scan projection.
 */
export function useBookmarkScopeSelection() {
  const [bookmarkTree, setBookmarkTree] = useState<NativeBookmarkTreeNode[]>([])
  const [selectedBookmarkNodeIds, setSelectedBookmarkNodeIds] = useState<
    Set<string>
  >(() => new Set())
  const selectedBookmarkUrlCount = useMemo(
    () => countSelectedBookmarkUrls(bookmarkTree, selectedBookmarkNodeIds),
    [bookmarkTree, selectedBookmarkNodeIds],
  )

  const toggleBookmarkNode = useCallback(
    (nodeId: string) => {
      const path = findBookmarkNodePath(bookmarkTree, nodeId)
      const node = path.at(-1)
      if (!node) return

      const subtreeIds = collectBookmarkSubtreeIds(node)
      setSelectedBookmarkNodeIds((current) => {
        const next = new Set(current)
        const shouldSelect = !hasSelectedDescendant(node, current)

        for (const id of subtreeIds) {
          if (shouldSelect) {
            next.add(id)
          } else {
            next.delete(id)
          }
        }

        if (!shouldSelect) {
          for (const ancestor of path.slice(0, -1)) {
            next.delete(ancestor.id)
          }
        }

        return next
      })
    },
    [bookmarkTree],
  )

  const setBookmarkNodeSelection = useCallback(
    (nodeIds: string[], mode: "select" | "deselect" | "invert") => {
      setSelectedBookmarkNodeIds((current) => {
        const next = new Set(current)
        const expandedIds = new Set<string>()

        for (const id of nodeIds) {
          const path = findBookmarkNodePath(bookmarkTree, id)
          const node = path.at(-1)
          if (!node) continue

          for (const subtreeId of collectBookmarkSubtreeIds(node)) {
            expandedIds.add(subtreeId)
          }
        }

        for (const id of expandedIds) {
          if (mode === "select") {
            next.add(id)
          } else if (mode === "deselect") {
            next.delete(id)
          } else if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
        }

        return next
      })
    },
    [bookmarkTree],
  )

  const replaceBookmarkTree = useCallback((tree: NativeBookmarkTreeNode[]) => {
    setBookmarkTree(tree)
    setSelectedBookmarkNodeIds(new Set())
  }, [])

  const getSelectedBookmarkTree = useCallback(
    () => filterBookmarkTreeBySelection(bookmarkTree, selectedBookmarkNodeIds),
    [bookmarkTree, selectedBookmarkNodeIds],
  )

  return {
    bookmarkTree,
    selectedBookmarkNodeIds,
    selectedBookmarkUrlCount,
    canScanSelectedBookmarks: selectedBookmarkNodeIds.size > 0,
    replaceBookmarkTree,
    getSelectedBookmarkTree,
    toggleBookmarkNode,
    setBookmarkNodeSelection,
  }
}
