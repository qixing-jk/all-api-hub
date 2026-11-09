import {
  cloneElement,
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Tooltip as ReactTooltip } from "react-tooltip"

import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  position?:
    | "top"
    | "top-start"
    | "top-end"
    | "right"
    | "right-start"
    | "right-end"
    | "bottom"
    | "bottom-start"
    | "bottom-end"
    | "left"
    | "left-start"
    | "left-end"
  delay?: number
  positionStrategy?: "absolute" | "fixed"
  /** Mounts the popup outside a clipping or transformed anchor container when provided. */
  portalContainer?: HTMLElement
  className?: string
  wrapperClassName?: string
  anchorAsChild?: boolean
  includeAccessibleDescription?: boolean
  /** Allow touch/click activation in addition to hover and keyboard focus. */
  openOnClick?: boolean
}

interface TooltipChildProps {
  id?: string
  "data-tooltip-anchor-id"?: string
  "aria-describedby"?: string
  onFocusCapture?: FocusEventHandler<HTMLElement>
  onBlurCapture?: FocusEventHandler<HTMLElement>
  onClickCapture?: MouseEventHandler<HTMLElement>
}

/** Identifies the anchor managed by the nearest explicit Tooltip instance. */
export const TooltipContext = createContext<string | null>(null)

/**
 * Tooltip renders rich or text content from a wrapper anchor by default, or from the child itself when requested.
 */
