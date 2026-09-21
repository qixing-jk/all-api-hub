import type React from "react"

import "~/styles/content.css"

import { THEME_MODE } from "~/constants/theme"
import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import { useContentAppearance } from "~/features/Appearance/useContentAppearance"
import { getAppearanceScopeAttributes } from "~/utils/ui/themePreferences"

import { RedemptionToaster } from "../redemptionAssist/components/RedemptionToaster"
import { DevIdentityTag } from "./DevIdentityTag"

const stopHostPageKeyboardShortcuts = (
  event: React.KeyboardEvent<HTMLDivElement>,
) => {
  event.stopPropagation()
}

export const ContentReactRoot: React.FC = () => {
  const { resolvedTheme, appearance, ready } = useContentAppearance()

  const wrapperClassName =
    resolvedTheme === THEME_MODE.DARK
      ? "dark text-foreground bg-background text-base"
      : "text-foreground text-base"

  return (
    <div
      {...getAppearanceScopeAttributes(appearance)}
      className={wrapperClassName}
      hidden={!ready}
      onKeyDown={stopHostPageKeyboardShortcuts}
      onKeyUp={stopHostPageKeyboardShortcuts}
    >
      {ready && <ApiCheckModalHost />}
      {ready && <RedemptionToaster />}
      {/* Marks this build's UI as it appears on the page. */}
      {ready && <DevIdentityTag />}
    </div>
  )
}
