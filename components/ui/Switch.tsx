import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const switchVariants = cva(
  "relative inline-flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
  {
    variants: {
      checked: {
        true: "bg-blue-600",
        false: "bg-gray-200 dark:bg-dark-bg-tertiary",
      },
      size: {
        sm: "h-5 w-9",
        default: "h-6 w-11",
        lg: "h-7 w-14",
      },
      disabled: {
        true: "opacity-50 cursor-not-allowed",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      checked: false,
      disabled: false,
    },
  },
)

const thumbVariants = cva(
  "inline-block transform rounded-full bg-white transition-transform",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        default: "h-4 w-4",
        lg: "h-5 w-5",
      },
      checked: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        size: "sm",
        checked: true,
        className: "translate-x-4",
      },
      {
        size: "default",
        checked: true,
        className: "translate-x-6",
      },
      {
        size: "lg",
        checked: true,
        className: "translate-x-8",
      },
      {
        size: "sm",
        checked: false,
        className: "translate-x-1",
      },
      {
        size: "default",
        checked: false,
        className: "translate-x-1",
      },
      {
        size: "lg",
        checked: false,
        className: "translate-x-1",
      },
    ],
    defaultVariants: {
      size: "default",
      checked: false,
    },
  },
)

export interface SwitchProps
  extends Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      "onChange" | "value"
    >,
    Omit<VariantProps<typeof switchVariants>, "disabled"> {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  size,
  disabled,
  className,
  ...props
}) => {
  return (
    <HeadlessSwitch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className={cn(switchVariants({ checked, size, disabled, className }))}
      {...props}
    >
      <span className="sr-only">Toggle</span>
      <span className={cn(thumbVariants({ checked, size }))} />
    </HeadlessSwitch>
  )
}

export { switchVariants }
