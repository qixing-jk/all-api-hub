import { useMemo } from "react"

import { isDevMenuItemId } from "~/constants/devOptionsMenuIds"
import OptionsSidebar, {
  type SidebarProps,
} from "~/features/OptionsMenu/OptionsSidebar"
import { useDevUnlocked } from "~/utils/core/devMode"

import { menuItems, preloadOptionsPage } from "../constants"

/** Connect the options route catalog to the shared navigation view. */
export default function Sidebar(props: Omit<SidebarProps, "menuItems">) {
  const isDev = useDevUnlocked()
  const visibleMenuItems = useMemo(
    () =>
      isDev ? menuItems : menuItems.filter((item) => !isDevMenuItemId(item.id)),
    [isDev],
  )

  return (
    <OptionsSidebar
      {...props}
      menuItems={visibleMenuItems}
      onMenuItemPreload={(id) => {
        void preloadOptionsPage(id).catch(() => undefined)
      }}
    />
  )
}
