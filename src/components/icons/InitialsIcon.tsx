import type { ComponentPropsWithoutRef, FunctionComponent } from "react"

import { cn } from "~/lib/utils"

export interface InitialsIconProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  /** Explicit one- or two-character monogram chosen by the caller. */
  initials: string
}

type CreatedInitialsIconProps = Omit<InitialsIconProps, "initials">

/**
 * Renders a compact, neutral monogram that follows the caller's icon sizing.
 */
export function InitialsIcon({
  initials,
  className,
  ...props
}: InitialsIconProps) {
  const fontSizeClassName = initials.length === 1 ? "text-[9px]" : "text-[8px]"

  return (
    <span
      {...props}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-gray-200 leading-none font-semibold tracking-tight select-none dark:bg-gray-700",
        fontSizeClassName,
        className,
      )}
    >
      {initials}
    </span>
  )
}

/**
 * Adapts an explicit monogram to icon-component contracts used by static maps.
 */
export function createInitialsIcon(
  initials: string,
): FunctionComponent<CreatedInitialsIconProps> {
  const CreatedInitialsIcon: FunctionComponent<CreatedInitialsIconProps> = (
    props,
  ) => <InitialsIcon {...props} initials={initials} />

  CreatedInitialsIcon.displayName = `InitialsIcon(${initials})`

  return CreatedInitialsIcon
}
