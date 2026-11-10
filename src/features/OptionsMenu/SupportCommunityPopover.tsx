import { Heart, Users, X } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_BRAND_ICON_SIZES,
  SponsorBrandIcon,
} from "~/features/AccountManagement/sponsors/SponsorBrandIcon"
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
  const titleId = useId()
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
      : (wechatQrCode ?? (open ? availableWechatQrCode : undefined)),
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
          aria-labelledby={titleId}
          side={side}
          align={align}
          sideOffset={8}
          className={cn("p-3 text-xs shadow-lg", isSponsors ? "w-80" : "w-72")}
        >
          <PopoverHeader className="mb-2 flex-row items-center justify-between border-b pb-2 font-medium text-foreground">
            <div className="flex items-center gap-1.5">
              {isSponsors ? (
                <Heart className="size-3.5 text-destructive-indicator" />
              ) : (
                <Users className="size-3.5 text-sidebar-foreground" />
              )}
              <PopoverTitle id={titleId} className="text-xs">
                {title}
              </PopoverTitle>
            </div>
            <button
              type="button"
              data-testid="support-popover-close"
              onClick={() => setOpen(false)}
              aria-label={t("common:actions.close")}
              className="-mr-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </PopoverHeader>

          {isSponsors ? (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`support-popover-sponsor-${item.id}`}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/70"
                  onClick={() => openLink(item.links.primary)}
                >
                  <SponsorBrandIcon
                    sponsorId={item.id}
                    name={item.name}
                    iconUrl={item.iconUrl}
                    size={SPONSOR_BRAND_ICON_SIZES.Md}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">
                      {item.name}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {item.tagline}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {community.status === "loading" && (
                <p role="status" className="p-2 text-xs text-muted-foreground">
                  {t("common:status.loading")}
                </p>
              )}
              {community.status === "error" && (
                <p role="status" className="p-2 text-xs text-muted-foreground">
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
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
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
                    <span className="truncate text-xs font-medium text-foreground">
                      {channelLabel}
                    </span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={openCommunityPage}
                className="mt-2 w-full border-t px-2.5 pt-2 text-left text-xs text-link hover:underline"
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
