import { Tabs as TabsPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

type TabsVariant = "default" | "line" | "unstyled"
const TabsStyleContext = React.createContext<TabsVariant>("unstyled")

/** Manages selection and forwards the orientation to Radix keyboard navigation. */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn(
        orientation === "vertical" && "flex min-w-0 gap-density-4",
        className,
      )}
      {...props}
    />
  )
}

/** Shared styling is opt-in so existing specialized tab layouts remain compatible. */
function TabsList({
  className,
  variant = "unstyled",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: TabsVariant
}) {
  return (
    <TabsStyleContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant !== "unstyled" &&
            "group/tabs-list inline-flex min-w-0 gap-x-1 gap-y-density-1 data-[orientation=vertical]:flex-col",
          variant === "default" &&
            "rounded-lg bg-muted px-1 py-density-1 [--corner-inset:4px] corners-concentric",
          variant === "line" && "gap-density-2 bg-transparent",
          className,
        )}
        {...props}
      />
    </TabsStyleContext.Provider>
  )
}

/** Keeps common focus, disabled, and selection feedback in the shared primitive. */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsStyleContext)
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        variant !== "unstyled" &&
          "flex min-h-(--density-control-sm) min-w-0 items-center justify-center gap-x-2 gap-y-density-2 px-2.5 py-density-1-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        variant === "default" &&
          "rounded-md data-[state=active]:bg-card data-[state=active]:shadow-sm",
        variant === "line" &&
          "border-b-2 border-transparent group-data-[orientation=vertical]/tabs-list:justify-start group-data-[orientation=vertical]/tabs-list:border-b-0 group-data-[orientation=vertical]/tabs-list:border-l-2 data-[state=active]:border-primary",
        className,
      )}
      {...props}
    />
  )
}

/** Renders the panel for the selected tab. */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
