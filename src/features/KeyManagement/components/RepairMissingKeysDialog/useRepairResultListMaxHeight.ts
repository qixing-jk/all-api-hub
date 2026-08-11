import { useLayoutEffect, useState, type RefObject } from "react"

interface RepairResultListHeightMetrics {
  bodyPaddingBottom: number
  footerHeight: number
  listOffsetTop: number
  modalMaxHeight: number
  trailingContentHeight: number
}

/** Calculates the result-list space remaining below the dialog's actual upper content. */
export function calculateRepairResultListMaxHeight({
  bodyPaddingBottom,
  footerHeight,
  listOffsetTop,
  modalMaxHeight,
  trailingContentHeight,
}: RepairResultListHeightMetrics): number {
  return Math.max(
    0,
    Math.floor(
      modalMaxHeight -
        listOffsetTop -
        footerHeight -
        bodyPaddingBottom -
        trailingContentHeight,
    ),
  )
}

/** Finds the first descendant whose parent is the requested layout boundary. */
function findDirectChild(
  parent: HTMLElement,
  descendant: HTMLElement,
): HTMLElement | null {
  let current: HTMLElement | null = descendant

  while (current?.parentElement && current.parentElement !== parent) {
    current = current.parentElement
  }

  return current?.parentElement === parent ? current : null
}

/** Measures the result list against its surrounding legacy Modal layout. */
export function useRepairResultListMaxHeight(
  resultListRef: RefObject<HTMLDivElement | null>,
): number | null {
  const [maxHeight, setMaxHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const resultList = resultListRef.current
    const modalPanel = resultList?.closest<HTMLElement>(
      '[data-slot="modal-panel"]',
    )
    if (!resultList || !modalPanel) return

    const modalBody = resultList.closest<HTMLElement>(
      '[data-slot="modal-body"]',
    )
    if (!modalBody) return
    const resultContentRoot = findDirectChild(modalBody, resultList)
    if (!resultContentRoot) return

    const updateMaxHeight = () => {
      const modalMaxHeight = Number.parseFloat(
        window.getComputedStyle(modalPanel).maxHeight,
      )
      if (!Number.isFinite(modalMaxHeight)) return

      const modalPanelRect = modalPanel.getBoundingClientRect()
      const resultListRect = resultList.getBoundingClientRect()
      const resultContentRootRect = resultContentRoot.getBoundingClientRect()
      const footer =
        modalBody.nextElementSibling instanceof HTMLElement
          ? modalBody.nextElementSibling
          : null
      const footerHeight = footer?.getBoundingClientRect().height ?? 0
      const bodyPaddingBottom = Number.parseFloat(
        window.getComputedStyle(modalBody).paddingBottom,
      )
      const listOffsetTop =
        resultListRect.top - modalPanelRect.top + modalBody.scrollTop
      const trailingContentHeight = Math.max(
        0,
        resultContentRootRect.bottom - resultListRect.bottom,
      )
      const nextMaxHeight = calculateRepairResultListMaxHeight({
        bodyPaddingBottom: Number.isFinite(bodyPaddingBottom)
          ? bodyPaddingBottom
          : 0,
        footerHeight,
        listOffsetTop,
        modalMaxHeight,
        trailingContentHeight,
      })

      setMaxHeight((current) =>
        current === nextMaxHeight ? current : nextMaxHeight,
      )
    }

    updateMaxHeight()

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateMaxHeight)
    const observedElements = [
      modalPanel,
      modalBody,
      resultContentRoot,
      resultList,
      ...(modalBody.nextElementSibling instanceof HTMLElement
        ? [modalBody.nextElementSibling]
        : []),
      ...Array.from(modalBody.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      ),
    ]
    observedElements.forEach((element) => resizeObserver?.observe(element))
    window.addEventListener("resize", updateMaxHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updateMaxHeight)
    }
  }, [resultListRef])

  return maxHeight
}
