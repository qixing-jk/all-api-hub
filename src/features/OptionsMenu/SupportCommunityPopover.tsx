import { Heart, Users, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorBrandIcon } from "~/features/AccountManagement/sponsors/SponsorBrandIcon"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { cn } from "~/lib/utils"
import { createTab } from "~/utils/browser/tabs"
import { getDocsCommunityUrl } from "~/utils/navigation/docsLinks"

import { CommunityChannelIcon } from "./CommunityChannelIcon"
import type { CommunityChannel, CommunityQrCode } from "./communityResources"
import { CommunityWechatPreview } from "./CommunityWechatPreview"
import { useCommunityResources } from "./useCommunityResources"
import { useCommunityWechatImage } from "./useCommunityWechatImage"

export type SupportCommunitySection = "sponsors" | "community"

export interface SupportCommunityPopoverProps {
  section: SupportCommunitySection
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  children: ReactNode
}

/** Proper names stay local; WeChat and discussions use their translated labels. */
const COMMUNITY_LABELS: Partial<Record<CommunityChannel["id"], string>> = {
  telegram: "Telegram",
  discord: "Discord",
  qq: "QQ",
}

/**
 * Popover displaying sponsors or community channels directly adjacent to the
 * sidebar footer trigger button. Closes automatically on item selection or click away.
 */
export function SupportCommunityPopover({
  section,
  side = "top",
  align = "start",
  children,
}: SupportCommunityPopoverProps) {
  const { t, i18n } = useTranslation(["ui", "common"])
  const [open, setOpen] = useState(false)
  const [wechatQrCode, setWechatQrCode] = useState<CommunityQrCode | null>(null)
  const isSponsors = section === "sponsors"
  const community = useCommunityResources(!isSponsors, open)
  const availableWechatQrCode = community.channels?.find(
    (channel) => channel.id === "wechat",
  )?.qrCode
  const wechatImage = useCommunityWechatImage(
    isSponsors
      ? undefined
      : wechatQrCode ?? (open ? availableWechatQrCode : undefined),
  )

  const { items } = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
    enabled: isSponsors,
  })

  const openLink = (url: string) => {
    setOpen(false)
    void createTab(url, true)
  }

  const title = isSponsors
    ? t("ui:feedback.sponsor")
    : t("ui:feedback.community")

  const wechatLabel = t("ui:feedback.wechat")
  const openCommunityPage = () => {
    setWechatQrCode(null)
    openLink(getDocsCommunityUrl(i18n.language))
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side={side}
          align={align}
          sideOffset={8}
          className={cn("p-3 text-xs shadow-lg", isSponsors ? "w-80" : "w-72")}
        >
          <div className="text-foreground mb-2 flex items-center justify-between border-b pb-2 font-medium">
            <div className="flex items-center gap-1.5">
              {isSponsors ? (
                <Heart className="text-destructive-indicator size-3.5" />
              ) : (
                <Users className="text-sidebar-foreground size-3.5" />
              )}
              <span>{title}</span>
            </div>
            <button
              type="button"
              data-testid="support-popover-close"
              onClick={() => setOpen(false)}
              aria-label={t("common:actions.close")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60 -mr-1 rounded p-0.5 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {isSponsors ? (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`support-popover-sponsor-${item.id}`}
                  className="hover:bg-muted/70 flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2.5 text-left transition-colors"
                  onClick={() => openLink(item.links.primary)}
                >
                  <SponsorBrandIcon
                    sponsorId={item.id}
                    name={item.name}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground truncate text-xs font-semibold">
                      {item.name}
                    </div>
                    <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
                      {item.tagline}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {community.status === "loading" && (
                <p role="status" className="text-muted-foreground p-2 text-xs">
                  {t("common:status.loading")}
                </p>
              )}
              {community.status === "error" && (
                <p role="status" className="text-muted-foreground p-2 text-xs">
                  {t("ui:feedback.communityUnavailable")}
                </p>
              )}
              {community.channels?.map((channel) => {
                const { id } = channel
                const isWechat = id === "wechat"
                const channelLabel =
                  COMMUNITY_LABELS[id] ??
                  (isWechat ? wechatLabel : t("ui:feedback.discussion"))

                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`support-popover-channel-${id}`}
                    className="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                    onClick={() => {
                      if (channel.id === "wechat") {
                        setOpen(false)
                        setWechatQrCode(channel.qrCode)
                      } else {
                        openLink(channel.url)
                      }
                    }}
                  >
                    <CommunityChannelIcon channel={id} />
                    <span className="text-foreground truncate text-xs font-medium">
                      {channelLabel}
                    </span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={openCommunityPage}
                className="text-link mt-2 w-full border-t px-2.5 pt-2 text-left text-xs hover:underline"
              >
                {t("ui:feedback.openCommunityPage")}
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {section === "community" && wechatQrCode && (
        <CommunityWechatPreview
          image={wechatImage}
          onClose={() => setWechatQrCode(null)}
          onOpenCommunityPage={openCommunityPage}
        />
      )}
    </>
  )
}
