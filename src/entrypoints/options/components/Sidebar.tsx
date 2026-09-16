import OptionsSidebar, {
  type SidebarProps,
} from "~/features/OptionsMenu/OptionsSidebar"

import { menuItems } from "../constants"

/** Connect the options route catalog to the shared navigation view. */
export default function Sidebar(props: Omit<SidebarProps, "menuItems">) {
  return <OptionsSidebar {...props} menuItems={menuItems} />
}
