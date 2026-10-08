import { BookOpen, Heart, Star, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import { REPO_URL } from "~/constants/about"
import { useIsStarred } from "~/features/StarPromotion/useStarPromotionActive"
import { cn } from "~/lib/utils"
import { createTab } from "~/utils/browser/tabs"
import { getDocsHomepageUrl } from "~/utils/navigation/docsLinks"

import { SupportCommunityPopover } from "./SupportCommunityPopover"

export interface OptionsSidebarFooterProps {
  isCollapsed?: boolean
  onMenuItemClick?: (itemId: string) => void
}

/**
 * Options sidebar footer providing ecosystem shortcuts:
 * - GitHub (reflects Star reminder status without redundant interactive sub-buttons)
 * - Official Documentation (BookOpen)
 * - Sponsor & Support (Heart)
 * - Community Hub (Send / Paper airplane)
 */
export function OptionsSidebarFooter({
  isCollapsed = false,
}: OptionsSidebarFooterProps) {
  const { t, i18n } = useTranslation(["ui", "about"])
  const isStarred = useIsStarred()

  const handleStarClick = () => {
    void createTab(REPO_URL, true)
  }

  const starTooltip = isStarred
    ? t("ui:starPromotion.actions.alreadyStarred")
    : t("ui:feedback.starOnGithub")
  const githubLabel = t("ui:sidebarFooter.github")
  const docsLabel = t("ui:sidebarFooter.docs")
  const docsTitle = t("about:homepageDesc")
  const sponsorLabel = t("ui:sidebarFooter.sponsor")
  const sponsorTitle = t("ui:feedback.sponsorTitle")
  const communityLabel = t("ui:sidebarFooter.community")
  const communityTitle = t("about:feedbackSection.community.description")

  if (isCollapsed) {
    return (
      <div
        data-testid="options-sidebar-footer"
        className="border-sidebar-border mt-auto flex flex-col items-center gap-1.5 border-t py-2.5"
      >
        {/* GitHub / Star */}
        <button
          type="button"
          data-testid="sidebar-footer-github"
          onClick={handleStarClick}
          title={starTooltip}
          aria-label={starTooltip}
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring group flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
        >
          {isStarred ? (
            <Star className="fill-star text-star size-4 shrink-0 transition-colors" />
          ) : (
            <Star className="text-sidebar-foreground/70 group-hover:text-star size-4 shrink-0 transition-colors" />
          )}
        </button>

        {/* Documentation */}
        <button
          type="button"
          data-testid="sidebar-footer-docs"
          onClick={() =>
            void createTab(getDocsHomepageUrl(i18n.language), true)
          }
          title={docsTitle}
          aria-label={docsLabel}
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
        >
          <BookOpen className="size-4 shrink-0" />
        </button>

        {/* Sponsor */}
        <SupportCommunityPopover section="sponsors" side="right" align="center">
          <button
            type="button"
            data-testid="sidebar-footer-sponsor"
            title={sponsorTitle}
            aria-label={sponsorLabel}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
          >
            <Heart className="text-destructive-indicator/80 size-4 shrink-0" />
          </button>
        </SupportCommunityPopover>

        {/* Community */}
        <SupportCommunityPopover
          section="community"
          side="right"
          align="center"
        >
          <button
            type="button"
            data-testid="sidebar-footer-community"
            title={communityTitle}
            aria-label={communityLabel}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
          >
            <Users className="size-4 shrink-0" />
          </button>
        </SupportCommunityPopover>
      </div>
    )
  }

  return (
    <div
      data-testid="options-sidebar-footer"
      className="border-sidebar-border mt-auto border-t p-2"
    >
      <div className="grid grid-cols-2 gap-1">
        {/* GitHub / Star Button */}
        <button
          type="button"
          data-testid="sidebar-footer-github"
          onClick={handleStarClick}
          title={starTooltip}
          aria-label={starTooltip}
          className={cn(
            "group focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2",
            isStarred
              ? "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Star
            data-testid="sidebar-footer-star-icon"
            className={cn(
              "size-3.5 shrink-0 transition-colors",
              isStarred
                ? "fill-star text-star"
                : "text-sidebar-foreground/70 group-hover:text-star",
            )}
          />
          <span className="truncate">{githubLabel}</span>
        </button>

        {/* Docs Button */}
        <button
          type="button"
          data-testid="sidebar-footer-docs"
          onClick={() =>
            void createTab(getDocsHomepageUrl(i18n.language), true)
          }
          title={docsTitle}
          aria-label={docsLabel}
          className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <BookOpen className="text-sidebar-foreground/70 size-3.5 shrink-0" />
          <span className="truncate">{docsLabel}</span>
        </button>

        {/* Sponsor Button */}
        <SupportCommunityPopover section="sponsors" side="top" align="start">
          <button
            type="button"
            data-testid="sidebar-footer-sponsor"
            title={sponsorTitle}
            aria-label={sponsorLabel}
            className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
          >
            <Heart className="text-destructive-indicator/80 size-3.5 shrink-0" />
            <span className="truncate">{sponsorLabel}</span>
          </button>
        </SupportCommunityPopover>

        {/* Community Button */}
        <SupportCommunityPopover section="community" side="top" align="end">
          <button
            type="button"
            data-testid="sidebar-footer-community"
            title={communityTitle}
            aria-label={communityLabel}
            className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
          >
            <Users className="text-sidebar-foreground/70 size-3.5 shrink-0" />
            <span className="truncate">{communityLabel}</span>
          </button>
        </SupportCommunityPopover>
      </div>
    </div>
  )
}
