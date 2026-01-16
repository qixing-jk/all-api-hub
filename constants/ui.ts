import { DATA_TYPE_BALANCE } from "~/constants/index"

/**
 * UI 相关常量定义
 */
export const UI_CONSTANTS = {
  // 弹窗尺寸
  POPUP: {
    WIDTH: "w-[410px]",
    HEIGHT: "h-[600px]",
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
        "flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary transition-colors text-sm font-medium shadow-sm border border-blue-600",
      SECONDARY:
        "flex items-center justify-center py-2.5 px-3 bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary transition-colors text-sm font-medium border border-gray-300 dark:border-dark-bg-tertiary",
      ICON: "p-2 text-gray-400 dark:text-dark-text-tertiary hover:text-gray-600 dark:hover:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary border border-gray-200 dark:border-dark-bg-tertiary",
      SUCCESS:
        "px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2",
      REFRESH:
        "px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary transition-colors disabled:opacity-50",
      COPY: "inline-flex items-center space-x-2 cursor-pointer rounded-md bg-gray-100 dark:bg-dark-bg-tertiary px-3 py-1.5 text-gray-700 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-bg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary",
      SAVE: "rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary transition-colors",
    },

    // 状态指示器
    STATUS_INDICATOR: {
      HEALTHY: "bg-green-500",
      ERROR: "bg-red-500",
      WARNING: "bg-yellow-500",
      UNKNOWN: "bg-gray-400",
    },

    // 文本颜色
    TEXT: {
      PRIMARY: "text-gray-900 dark:text-dark-text-primary",
      SECONDARY: "text-gray-500 dark:text-dark-text-secondary",
      SUCCESS: "text-green-500",
      ERROR: "text-red-500",
      WARNING: "text-yellow-500",
    },

    // 输入框
    INPUT: {
      BASE: "block w-full py-3 border border-gray-300 dark:border-dark-bg-tertiary rounded-lg text-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors",
      WITH_ICON: "pl-10",
      SEARCH:
        "w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-bg-tertiary rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-bg-tertiary disabled:cursor-not-allowed bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary placeholder-gray-400 dark:placeholder-gray-500",
      CHECKBOX:
        "rounded border-gray-300 dark:border-dark-bg-tertiary text-blue-600 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary",
    },
  },
} as const

export const CURRENCY_SYMBOLS = {
  USD: "$",
  CNY: "¥",
} as const
