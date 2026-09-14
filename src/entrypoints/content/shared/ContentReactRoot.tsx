import type React from "react"

import "~/styles/style.css"

import { THEME_MODE } from "~/constants/theme"
import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import { useContentAppearance } from "~/features/Appearance/useContentAppearance"
import { getAppearanceScopeAttributes } from "~/utils/ui/themePreferences"

import { RedemptionToaster } from "../redemptionAssist/components/RedemptionToaster"

const stopHostPageKeyboardShortcuts = (
  event: React.KeyboardEvent<HTMLDivElement>,
) => {
  event.stopPropagation()
}

export const ContentReactRoot: React.FC = () => {
  const { resolvedTheme, appearance } = useContentAppearance()

  const wrapperClassName =
    resolvedTheme === THEME_MODE.DARK
      ? "dark text-foreground bg-background"
      : "text-foreground"

  return (
    <div
      {...getAppearanceScopeAttributes(appearance)}
      className={wrapperClassName}
      onKeyDown={stopHostPageKeyboardShortcuts}
      onKeyUp={stopHostPageKeyboardShortcuts}
    >
      <ApiCheckModalHost />
      <RedemptionToaster />
    </div>
  )
}
