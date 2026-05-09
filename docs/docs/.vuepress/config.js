import { viteBundler } from "@vuepress/bundler-vite"
import { sitemapPlugin } from "@vuepress/plugin-sitemap"
import { defaultTheme } from "@vuepress/theme-default"
import { defineUserConfig } from "vuepress"

const sitemapHostname = process.env.DOCS_HOSTNAME ?? "https://all-api-hub.qixing1217.top"

export default defineUserConfig({
  base: "/",

  head: [
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/16.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "48x48", href: "/48.png" }],
    ["link", { rel: "apple-touch-icon", sizes: "128x128", href: "/128.png" }],
  ],

  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'All API Hub - 你的全能 AI 资产管家',
      description: '一个开源的浏览器插件，旨在优化管理New API等AI中转站账号的体验。用户可以轻松集中管理和查看账户余额、模型及密钥，并自动添加新站点',
    },
    '/en/': {
      lang: 'en-US',
      title: 'All API Hub',
      description: 'An open-source browser extension to aggregate and manage all your API hub accounts, including balance, models, and keys, without the hassle of logging in',
    },
    '/ja/': {
      lang: 'ja-JP',
      title: 'All API Hub',
      description: 'API Hubアカウント（残高、モデル、キーを含む）を、ログインの手間なしに集約・管理するためのオープンソースブラウザ拡張機能',
    },
  },

  theme: defaultTheme({
    logo: "/512.png",
    
    locales: {
      '/': {
        selectLanguageText: '选择语言',
        selectLanguageName: '简体中文',
        navbar: [
          "/",
          "/get-started",
          "/faq",
          "/changelog"
        ],
        sidebar: [
          {
            text: '🚀 快速上手',
            collapsible: true,
            children: [
              '/get-started',
              '/permissions',
              '/safari-install',
              '/other-browser-install',
            ]
          },
          {
            text: '🔑 账号与凭证',
            collapsible: true,
            children: [
              '/account-management',
              '/api-credential-profiles',
              '/key-management',
              '/bookmark-management',
              '/sorting-priority',
            ]
          },
          {
            text: '📊 统计与看板',
            collapsible: true,
            children: [
              '/balance-history',
              '/usage-analytics',
              '/share-snapshot',
              '/model-list',
              '/auto-refresh',
            ]
          },
          {
            text: '🤖 自动化助手',
            collapsible: true,
            children: [
              '/auto-checkin',
              '/task-notifications',
              '/redemption-assist',
              '/web-ai-api-check',
              '/cloudflare-helper',
            ]
          },
          {
            text: '🔌 生态与集成',
            collapsible: true,
            children: [
              '/supported-sites',
              '/ldoh-site-lookup',
              '/supported-export-tools',
              '/quick-export',
              '/cliproxyapi-integration',
            ]
          },
          {
            text: '🛠️ 站长管理工具',
            collapsible: true,
            children: [
              '/managed-site-model-sync',
              '/self-hosted-site-management',
              '/model-redirect',
              '/new-api-security-verification',
            ]
          },
          {
            text: '🛡️ 数据隐私与支持',
            collapsible: true,
            children: [
              '/data-management',
              '/webdav-sync',
              '/privacy',
              '/auto-detect',
              '/developer-tools',
              '/faq',
            ]
          },
          '/changelog'
        ]
      },
      '/en/': {
        selectLanguageText: 'Languages',
        selectLanguageName: 'English',
        navbar: [
          "/en/",
          "/en/get-started",
          "/en/faq",
          "/en/changelog"
        ],
        sidebar: [
          {
            text: '🚀 Getting Started',
            collapsible: true,
            children: [
              '/en/get-started',
              '/en/permissions',
              '/en/safari-install',
              '/en/other-browser-install',
            ]
          },
          {
            text: '🔑 Accounts & Credentials',
            collapsible: true,
            children: [
              '/en/account-management',
              '/en/api-credential-profiles',
              '/en/key-management',
              '/en/bookmark-management',
              '/en/sorting-priority',
            ]
          },
          {
            text: '📊 Analytics & Dashboard',
            collapsible: true,
            children: [
              '/en/balance-history',
              '/en/usage-analytics',
              '/en/share-snapshot',
              '/en/model-list',
              '/en/auto-refresh',
            ]
          },
          {
            text: '🤖 Automation Helpers',
            collapsible: true,
            children: [
              '/en/auto-checkin',
              '/en/task-notifications',
              '/en/redemption-assist',
              '/en/web-ai-api-check',
              '/en/cloudflare-helper',
            ]
          },
          {
            text: '🔌 Ecosystem & Integrations',
            collapsible: true,
            children: [
              '/en/supported-sites',
              '/en/ldoh-site-lookup',
              '/en/supported-export-tools',
              '/en/quick-export',
              '/en/cliproxyapi-integration',
            ]
          },
          {
            text: '🛠️ Admin Management',
            collapsible: true,
            children: [
              '/en/managed-site-model-sync',
              '/en/self-hosted-site-management',
              '/en/model-redirect',
              '/en/new-api-security-verification',
            ]
          },
          {
            text: '🛡️ Data & Support',
            collapsible: true,
            children: [
              '/en/data-management',
              '/en/webdav-sync',
              '/en/privacy',
              '/en/auto-detect',
              '/en/developer-tools',
              '/en/faq',
            ]
          },
          '/en/changelog'
        ]
      },
      '/ja/': {
        selectLanguageText: '言語選択',
        selectLanguageName: '日本語',
        navbar: [
          "/ja/",
          "/ja/get-started",
          "/ja/faq",
          "/ja/changelog"
        ],
        sidebar: [
          {
            text: '🚀 導入ガイド',
            collapsible: true,
            children: [
              '/ja/get-started',
              '/ja/permissions',
              '/ja/safari-install',
              '/ja/other-browser-install',
            ]
          },
          {
            text: '🔑 アカウントと認証情報',
            collapsible: true,
            children: [
              '/ja/account-management',
              '/ja/api-credential-profiles',
              '/ja/key-management',
              '/ja/bookmark-management',
              '/ja/sorting-priority',
            ]
          },
          {
            text: '📊 統計とダッシュボード',
            collapsible: true,
            children: [
              '/ja/balance-history',
              '/ja/usage-analytics',
              '/ja/share-snapshot',
              '/ja/model-list',
              '/ja/auto-refresh',
            ]
          },
          {
            text: '🤖 自動化アシスタント',
            collapsible: true,
            children: [
              '/ja/auto-checkin',
              '/ja/task-notifications',
              '/ja/redemption-assist',
              '/ja/web-ai-api-check',
              '/ja/cloudflare-helper',
            ]
          },
          {
            text: '🔌 エコシステムと連携',
            collapsible: true,
            children: [
              '/ja/supported-sites',
              '/ja/ldoh-site-lookup',
              '/ja/supported-export-tools',
              '/ja/quick-export',
              '/ja/cliproxyapi-integration',
            ]
          },
          {
            text: '🛠️ 管理者向けツール',
            collapsible: true,
            children: [
              '/ja/managed-site-model-sync',
              '/ja/self-hosted-site-management',
              '/ja/model-redirect',
              '/ja/new-api-security-verification',
            ]
          },
          {
            text: '🛡️ データとサポート',
            collapsible: true,
            children: [
              '/ja/data-management',
              '/ja/webdav-sync',
              '/ja/privacy',
              '/ja/auto-detect',
              '/ja/developer-tools',
              '/ja/faq',
            ]
          },
          '/ja/changelog'
        ]
      }
    }
  }),

  plugins: [
    sitemapPlugin({
      hostname: sitemapHostname,
      excludePaths: ["/404.html"],
      devServer: true
    }),
  ],

  bundler: viteBundler()
})
