import { BookOpen } from "lucide-react"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import type { AccountSiteManualAddGuideAnchor } from "~/services/accountSiteDefinitions"
import { createTab } from "~/utils/browser/browserApi"
import { getDocsManualAddGuideUrl } from "~/utils/navigation/docsLinks"

interface ManualAddGuideButtonProps {
  anchor: AccountSiteManualAddGuideAnchor
  variant?: ComponentProps<typeof Button>["variant"]
  className?: string
}

/** Opens the localized manual-add instructions for one documented site type. */
export function ManualAddGuideButton({
  anchor,
  variant = "link",
  className,
}: ManualAddGuideButtonProps) {
  const { t, i18n } = useTranslation("accountDialog")

  const handleOpenGuide = () => {
    void createTab(getDocsManualAddGuideUrl(anchor, i18n.language), true)
  }

  return (
    <Button
      type="button"
      onClick={handleOpenGuide}
      variant={variant}
      size="sm"
      className={className}
      leftIcon={<BookOpen className="h-3.5 w-3.5" />}
    >
      {t("infoPanel.openManualAddGuide")}
    </Button>
  )
}
