import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

import { useFloatingLayerClass } from "./floating-layer"

const SelectViewportResizeContext = React.createContext(false)

interface SelectViewportResizeProviderProps {
  children: React.ReactNode
  preserveOpen: boolean
}

/**
 * Configures whether descendant selects stay open during a viewport resize.
 * Action popups need this because opening a floating layer can resize the
 * browser-owned popup viewport synchronously.
 */
function SelectViewportResizeProvider({
  children,
  preserveOpen,
}: SelectViewportResizeProviderProps) {
  return (
    <SelectViewportResizeContext.Provider value={preserveOpen}>
      {children}
    </SelectViewportResizeContext.Provider>
  )
}

type SelectRootProps = React.ComponentProps<typeof SelectPrimitive.Root>

/** Keeps a controlled or uncontrolled Select open for the active resize event. */
function ResizeStableSelect({
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  )
  const resizeEventActiveRef = React.useRef(false)
  const resizeResetTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const interactionResetTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const pointerStartedWhileOpenRef = React.useRef(false)
  const userCloseIntentRef = React.useRef(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const openRef = React.useRef(open)

  React.useEffect(() => {
    openRef.current = open
  }, [open])

  React.useEffect(() => {
    const handleResize = () => {
      resizeEventActiveRef.current = true
      if (resizeResetTimeoutRef.current !== null) {
        clearTimeout(resizeResetTimeoutRef.current)
      }
      // Radix forwards its controlled close after the native listener returns.
      // Keep the marker through those microtasks, then clear it before the next
      // user interaction task.
      resizeResetTimeoutRef.current = setTimeout(() => {
        resizeEventActiveRef.current = false
        resizeResetTimeoutRef.current = null
      }, 0)
    }

    // Capture runs before Radix's window resize listener, which synchronously
    // requests that the Select close during the same event dispatch.
    window.addEventListener("resize", handleResize, true)
    return () => {
      window.removeEventListener("resize", handleResize, true)
      if (resizeResetTimeoutRef.current !== null) {
        clearTimeout(resizeResetTimeoutRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    const scheduleIntentReset = () => {
      if (interactionResetTimeoutRef.current !== null) {
        clearTimeout(interactionResetTimeoutRef.current)
      }
      interactionResetTimeoutRef.current = setTimeout(() => {
        userCloseIntentRef.current = false
        interactionResetTimeoutRef.current = null
      }, 0)
    }
    const handlePointerDown = () => {
      pointerStartedWhileOpenRef.current = openRef.current
      if (pointerStartedWhileOpenRef.current) {
        userCloseIntentRef.current = true
      }
    }
    const handlePointerEnd = () => {
      const startedWhileOpen = pointerStartedWhileOpenRef.current
      pointerStartedWhileOpenRef.current = false
      if (!startedWhileOpen) return
      userCloseIntentRef.current = true
      scheduleIntentReset()
    }
    const handleClick = (event: MouseEvent) => {
      // Pointer interactions are classified from their pointerdown state.
      // detail=0 covers keyboard and assistive-technology click activation.
      if (event.detail !== 0 || !openRef.current) return
      userCloseIntentRef.current = true
      scheduleIntentReset()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!openRef.current || ![" ", "Enter", "Escape"].includes(event.key)) {
        return
      }
      userCloseIntentRef.current = true
      scheduleIntentReset()
    }

    document.addEventListener("click", handleClick, true)
    document.addEventListener("keydown", handleKeyDown, true)
    document.addEventListener("pointercancel", handlePointerEnd, true)
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("pointerup", handlePointerEnd, true)
    return () => {
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("keydown", handleKeyDown, true)
      document.removeEventListener("pointercancel", handlePointerEnd, true)
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("pointerup", handlePointerEnd, true)
      if (interactionResetTimeoutRef.current !== null) {
        clearTimeout(interactionResetTimeoutRef.current)
      }
    }
  }, [])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        resizeEventActiveRef.current &&
        !userCloseIntentRef.current
      ) {
        return
      }

      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )

  return (
    <SelectPrimitive.Root
      data-slot="select"
      {...props}
      open={open}
      onOpenChange={handleOpenChange}
    />
  )
}

/**
 * Select provides a Radix-based select root for controlled value and open state.
 */
function Select({ ...props }: SelectRootProps) {
  const preserveOpenOnResize = React.useContext(SelectViewportResizeContext)

  if (preserveOpenOnResize) {
    return <ResizeStableSelect {...props} />
  }

  return <SelectPrimitive.Root data-slot="select" {...props} />
}

/**
 * SelectGroup groups related select items.
 */
function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Value
    ref={ref}
    data-slot="select-value"
    className={className}
    {...props}
  />
))
SelectValue.displayName = SelectPrimitive.Value.displayName

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    size?: "sm" | "default"
  }
>(({ className, children, size = "default", ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    data-size={size}
    className={cn(
      "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm whitespace-nowrap text-gray-900 shadow-xs transition-colors outline-none hover:bg-gray-50 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/40 data-placeholder:text-gray-400 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:aria-invalid:border-red-400 dark:aria-invalid:focus-visible:ring-red-400/40 dark:data-placeholder:text-gray-500 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-gray-400 dark:[&_svg:not([class*='text-'])]:text-gray-500",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="size-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    position?: "item-aligned" | "popper"
  }
>(
  (
    { className, children, position = "popper", align = "center", ...props },
    ref,
  ) => {
    const floatingLayerClass = useFloatingLayerClass()

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          data-slot="select-content"
          className={cn(
            "dark:border-dark-bg-tertiary/80 dark:bg-dark-bg-secondary dark:text-dark-text-primary data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border border-gray-200 bg-white text-gray-900 shadow-lg ring-1 ring-black/5 dark:ring-white/5",
            floatingLayerClass,
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className,
          )}
          position={position}
          align={align}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
                "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1",
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    )
  },
)
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    data-slot="select-label"
    className={cn(
      "px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400",
      className,
    )}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(
      "dark:text-dark-text-primary dark:focus:bg-dark-bg-tertiary/80 dark:focus:text-dark-text-primary relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 outline-hidden transition-colors select-none focus:bg-blue-50 focus:text-gray-900 data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=checked]:text-gray-900 dark:data-[state=checked]:text-white [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-4 text-blue-500 dark:text-blue-400" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    data-slot="select-separator"
    className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    data-slot="select-scroll-up-button"
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronUpIcon className="size-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    data-slot="select-scroll-down-button"
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronDownIcon className="size-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewportResizeProvider,
}
