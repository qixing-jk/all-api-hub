import type { TFunction } from "i18next"
import {
  Bug,
  Languages,
  Lightbulb,
  MessageSquareMore,
  Puzzle,
  Users,
} from "lucide-react"
import type { ComponentType } from "react"
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

type FeedbackMenuItemLabelKey =
  | "feedback.bugReport"
  | "feedback.featureRequest"
  | "feedback.siteSupportRequest"
  | "feedback.languageRequest"
  | "feedback.community"

type FeedbackMenuItem = {
  labelKey: FeedbackMenuItemLabelKey
  Icon: ComponentType<{ className?: string }>
  open: (language?: string) => void
}

export const FEEDBACK_MENU_ITEMS: readonly FeedbackMenuItem[] = [
  {
    labelKey: "feedback.bugReport",
    Icon: Bug,
    open: () => void openBugReportPage(),
  },
  {
    labelKey: "feedback.featureRequest",
    Icon: Lightbulb,
    open: () => void openFeatureRequestPage(),
  },
  {
    labelKey: "feedback.siteSupportRequest",
    Icon: Puzzle,
    open: () => void openSiteSupportRequestPage(),
  },
  {
    labelKey: "feedback.languageRequest",
    Icon: Languages,
    open: () => void openLanguageRequestPage(),
  },
  {
    labelKey: "feedback.community",
    Icon: Users,
    open: (language) => void openCommunityPage(language),
  },
]

/**
 * Resolves menu labels with literal translation keys so extraction keeps them.
 */
function getFeedbackMenuItemLabel(
  t: TFunction<"ui">,
  labelKey: FeedbackMenuItemLabelKey,
) {
  switch (labelKey) {
    case "feedback.bugReport":
      return t("feedback.bugReport")
    case "feedback.featureRequest":
      return t("feedback.featureRequest")
    case "feedback.siteSupportRequest":
      return t("feedback.siteSupportRequest")
    case "feedback.languageRequest":
      return t("feedback.languageRequest")
    case "feedback.community":
      return t("feedback.community")
  }
}

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
            <MessageSquareMore className="h-4 w-4" />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align={align} className="w-52">
        {FEEDBACK_MENU_ITEMS.map(({ labelKey, Icon, open }) => (
          <DropdownMenuItem key={labelKey} onClick={() => open(language)}>
            <Icon className="h-4 w-4" />
            {getFeedbackMenuItemLabel(t, labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
