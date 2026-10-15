export const SIDE_PANEL_NAVIGATION_DESTINATIONS = {
  SidePanel: "sidepanel",
  Options: "options",
} as const

export type SidePanelNavigationDestination =
  (typeof SIDE_PANEL_NAVIGATION_DESTINATIONS)[keyof typeof SIDE_PANEL_NAVIGATION_DESTINATIONS]
