import {
  Heart,
  MessageCircle,
  MessagesSquare,
  QrCode,
  Send,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ImageLightbox } from "~/components/ui/ImageLightbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { REPO_URL } from "~/constants/about"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorBrandIcon } from "~/features/AccountManagement/sponsors/SponsorBrandIcon"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { cn } from "~/lib/utils"
import { createTab } from "~/utils/browser/tabs"
import wechatGroupImage from "~~/resources/wechat_group.png"

export type SupportCommunitySection = "sponsors" | "community"

export interface SupportCommunityPopoverProps {
  section: SupportCommunitySection
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  children: ReactNode
}

interface CommunityChannel {
  id: string
  Icon: LucideIcon
  /** Proper-noun label shown as-is; omitted when the label is translated. */
  label?: string
  /** Direct invite link; omitted when an image preview lightbox is used instead. */
  url?: string
}

/**
 * Community hub destinations. WeChat ships as a QR code and opens an image lightbox preview.
 */
const COMMUNITY_CHANNELS: readonly CommunityChannel[] = [
  {
    id: "telegram",
    Icon: Send,
    label: "Telegram",
    url: "https://t.me/qixing_chat",
  },
  {
    id: "discord",
    Icon: MessagesSquare,
    label: "Discord",
    url: "https://discord.gg/RmFXZ577ZQ",
  },
  {
    id: "qq",
    Icon: MessageCircle,
    label: "QQ",
    url: "https://qm.qq.com/q/ebSCy31Phe",
  },
  { id: "wechat", Icon: QrCode },
  { id: "discussions", Icon: Users, url: `${REPO_URL}/discussions` },
] as const

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
  const { t } = useTranslation(["ui", "common"])
  const [open, setOpen] = useState(false)
  const [isWechatLightboxOpen, setIsWechatLightboxOpen] = useState(false)
  const isSponsors = section === "sponsors"

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
              {COMMUNITY_CHANNELS.map(({ id, Icon, label, url }) => {
                const isWechat = id === "wechat"
                const channelLabel =
                  label ??
                  (isWechat ? wechatLabel : t("ui:feedback.discussion"))

                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`support-popover-channel-${id}`}
                    className="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                    onClick={() => {
                      if (isWechat) {
                        setOpen(false)
                        setIsWechatLightboxOpen(true)
                      } else if (url) {
                        openLink(url)
                      }
                    }}
                  >
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="text-foreground truncate text-xs font-medium">
                      {channelLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {section === "community" && (
        <ImageLightbox
          isOpen={isWechatLightboxOpen}
          onClose={() => setIsWechatLightboxOpen(false)}
          src={wechatGroupImage}
          alt={wechatLabel}
          title={wechatLabel}
        />
      )}
    </>
  )
}
