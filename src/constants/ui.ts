import { DATA_TYPE_BALANCE } from "~/constants/index"

/**
 * UI 相关常量定义
 */
export const UI_CONSTANTS = {
  // 弹窗尺寸
  POPUP: {
    WIDTH_PX: 410,
    HEIGHT_PX: 600,
    WIDTH: "w-full",
    HEIGHT: "h-full",
    MAX_HEIGHT: "max-h-[90vh]",
  },

  // 动画配置
  ANIMATION: {
    INITIAL_DURATION: 1.5,
    UPDATE_DURATION: 0.8,
    FAST_DURATION: 0.6,
    SLOW_DURATION: 1.0,
  },

  // 更新间隔
  UPDATE_INTERVAL: 30000, // 30秒

  // 排序相关
  SORT: {
    DEFAULT_FIELD: DATA_TYPE_BALANCE,
    DEFAULT_ORDER: "desc" as const,
  },

  // Token 格式化阈值
  TOKEN: {
    MILLION_THRESHOLD: 1000000,
    THOUSAND_THRESHOLD: 1000,
  },

  // 汇率相关
  EXCHANGE_RATE: {
    DEFAULT: 7.2,
    CONVERSION_FACTOR: 500000, // USD to quota conversion
  },

  // 金额显示相关
  MONEY: {
    DECIMALS: 2,
    MIN_NON_ZERO: 0.01,
  },

  // 样式类名
  STYLES: {
    // 按钮样式
    BUTTON: {
      PRIMARY:
        "flex-1 flex items-center justify-center space-x-2 py-density-2-5 px-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background transition-colors text-sm font-medium shadow-sm border border-theme-600",
      SECONDARY:
        "flex items-center justify-center py-density-2-5 px-3 bg-card text-muted-foreground dark:text-secondary-foreground rounded-lg hover:bg-surface-subtle dark:hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background transition-colors text-sm font-medium border border-border-strong dark:border-border",
      ICON: "p-2 text-faint-foreground dark:text-muted-foreground hover:text-muted-foreground dark:hover:text-secondary-foreground hover:bg-muted dark:hover:bg-secondary rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background border border-border",
      SUCCESS:
        "px-4 py-density-2 bg-success text-success-foreground text-sm font-medium rounded-lg hover:bg-success-hover focus:outline-none focus:ring-2 focus:ring-success-text focus:ring-offset-2 dark:focus:ring-offset-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2",
      REFRESH:
        "px-4 py-density-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background transition-colors disabled:opacity-50",
      COPY: "inline-flex items-center space-x-2 cursor-pointer rounded-md bg-muted dark:bg-secondary px-3 py-density-1-5 text-secondary-foreground hover:bg-secondary dark:hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background",
      SAVE: "rounded-md bg-primary px-4 py-density-2 text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background transition-colors",
    },

    // 状态指示器
    STATUS_INDICATOR: {
      HEALTHY: "bg-success",
      ERROR: "bg-destructive",
      WARNING: "bg-warning",
      UNKNOWN: "bg-surface-inverse-muted",
    },

    // 文本颜色
    TEXT: {
      PRIMARY: "text-foreground",
      SECONDARY: "text-muted-foreground dark:text-secondary-foreground",
      SUCCESS: "text-success-text",
      ERROR: "text-destructive-text",
      WARNING: "text-warning-text",
    },

    // 输入框
    INPUT: {
      BASE: "block w-full py-density-3 border border-border-strong dark:border-border rounded-lg text-sm placeholder:text-muted-foreground bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors",
      WITH_ICON: "pl-10",
      SEARCH:
        "w-full pl-10 pr-4 py-density-2 border border-border-strong dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:bg-muted dark:disabled:bg-secondary disabled:cursor-not-allowed bg-card text-foreground placeholder:text-muted-foreground",
      CHECKBOX:
        "rounded border-border-strong dark:border-border text-theme-600 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background",
    },
  },
} as const

export const CURRENCY_SYMBOLS = {
  USD: "$",
  CNY: "¥",
} as const
