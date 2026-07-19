import { cloneElement, useId, type ReactElement, type ReactNode } from "react"
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
  const generatedAnchorId = `tooltip-${useId()}`
  const descriptionId = `${generatedAnchorId}-description`

  const isString = typeof content === "string"
  const childProps = children.props as {
    id?: string
    "aria-describedby"?: string
  }
  const anchorId =
    anchorAsChild && childProps.id ? childProps.id : generatedAnchorId
  const describedBy = Array.from(
    new Set(
      [childProps["aria-describedby"], isString ? descriptionId : undefined]
        .flatMap((value) => value?.split(/\s+/) ?? [])
        .filter(Boolean),
    ),
  ).join(" ")
  const anchor = anchorAsChild ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: anchorId,
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
    })
  ) : (
    <div
      id={anchorId}
      className={cn("flex items-center justify-center gap-2", wrapperClassName)}
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
          anchorId={anchorId}
          place={position}
          content={content}
          delayShow={delay}
          className={defaultClassName}
        />
      ) : (
        <ReactTooltip
          id={descriptionId}
          anchorId={anchorId}
          place={position}
          delayShow={delay}
          clickable
          className={defaultClassName}
        >
          {content}
        </ReactTooltip>
      )}
    </>
  )
}
