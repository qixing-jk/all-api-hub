import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/Textarea"
import { cn } from "~/lib/utils"

/**
 * Wrapper that groups an input control with addons/buttons and applies shared
 * focus/error styling for the whole group.
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group border-input dark:bg-input/30 relative flex w-full items-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
        "h-(--density-control) min-w-0 has-[>textarea]:h-auto",

        // Variants based on alignment.
        "has-[>[data-align=inline-start]]:[&>input]:pl-2",
        "has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[>[data-align=block-start]]:[&>input]:pb-density-3 has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col",
        "has-[>[data-align=block-end]]:[&>input]:pt-density-3 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col",

        // Focus state.
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]",

        // Error state.
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",

        className,
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "text-muted-foreground flex h-auto cursor-text items-center justify-center gap-density-2 py-density-1-5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-xs group-data-[disabled=true]/input-group:opacity-50",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
        "inline-end":
          "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
        "block-start":
          "order-first w-full justify-start px-3 pt-density-3 [.border-b]:pb-density-3 group-has-[>input]/input-group:pt-density-2-5",
        "block-end":
          "order-last w-full justify-start px-3 pb-density-3 [.border-t]:pt-density-3 group-has-[>input]/input-group:pb-density-2-5",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
)

/**
 * Non-interactive addon container used inside an `InputGroup` (e.g. icon, label,
 * keyboard hint). Clicking the addon focuses the nearest input by default.
 */
function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "min-h-0 text-sm shadow-none flex gap-density-2 items-center",
  {
    variants: {
      size: {
        xs: "h-(--density-control-xs) gap-density-1 px-2 rounded-xs [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
        sm: "h-(--density-control-sm) px-2.5 gap-density-1-5 rounded-sm has-[>svg]:px-2.5",
        "icon-xs": "size-(--density-control-xs) rounded-xs p-0 has-[>svg]:p-0",
        "icon-sm": "size-(--density-control-sm) rounded-sm p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  },
)

/**
 * Button variant intended for compact actions inside an `InputGroup`.
 */
function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

/**
 * Inline text element for read-only content inside an `InputGroup`.
 */
function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-muted-foreground gap-density-2 flex items-center text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

/**
 * `Input` control wired for `InputGroup` focus/error styling.
 */
function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      containerClassName="min-w-0 flex-1"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus:ring-0 focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  )
}

/**
 * `Textarea` control wired for `InputGroup` focus/error styling.
 */
function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "py-density-3 flex-1 resize-none rounded-none border-0 bg-transparent shadow-none focus:ring-0 focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
