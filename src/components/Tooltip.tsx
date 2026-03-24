import { useId, type ReactElement, type ReactNode } from "react"
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
}

/**
 * Tooltip wraps children with a react-tooltip anchor and renders rich or text content in a popup.
 */
export default function Tooltip({
  content,
  children,
  position = "top",
  delay = 0,
  className = "",
  wrapperClassName = "",
}: TooltipProps) {
  const tooltipId = `tooltip-${useId()}`

  const isString = typeof content === "string"

  const defaultClassName = `${Z_INDEX.tooltip} max-w-[90vw] rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-dark-bg-tertiary dark:text-dark-text-primary ${className}`
  return (
    <>
      <div
        id={tooltipId}
        className={cn(
          "flex items-center justify-center gap-2",
          wrapperClassName,
        )}
      >
        {children}
      </div>

      {isString ? (
        <ReactTooltip
          anchorId={tooltipId}
          place={position}
          content={content}
          delayShow={delay}
          className={defaultClassName}
        />
      ) : (
        <ReactTooltip
          anchorId={tooltipId}
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
