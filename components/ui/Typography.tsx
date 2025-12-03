import { cva, type VariantProps } from "class-variance-authority"
import React, { JSX } from "react"

import { cn } from "~/lib/utils"

const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-3xl font-bold text-gray-900 dark:text-dark-text-primary",
      h2: "text-2xl font-semibold text-gray-900 dark:text-dark-text-primary",
      h3: "text-xl font-semibold text-gray-900 dark:text-dark-text-primary",
      h4: "text-lg font-medium text-gray-900 dark:text-dark-text-primary",
      h5: "text-base font-medium text-gray-900 dark:text-dark-text-primary",
      h6: "text-sm font-medium text-gray-900 dark:text-dark-text-primary",
      body: "text-base text-gray-700 dark:text-dark-text-secondary",
      "body-large": "text-lg text-gray-700 dark:text-dark-text-secondary",
      "body-small": "text-sm text-gray-600 dark:text-dark-text-secondary",
      caption: "text-xs text-gray-500 dark:text-dark-text-tertiary",
      muted: "text-xs text-gray-400 dark:text-gray-500",
      label: "text-sm font-medium text-gray-700 dark:text-dark-text-secondary",
      "label-small":
        "text-xs font-medium text-gray-600 dark:text-dark-text-tertiary",
      link: "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline-offset-4 hover:underline",
      code: "font-mono text-sm bg-gray-100 dark:bg-dark-bg-tertiary px-1.5 py-0.5 rounded text-gray-800 dark:text-dark-text-primary",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
      justify: "text-justify",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    size: {
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
  },
  defaultVariants: {
    variant: "body",
    align: "left",
    // Note: weight intentionally has no default to allow variant-specific weights
  },
})

export interface TypographyProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof typographyVariants> {
  as?: keyof JSX.IntrinsicElements
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant, align, weight, size, as, ...props }, ref) => {
    // Determine the HTML element based on variant or as prop
    const getElement = () => {
      if (as) return as

      switch (variant) {
        case "h1":
          return "h1"
        case "h2":
          return "h2"
        case "h3":
          return "h3"
        case "h4":
          return "h4"
        case "h5":
          return "h5"
        case "h6":
          return "h6"
        case "code":
          return "code"
        default:
          return "p"
      }
    }

    const Component = getElement() as any

    return (
      <Component
        ref={ref}
        className={cn(
          typographyVariants({ variant, align, weight, size, className }),
        )}
        {...props}
      />
    )
  },
)
Typography.displayName = "Typography"

// Convenience components for common typography patterns
const Heading1 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h1" as="h1" {...props} />)
Heading1.displayName = "Heading1"

const Heading2 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h2" as="h2" {...props} />)
Heading2.displayName = "Heading2"

const Heading3 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h3" as="h3" {...props} />)
Heading3.displayName = "Heading3"

const Heading4 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h4" as="h4" {...props} />)
Heading4.displayName = "Heading4"

const Heading5 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h5" as="h5" {...props} />)
Heading5.displayName = "Heading5"

const Heading6 = React.forwardRef<
  HTMLHeadingElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="h6" as="h6" {...props} />)
Heading6.displayName = "Heading6"

const Body = React.forwardRef<
  HTMLParagraphElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="body" as="p" {...props} />)
Body.displayName = "Body"

const BodyLarge = React.forwardRef<
  HTMLParagraphElement,
  Omit<TypographyProps, "variant">
>((props, ref) => (
  <Typography ref={ref} variant="body-large" as="p" {...props} />
))
BodyLarge.displayName = "BodyLarge"

const BodySmall = React.forwardRef<
  HTMLParagraphElement,
  Omit<TypographyProps, "variant">
>((props, ref) => (
  <Typography ref={ref} variant="body-small" as="p" {...props} />
))
BodySmall.displayName = "BodySmall"

const Caption = React.forwardRef<
  HTMLSpanElement,
  Omit<TypographyProps, "variant">
>((props, ref) => (
  <Typography ref={ref} variant="caption" as="span" {...props} />
))
Caption.displayName = "Caption"

const Muted = React.forwardRef<
  HTMLSpanElement,
  Omit<TypographyProps, "variant">
>((props, ref) => <Typography ref={ref} variant="muted" as="span" {...props} />)
Muted.displayName = "Muted"

const Link = React.forwardRef<
  HTMLAnchorElement,
  Omit<TypographyProps, "variant"> &
    React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }
>(({ href, ...props }, ref) => (
  <Typography ref={ref} variant="link" as="a" {...(props as any)} href={href} />
))
Link.displayName = "Link"

const Code = React.forwardRef<HTMLElement, Omit<TypographyProps, "variant">>(
  (props, ref) => <Typography ref={ref} variant="code" as="code" {...props} />,
)
Code.displayName = "Code"

export {
  Typography,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Body,
  BodyLarge,
  BodySmall,
  Caption,
  Muted,
  Link,
  Code,
  typographyVariants,
}
