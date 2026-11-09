import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react"

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

/** Keeps floating hints within a content UI's styled, unclipped portal scope. */
export const TooltipPortalContext = createContext<HTMLElement | null>(null)

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
  const anchorRef = useRef<HTMLElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const scopedPortalContainer = useContext(TooltipPortalContext)
  const [inlineContainer, setInlineContainer] =
    useState<HTMLSpanElement | null>(null)
  const resolvedPortalContainer =
    scopedPortalContainer ?? portalContainer ?? inlineContainer
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
      const anchor = anchorRef.current
      const popup = popupRef.current
      const root = anchor?.getRootNode() as Document | ShadowRoot | undefined
      let activeElement = root?.activeElement ?? document.activeElement
      while (activeElement?.shadowRoot?.activeElement) {
        activeElement = activeElement.shadowRoot.activeElement
      }
      const popupRoot = popup?.getRootNode() as
        | Document
        | ShadowRoot
        | undefined
      const popupActive = popupRoot?.activeElement
      if (
        !anchor?.contains(activeElement) &&
        !popup?.contains(popupActive ?? activeElement)
      ) {
        setIsOpen(false)
      }
    }, 0)
  }, [cancelFocusCheck])
  const handleFocusCapture = useCallback<FocusEventHandler<HTMLElement>>(
    (event) => {
      if (anchorAsChild) childProps.onFocusCapture?.(event)
      cancelFocusCheck()
      setIsOpen(true)
    },
    [anchorAsChild, cancelFocusCheck, childProps],
  )
  const handleBlurCapture = useCallback<FocusEventHandler<HTMLElement>>(
    (event) => {
      if (anchorAsChild) childProps.onBlurCapture?.(event)

      const nextTarget = event.relatedTarget
      const popup = popupRef.current
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
    [anchorAsChild, cancelFocusCheck, childProps, scheduleFocusCheck],
  )
  const handleClickCapture: MouseEventHandler<HTMLElement> = (event) => {
    if (anchorAsChild) childProps.onClickCapture?.(event)
    // Touch taps synthesize mouseout; keep an explicitly opened hint until
    // blur, Escape, or an outside click dismisses it.
    if (openOnClick) {
      setIsClickOpen(true)
      setIsOpen(true)
    }
  }

  useEffect(() => {
    if (!isOpen) setIsClickOpen(false)
  }, [isOpen])

  useEffect(() => cancelFocusCheck, [cancelFocusCheck])
  useEffect(() => {
    if (!isOpen) return
    // Content UI contains bubbling keyboard events before they reach document.
    // Capture Escape even when a hovered hint's anchor does not own focus.
    const document = anchorRef.current?.ownerDocument
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
    }
    document?.addEventListener("keydown", dismiss, true)
    return () => document?.removeEventListener("keydown", dismiss, true)
  }, [isOpen])
  useEffect(() => {
    if (!isOpen) return

    const root = anchorRef.current?.getRootNode() ?? document
    root.addEventListener("focusin", scheduleFocusCheck)
    root.addEventListener("focusout", scheduleFocusCheck)
    return () => {
      root.removeEventListener("focusin", scheduleFocusCheck)
      root.removeEventListener("focusout", scheduleFocusCheck)
      cancelFocusCheck()
    }
  }, [cancelFocusCheck, isOpen, scheduleFocusCheck])

  const managedChild = cloneElement(
    children as ReactElement<Record<string, unknown>>,
    {
      "data-tooltip-anchor-id": anchorId,
      "data-tooltip-open": isOpen ? "true" : undefined,
    },
  )
  const anchor = anchorAsChild ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: anchorId,
      "data-tooltip-anchor-id": anchorId,
      "data-tooltip-open": isOpen ? "true" : undefined,
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
      onFocusCapture: handleFocusCapture,
      onBlurCapture: handleBlurCapture,
      onClickCapture: handleClickCapture,
    })
  ) : (
    <div
      id={anchorId}
      data-tooltip-open={isOpen ? "true" : undefined}
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

  const handleKeyDownCapture: KeyboardEventHandler<HTMLElement> = (event) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
    }
  }
  const [side, align = "center"] = position.split("-") as [
    "top" | "right" | "bottom" | "left",
    "start" | "center" | "end",
  ]
  const popup = (
    <TooltipPrimitive.Positioner
      positionMethod={positionStrategy}
      side={side}
      align={align}
      sideOffset={10}
      className={cn(Z_INDEX.tooltip, "pointer-events-auto")}
    >
      <TooltipPrimitive.Popup
        ref={popupRef}
        id={tooltipId}
        role={isOpen ? "tooltip" : "presentation"}
        onKeyDownCapture={handleKeyDownCapture}
        className={cn(
          "bg-surface-inverse py-density-2 text-inverse-foreground dark:bg-secondary dark:text-foreground w-max max-w-[90vw] rounded-sm px-3 text-xs opacity-90 shadow-lg",
          className,
        )}
      >
        {content}
        <TooltipPrimitive.Arrow className="size-2 rotate-45 bg-inherit data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
      </TooltipPrimitive.Popup>
    </TooltipPrimitive.Positioner>
  )
  return (
    <TooltipContext.Provider value={anchorId}>
      <TooltipPrimitive.Root
        open={isOpen}
        triggerId={anchorId}
        disableHoverablePopup={isString}
        onOpenChange={(open, details) => {
          if (
            !open &&
            (details.reason === "trigger-press" ||
              (isClickOpen && details.reason === "trigger-hover"))
          ) {
            details.cancel()
            return
          }
          if (
            !open &&
            (details.reason === "trigger-focus" || details.reason === "none")
          ) {
            details.cancel()
            scheduleFocusCheck()
            return
          }
          setIsOpen(open)
        }}
      >
        <TooltipPrimitive.Trigger
          ref={(element: HTMLElement | null) => {
            anchorRef.current = element
          }}
          id={anchorId}
          delay={delay}
          render={anchor}
          onKeyDownCapture={handleKeyDownCapture}
        />
        {shouldRenderDescription ? (
          <span id={descriptionId} className="sr-only">
            {content}
          </span>
        ) : null}
        {!scopedPortalContainer && !portalContainer ? (
          <span ref={setInlineContainer} className="contents" />
        ) : null}
        {resolvedPortalContainer ? (
          <TooltipPrimitive.Portal container={resolvedPortalContainer}>
            {popup}
          </TooltipPrimitive.Portal>
        ) : null}
      </TooltipPrimitive.Root>
    </TooltipContext.Provider>
  )
}
