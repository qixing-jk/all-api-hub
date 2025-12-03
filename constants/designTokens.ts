/**
 * Design tokens for consistent UI styling
 * These tokens define the visual design language of the application
 */

// Color tokens
export const COLORS = {
  // Background colors
  background: {
    primary: "bg-white dark:bg-dark-bg-primary",
    secondary: "bg-gray-50 dark:bg-dark-bg-secondary",
    tertiary: "bg-gray-100 dark:bg-dark-bg-tertiary",
    elevated: "bg-white dark:bg-dark-bg-secondary",
    overlay: "bg-black/50 dark:bg-black/70",
  },

  // Text colors
  text: {
    primary: "text-gray-900 dark:text-dark-text-primary",
    secondary: "text-gray-600 dark:text-dark-text-secondary",
    tertiary: "text-gray-500 dark:text-dark-text-tertiary",
    inverse: "text-white dark:text-gray-900",
    muted: "text-gray-400 dark:text-gray-500",
  },

  // Border colors
  border: {
    default: "border-gray-200 dark:border-dark-bg-tertiary",
    subtle: "border-gray-100 dark:border-gray-700",
    strong: "border-gray-300 dark:border-gray-600",
    focus: "border-blue-500 dark:border-blue-400",
  },

  // Semantic colors
  // semantic: {
  //   success: {
  //     bg: "bg-semantic-success-50 dark:bg-semantic-success-900/20",
  //     border: "border-semantic-success-200 dark:border-semantic-success-800",
  //     text: "text-semantic-success-800 dark:text-semantic-success-200",
  //     icon: "text-semantic-success-600 dark:text-semantic-success-400"
  //   },
  //   warning: {
  //     bg: "bg-semantic-warning-50 dark:bg-semantic-warning-900/20",
  //     border: "border-semantic-warning-200 dark:border-semantic-warning-800",
  //     text: "text-semantic-warning-800 dark:text-semantic-warning-200",
  //     icon: "text-semantic-warning-600 dark:text-semantic-warning-400"
  //   },
  //   error: {
  //     bg: "bg-semantic-error-50 dark:bg-semantic-error-900/20",
  //     border: "border-semantic-error-200 dark:border-semantic-error-800",
  //     text: "text-semantic-error-800 dark:text-semantic-error-200",
  //     icon: "text-semantic-error-600 dark:text-semantic-error-400"
  //   },
  //   info: {
  //     bg: "bg-semantic-info-50 dark:bg-semantic-info-900/20",
  //     border: "border-semantic-info-200 dark:border-semantic-info-800",
  //     text: "text-semantic-info-800 dark:text-semantic-info-200",
  //     icon: "text-semantic-info-600 dark:text-semantic-info-400"
  //   }
  // }
} as const

// Typography tokens
export const TYPOGRAPHY = {
  // Headings
  heading: {
    h1: "text-3xl font-bold text-gray-900 dark:text-dark-text-primary",
    h2: "text-2xl font-semibold text-gray-900 dark:text-dark-text-primary",
    h3: "text-xl font-semibold text-gray-900 dark:text-dark-text-primary",
    h4: "text-lg font-medium text-gray-900 dark:text-dark-text-primary",
    h5: "text-base font-medium text-gray-900 dark:text-dark-text-primary",
    h6: "text-sm font-medium text-gray-900 dark:text-dark-text-primary",
  },

  // Body text
  body: {
    large: "text-lg text-gray-700 dark:text-dark-text-secondary",
    base: "text-base text-gray-700 dark:text-dark-text-secondary",
    small: "text-sm text-gray-600 dark:text-dark-text-secondary",
    xs: "text-xs text-gray-500 dark:text-dark-text-tertiary",
  },

  // Labels
  label: {
    base: "text-sm font-medium text-gray-700 dark:text-dark-text-secondary",
    small: "text-xs font-medium text-gray-600 dark:text-dark-text-tertiary",
  },

  // Captions and helper text
  caption: {
    base: "text-xs text-gray-500 dark:text-dark-text-tertiary",
    muted: "text-xs text-gray-400 dark:text-gray-500",
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
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
    secondary:
      "bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-primary dark:text-dark-text-primary focus:ring-gray-500",
    outline:
      "border border-gray-300 dark:border-dark-bg-tertiary bg-transparent hover:bg-gray-50 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-blue-500",
    ghost:
      "bg-transparent hover:bg-gray-100 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    success: "bg-green-600 hover:bg-green-700 text-white focus:ring-green-500",
  },

  // Input variants
  input: {
    base: "block w-full px-3 py-2 border border-gray-300 dark:border-dark-bg-tertiary rounded-md text-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors",
    error:
      "border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500",
    success:
      "border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500",
  },

  // Card variants
  card: {
    base: "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-bg-tertiary rounded-lg shadow-sm",
    elevated:
      "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-bg-tertiary rounded-lg shadow-md",
    interactive:
      "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-bg-tertiary rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer",
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

// Z-index tokens
export const Z_INDEX = {
  dropdown: "z-50",
  sticky: "z-40",
  fixed: "z-30",
  modal: "z-50",
  popover: "z-40",
  tooltip: "z-50",
} as const
