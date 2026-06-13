import {
  BugAntIcon,
  ChatBubbleLeftEllipsisIcon,
  LanguageIcon,
  LightBulbIcon,
  PuzzlePieceIcon,
  UsersIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  openBugReportPage,
  openCommunityPage,
  openFeatureRequestPage,
  openLanguageRequestPage,
  openSiteSupportRequestPage,
} from "~/utils/navigation"

interface FeedbackDropdownMenuProps {
  language?: string
  align?: "start" | "center" | "end"
}

/**
 * Shared feedback shortcut menu used by extension surfaces that need quick access
 * to issue reporting, feature requests, and community channels.
 */
export function FeedbackDropdownMenu({
  language,
  align = "end",
}: FeedbackDropdownMenuProps) {
  const { t } = useTranslation("ui")

  return (
    <DropdownMenu>
      <Tooltip content={t("feedback.triggerTooltip")}>
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label={t("feedback.trigger")}
            className="touch-manipulation"
          >
            <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuItem onClick={() => void openBugReportPage()}>
          <BugAntIcon className="h-4 w-4" />
          {t("feedback.bugReport")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openFeatureRequestPage()}>
          <LightBulbIcon className="h-4 w-4" />
          {t("feedback.featureRequest")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openSiteSupportRequestPage()}>
          <PuzzlePieceIcon className="h-4 w-4" />
          {t("feedback.siteSupportRequest")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openLanguageRequestPage()}>
          <LanguageIcon className="h-4 w-4" />
          {t("feedback.languageRequest")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openCommunityPage(language)}>
          <UsersIcon className="h-4 w-4" />
          {t("feedback.community")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
