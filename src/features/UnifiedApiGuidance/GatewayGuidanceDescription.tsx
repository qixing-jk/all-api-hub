import type { ReactNode } from "react"

import { GatewayGuidanceLink } from "./GatewayGuidanceLink"

/** Keeps the optional guide beside the explanation it supports. */
export function GatewayGuidanceDescription({
  title,
  children,
}: {
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        {title ? (
          <div className="text-foreground text-sm font-medium">{title}</div>
        ) : null}
        <p className="text-muted-foreground text-xs leading-5">{children}</p>
      </div>
      <div className="shrink-0 self-start sm:self-center">
        <GatewayGuidanceLink />
      </div>
    </div>
  )
}
