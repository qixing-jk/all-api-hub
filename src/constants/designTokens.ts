/**
 * Design tokens for consistent UI styling
 * These tokens define the visual design language of the application
 */

// Color tokens
export const COLORS = {
  // Background colors
  background: {
    primary: "bg-card dark:bg-background",
    secondary: "bg-surface-subtle dark:bg-card",
    tertiary: "bg-muted dark:bg-secondary",
    elevated: "bg-card",
    overlay: "bg-overlay/50 dark:bg-overlay/70",
  },

  // Text colors
  text: {
    primary: "text-foreground",
    secondary: "text-muted-foreground dark:text-secondary-foreground",
    tertiary: "text-muted-foreground",
    inverse: "text-inverse-foreground",
    muted: "text-faint-foreground",
  },

  // Border colors
  border: {
    default: "border-border",
    subtle: "border-border-subtle dark:border-border",
    strong: "border-border-strong",
    focus: "border-theme-500 dark:border-theme-400",
  },
} as const

// Typography tokens
export const TYPOGRAPHY = {
  // Headings
  heading: {
    h1: "text-3xl font-bold text-foreground",
    h2: "text-2xl font-semibold text-foreground",
    h3: "text-xl font-semibold text-foreground",
    h4: "text-lg font-medium text-foreground",
    h5: "text-base font-medium text-foreground",
    h6: "text-sm font-medium text-foreground",
  },

  // Body text
  body: {
    large: "text-lg text-secondary-foreground",
    base: "text-base text-secondary-foreground",
    small: "text-sm text-muted-foreground dark:text-secondary-foreground",
    xs: "text-xs text-muted-foreground",
  },

  // Labels
  label: {
    base: "text-sm font-medium text-secondary-foreground",
    small: "text-xs font-medium text-muted-foreground",
  },

  // Captions and helper text
  caption: {
    base: "text-xs text-muted-foreground",
    muted: "text-xs text-faint-foreground",
  },
} as const

// Spacing tokens
export const SPACING = {
  // Padding
  padding: {
    xs: "p-1",
    sm: "p-2",
    base: "p-3",
    md: "p-4",
    lg: "p-6",
    xl: "p-8",
  },

  // Margin
  margin: {
    xs: "m-1",
    sm: "m-2",
    base: "m-3",
    md: "m-4",
    lg: "m-6",
    xl: "m-8",
  },

  // Gap
  gap: {
    xs: "gap-1",
    sm: "gap-2",
    base: "gap-3",
    md: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  },
} as const

// Border radius tokens
export const RADIUS = {
  none: "rounded-none",
  sm: "rounded-sm",
  base: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
} as const

/**
 * Close-fitting items use their container's resolved inner radius, with the
 * compact radius as a fallback outside a concentric container. Keep complete
 * Tailwind candidates here so both direct items and button groups are scanned.
 */
export const CORNERS = {
  item: "rounded-[var(--corner-inner-radius,var(--radius-sm))]",
  buttonItems:
    "[&>button]:rounded-[var(--corner-inner-radius,var(--radius-sm))]",
} as const

// Shadow tokens
export const SHADOWS = {
  none: "shadow-none",
  sm: "shadow-sm",
  base: "shadow",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
  "2xl": "shadow-2xl",
  inner: "shadow-inner",
} as const

// Animation tokens
export const ANIMATIONS = {
  transition: {
    fast: "transition-all duration-150 ease-in-out",
    base: "transition-all duration-200 ease-in-out",
    slow: "transition-all duration-300 ease-in-out",
  },

  hover: {
    scale: "hover:scale-105",
    lift: "hover:-translate-y-0.5",
    glow: "hover:shadow-lg",
  },
} as const

// Component-specific tokens
export const COMPONENTS = {
  // Button variants
  button: {
    primary:
      "bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-ring",
    secondary:
      "bg-secondary hover:bg-surface-strong text-foreground dark:hover:bg-background focus:ring-border-strong",
    outline:
      "border border-border-strong dark:border-border bg-transparent hover:bg-surface-subtle dark:hover:bg-card text-secondary-foreground focus:ring-ring",
    ghost:
      "bg-transparent hover:bg-muted dark:hover:bg-card text-secondary-foreground focus:ring-border-strong",
    danger:
      "bg-destructive hover:bg-destructive-hover text-destructive-foreground focus:ring-destructive-text",
    success:
      "bg-success hover:bg-success-hover text-success-foreground focus:ring-success-text",
  },

  // Input variants
  input: {
    base: "block w-full px-3 py-density-2 border border-input rounded-md text-sm placeholder:text-muted-foreground bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors",
    error:
      "border-destructive-border focus:ring-destructive-text focus:border-destructive-border",
    success:
      "border-success-border focus:ring-success-text focus:border-success-border",
  },

  // Card variants
  card: {
    base: "bg-card border border-border rounded-lg shadow-sm",
    elevated: "bg-card border border-border rounded-lg shadow-md",
    interactive:
      "bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow",
  },
} as const

// Layout tokens
export const LAYOUT = {
  // Container sizes
  container: {
    xs: "max-w-xs",
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  },

  // Flexbox utilities
  flex: {
    center: "flex items-center justify-center",
    "center-x": "flex justify-center",
    "center-y": "flex items-center",
    between: "flex items-center justify-between",
    start: "flex items-center justify-start",
    end: "flex items-center justify-end",
  },

  // Grid utilities
  grid: {
    "2": "grid grid-cols-2 gap-4",
    "3": "grid grid-cols-3 gap-4",
    "4": "grid grid-cols-4 gap-4",
    auto: "grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4",
  },
} as const

// App-level layering order from lower to higher priority.
// Prefer these roles for page-shell and portal surfaces instead of raw z-* classes.
export const Z_INDEX = {
  tableStickyCell: "z-10",
  tableStickyHeader: "z-20",
  pageHeader: "z-30",
  backdrop: "z-40",
  sidebar: "z-50",
  floating: "z-[60]",
  modal: "z-[70]",
  modalFloating: "z-[75]",
  tooltip: "z-[80]",
} as const