export default function Tooltip({
  content,
  children,
  position = "top",
  delay = 0,
  positionStrategy = "absolute",
  portalContainer,
  className = "",
  wrapperClassName = "",
  anchorAsChild = false,
  includeAccessibleDescription = true,
  openOnClick = false,
}: TooltipProps) {
  const instanceId = useId()
  const generatedAnchorId = `tooltip-${instanceId}`
  const popupId = `${generatedAnchorId}-popup`
  const descriptionId = `${generatedAnchorId}-description`
  const focusCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const [isOpen, setIsOpen] = useState(false)
  const [isClickOpen, setIsClickOpen] = useState(false)

  const isString = typeof content === "string"
  const shouldRenderDescription =
    anchorAsChild && isString && includeAccessibleDescription
  const tooltipId = anchorAsChild && isString ? undefined : popupId
  const childProps = children.props as TooltipChildProps
  const anchorId =
    anchorAsChild && childProps.id ? childProps.id : generatedAnchorId
  const describedBy = Array.from(
    new Set(
      [
        childProps["aria-describedby"],
        shouldRenderDescription
          ? descriptionId
          : anchorAsChild
            ? popupId
            : undefined,
      ]
        .flatMap((value) => value?.split(/\s+/) ?? [])
        .filter(Boolean),
    ),
  ).join(" ")

  const cancelFocusCheck = useCallback(() => {
    if (focusCheckTimeoutRef.current !== null) {
      clearTimeout(focusCheckTimeoutRef.current)
      focusCheckTimeoutRef.current = null
    }
  }, [])
  const scheduleFocusCheck = useCallback(() => {
    cancelFocusCheck()
    // The popup is rendered outside the anchor; wait for focus to settle before checking both nodes.
    focusCheckTimeoutRef.current = setTimeout(() => {
      focusCheckTimeoutRef.current = null
      const activeElement = document.activeElement
      const anchor = document.getElementById(anchorId)
      const popup = document.getElementById(popupId)
      if (!anchor?.contains(activeElement) && !popup?.contains(activeElement)) {
        setIsOpen(false)
      }
    }, 0)
  }, [anchorId, cancelFocusCheck, popupId])
  const handleFocusCapture = useCallback<FocusEventHandler<HTMLElement>>(
    (event) => {
      if (anchorAsChild) childProps.onFocusCapture?.(event)
      cancelFocusCheck()
      // Interactive hints use the library's event queue for focus and click,
      // so a pending Escape dismissal cannot overtake an immediate reopen.
      if (!openOnClick || !anchorAsChild) setIsOpen(true)
    },
    [anchorAsChild, cancelFocusCheck, childProps, openOnClick],
  )
  const handleBlurCapture = useCallback<FocusEventHandler<HTMLElement>>(
    (event) => {
      if (anchorAsChild) childProps.onBlurCapture?.(event)

      const nextTarget = event.relatedTarget
      const popup = document.getElementById(popupId)
      if (nextTarget instanceof Node) {
        if (
          !event.currentTarget.contains(nextTarget) &&
          !popup?.contains(nextTarget)
        ) {
          cancelFocusCheck()
          setIsOpen(false)
        }
        return
      }

      scheduleFocusCheck()
    },
    [anchorAsChild, cancelFocusCheck, childProps, popupId, scheduleFocusCheck],
  )
  const handleClickCapture: MouseEventHandler<HTMLElement> = (event) => {
    if (anchorAsChild) childProps.onClickCapture?.(event)
    // Touch taps synthesize mouseout; keep an explicitly opened hint until
    // blur, Escape, or an outside click dismisses it.
    if (openOnClick) setIsClickOpen(true)
  }

  useEffect(() => {
    if (!isOpen) setIsClickOpen(false)
  }, [isOpen])

  useEffect(() => cancelFocusCheck, [cancelFocusCheck])
  useEffect(() => {
    if (!isOpen) return

    document.addEventListener("focusin", scheduleFocusCheck)
    document.addEventListener("focusout", scheduleFocusCheck)
    return () => {
      document.removeEventListener("focusin", scheduleFocusCheck)
      document.removeEventListener("focusout", scheduleFocusCheck)
      cancelFocusCheck()
    }
  }, [cancelFocusCheck, isOpen, scheduleFocusCheck])

  const managedChild = cloneElement(
    children as ReactElement<Record<string, unknown>>,
    {
      "data-tooltip-anchor-id": anchorId,
      "data-tooltip-open": openOnClick && isOpen ? "true" : undefined,
    },
  )
  const anchor = anchorAsChild ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: anchorId,
      "data-tooltip-anchor-id": anchorId,
      "data-tooltip-open": openOnClick && isOpen ? "true" : undefined,
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
      onFocusCapture: handleFocusCapture,
      onBlurCapture: handleBlurCapture,
      onClickCapture: handleClickCapture,
    })
  ) : (
    <div
      id={anchorId}
      data-tooltip-open={openOnClick && isOpen ? "true" : undefined}
      className={cn(
        "gap-y-density-2 flex items-center justify-center gap-x-2",
        wrapperClassName,
      )}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      onClickCapture={handleClickCapture}
    >
      {managedChild}
    </div>
  )

  // Keep library positioning styles; project tokens own all visual styling.
  const defaultClassName = cn(
    Z_INDEX.tooltip,
    "w-max max-w-[90vw] rounded-sm bg-surface-inverse px-3 py-density-2 text-xs text-inverse-foreground shadow-lg dark:bg-secondary dark:text-foreground",
    className,
  )
  const popupProps = {
    anchorId,
    place: position,
    positionStrategy,
    delayShow: delay,
    disableStyleInjection: true,
    classNameArrow: "size-[var(--rt-arrow-size)] rotate-45",
    className: defaultClassName,
    isOpen,
    setIsOpen,
    role: isOpen ? "tooltip" : "presentation",
    openEvents: openOnClick
      ? { mouseover: true, focus: true, click: true }
      : undefined,
    closeEvents: { mouseout: !isClickOpen, blur: false },
    globalCloseEvents: {
      escape: true,
      ...(openOnClick ? { clickOutsideAnchor: true } : {}),
    },
  } satisfies ComponentProps<typeof ReactTooltip>
  const popup = isString ? (
    <ReactTooltip {...popupProps} id={tooltipId} content={content} />
  ) : (
    <ReactTooltip {...popupProps} id={popupId} clickable>
      {content}
    </ReactTooltip>
  )
  return (
    <TooltipContext.Provider value={anchorId}>
      {anchor}

      {shouldRenderDescription ? (
        <span id={descriptionId} className="sr-only">
          {content}
        </span>
      ) : null}

      {portalContainer ? createPortal(popup, portalContainer) : popup}
    </TooltipContext.Provider>
  )
}
