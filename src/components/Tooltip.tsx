import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type ReactElement,
  type ReactNode,
} from "react"
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
  className?: string
  wrapperClassName?: string
  anchorAsChild?: boolean
}

interface TooltipChildProps {
  id?: string
  "aria-describedby"?: string
  onFocusCapture?: FocusEventHandler<HTMLElement>
  onBlurCapture?: FocusEventHandler<HTMLElement>
}

/**
 * Tooltip renders rich or text content from a wrapper anchor by default, or from the child itself when requested.
 */
export default function Tooltip({
  content,
  children,
  position = "top",
  delay = 0,
  className = "",
  wrapperClassName = "",
  anchorAsChild = false,
}: TooltipProps) {
  const instanceId = useId()
  const generatedAnchorId = `tooltip-${instanceId}`
  const popupId = `${generatedAnchorId}-popup`
  const descriptionId = `${generatedAnchorId}-description`
  const focusCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const [isOpen, setIsOpen] = useState(false)

  const isString = typeof content === "string"
  const tooltipId = anchorAsChild && isString ? undefined : popupId
  const childProps = children.props as TooltipChildProps
  const anchorId =
    anchorAsChild && childProps.id ? childProps.id : generatedAnchorId
  const describedBy = Array.from(
    new Set(
      [
        childProps["aria-describedby"],
        anchorAsChild ? (isString ? descriptionId : popupId) : undefined,
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
      setIsOpen(true)
    },
    [anchorAsChild, cancelFocusCheck, childProps],
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

  const anchor = anchorAsChild ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: anchorId,
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
      onFocusCapture: handleFocusCapture,
      onBlurCapture: handleBlurCapture,
    })
  ) : (
    <div
      id={anchorId}
      className={cn("flex items-center justify-center gap-2", wrapperClassName)}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {children}
    </div>
  )

  const defaultClassName = `${Z_INDEX.tooltip} max-w-[90vw] rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-dark-bg-tertiary dark:text-dark-text-primary ${className}`
  return (
    <>
      {anchor}

      {anchorAsChild && isString ? (
        <span id={descriptionId} className="sr-only">
          {content}
        </span>
      ) : null}

      {isString ? (
        <ReactTooltip
          id={tooltipId}
          anchorId={anchorId}
          place={position}
          content={content}
          delayShow={delay}
          className={defaultClassName}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          role={isOpen ? "tooltip" : "presentation"}
          closeEvents={{ mouseout: true, blur: false }}
          globalCloseEvents={{ escape: true }}
        />
      ) : (
        <ReactTooltip
          id={popupId}
          anchorId={anchorId}
          place={position}
          delayShow={delay}
          clickable
          className={defaultClassName}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          role={isOpen ? "tooltip" : "presentation"}
          closeEvents={{ mouseout: true, blur: false }}
          globalCloseEvents={{ escape: true }}
        >
          {content}
        </ReactTooltip>
      )}
    </>
  )
}
