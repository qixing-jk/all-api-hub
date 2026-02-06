import { Menu, MenuButton, MenuItems } from "@headlessui/react"
import {
  ArrowTopRightOnSquareIcon,
  EllipsisHorizontalIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { PinIcon, PinOffIcon } from "lucide-react"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  BodySmall,
  Button,
  Caption,
  CardItem,
  IconButton,
} from "~/components/ui"
import { useDevice } from "~/contexts/DeviceContext"
import { AccountActionMenuItem } from "~/features/AccountManagement/components/AccountActionButtons/AccountActionMenuItem"
import { cn } from "~/lib/utils"
import type { SiteBookmark } from "~/types"

export interface BookmarkListItemProps {
  bookmark: SiteBookmark & { tags?: string[] }
  isPinned: boolean
  onOpen: () => void
  onCopyUrl: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}

/**
 * Renders a single bookmark row with actions (open/copy/edit/delete + pin/unpin).
 * The bookmark name and URL are clickable, matching the account list behavior.
 */
export default function BookmarkListItem({
  bookmark,
  isPinned,
  onOpen,
  onCopyUrl,
  onEdit,
  onDelete,
  onTogglePin,
}: BookmarkListItemProps) {
  const { t } = useTranslation(["bookmark", "common"])
  const { isTouchDevice } = useDevice()

  const revealButtonsClass = isTouchDevice
    ? ""
    : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto"

  const pinLabel = isPinned
    ? t("bookmark:actions.unpin")
    : t("bookmark:actions.pin")
  const PinToggleIcon = isPinned ? PinOffIcon : PinIcon

  const handleOpenClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onOpen()
  }

  return (
    <CardItem
      padding="none"
      className={cn("group touch-manipulation transition-all")}
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 overflow-x-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-w-0 shrink justify-start p-0 text-left"
              title={bookmark.name}
              onClick={handleOpenClick}
            >
              <BodySmall weight="medium" className="truncate">
                {bookmark.name}
              </BodySmall>
            </Button>
            {isPinned && (
              <PinIcon className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-300" />
            )}
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto w-full min-w-0 justify-start p-0 text-left"
            title={bookmark.url}
            onClick={handleOpenClick}
          >
            <Caption className="truncate">{bookmark.url}</Caption>
          </Button>
          {bookmark.tags && bookmark.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {bookmark.tags.slice(0, 6).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div
          className={`shrink-0 transition-opacity duration-200 ${revealButtonsClass}`}
        >
          <div className="grid grid-cols-2 justify-end gap-2 sm:grid-cols-4">
            <IconButton
              onClick={onOpen}
              variant="ghost"
              size="sm"
              aria-label={t("bookmark:actions.open")}
              title={t("bookmark:actions.open")}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </IconButton>

            <IconButton
              onClick={onCopyUrl}
              variant="ghost"
              size="sm"
              aria-label={t("bookmark:actions.copyUrl")}
              title={t("bookmark:actions.copyUrl")}
            >
              <LinkIcon className="h-4 w-4" />
            </IconButton>

            <IconButton
              onClick={onEdit}
              variant="ghost"
              size="sm"
              aria-label={t("common:actions.edit")}
              title={t("common:actions.edit")}
            >
              <PencilIcon className="h-4 w-4" />
            </IconButton>

            <Menu as="div" className="relative">
              <MenuButton
                as={IconButton}
                variant="ghost"
                size="sm"
                aria-label={t("common:actions.more")}
              >
                <EllipsisHorizontalIcon className="h-4 w-4" />
              </MenuButton>

              <MenuItems
                anchor="bottom end"
                className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary z-50 rounded-lg border border-gray-200 bg-white py-1 shadow-lg [--anchor-gap:4px] [--anchor-padding:8px] focus:outline-none"
              >
                <AccountActionMenuItem
                  onClick={() => onTogglePin()}
                  icon={PinToggleIcon}
                  label={pinLabel}
                />
                <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />
                <AccountActionMenuItem
                  onClick={() => onDelete()}
                  icon={TrashIcon}
                  label={t("common:actions.delete")}
                  isDestructive={true}
                />
              </MenuItems>
            </Menu>
          </div>
        </div>
      </div>
    </CardItem>
  )
}
