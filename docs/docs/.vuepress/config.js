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
<<<<<<< HEAD
          {
            text: '专题指南',
            children: [
              { text: '支持的工具', link: '/supported-export-tools' },
              { text: '支持的站点', link: '/supported-sites' },
              { text: 'Safari 安装', link: '/safari-install' },
              { text: 'QQ / 360 等浏览器安装', link: '/other-browser-install' },
              { text: 'Cloudflare 过盾助手', link: '/cloudflare-helper' },
              { text: '快速导出站点', link: '/quick-export' },
              { text: '自动刷新', link: '/auto-refresh' },
              { text: '自动签到', link: '/auto-checkin' },
              { text: '自动识别排查', link: '/auto-detect' },
              { text: '兑换助手', link: '/redemption-assist' },
              { text: 'WebDAV 同步', link: '/webdav-sync' },
              { text: '数据导入导出', link: '/data-management' },
              { text: 'New API 模型同步', link: '/new-api-model-sync' },
              { text: 'New API 渠道管理', link: '/new-api-channel-management' },
              { text: 'Octopus 渠道管理', link: '/octopus-channel-management' },
              { text: 'CLIProxyAPI 集成', link: '/cliproxyapi-integration' },
              { text: '模型重定向', link: '/model-redirect' },
              { text: '排序优先级设置', link: '/sorting-priority' },
              { text: '权限管理', link: '/permissions' },
              { text: '书签管理', link: '/site-bookmarks' },
              { text: '使用分析', link: '/usage-analytics' },
              { text: 'API 凭证档案', link: '/api-credential-profiles' },
              { text: '分享快照', link: '/share-snapshots' },
              { text: 'LDOH 站点查询', link: '/ldoh-site-lookup' }
            ]
          }
=======
          "/changelog"
>>>>>>> main
        ],
        sidebar: [
          {
            text: '🚀 快速上手',
            collapsible: true,
            children: [
              '/get-started',
              '/permissions',
              '/extension-update-install',
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
              '/site-announcements',
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
              '/sponsor-guides',
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
<<<<<<< HEAD
          {
            text: 'Guides',
            children: [
              { text: 'Supported Tools', link: '/en/supported-export-tools' },
              { text: 'Supported Sites', link: '/en/supported-sites' },
              { text: 'Safari Install', link: '/en/safari-install' },
              { text: 'QQ / 360 and Similar Browser Install', link: '/en/other-browser-install' },
              { text: 'Cloudflare Helper', link: '/en/cloudflare-helper' },
              { text: 'Quick Export', link: '/en/quick-export' },
              { text: 'Auto Refresh', link: '/en/auto-refresh' },
              { text: 'Auto Check-in', link: '/en/auto-checkin' },
              { text: 'Auto Detect', link: '/en/auto-detect' },
              { text: 'Redemption Assistant', link: '/en/redemption-assist' },
              { text: 'WebDAV Sync', link: '/en/webdav-sync' },
              { text: 'Data Management', link: '/en/data-management' },
              { text: 'New API Model Sync', link: '/en/new-api-model-sync' },
              { text: 'New API Channel Mgmt', link: '/en/new-api-channel-management' },
              { text: 'Octopus Channel Mgmt', link: '/en/octopus-channel-management' },
              { text: 'CLIProxyAPI Integration', link: '/en/cliproxyapi-integration' },
              { text: 'Model Redirect', link: '/en/model-redirect' },
              { text: 'Sorting Priority', link: '/en/sorting-priority' },
              { text: 'Permissions', link: '/en/permissions' },
              { text: 'Site Bookmarks', link: '/en/site-bookmarks' },
              { text: 'Usage Analytics', link: '/en/usage-analytics' },
              { text: 'API Credential Profiles', link: '/en/api-credential-profiles' },
              { text: 'Share Snapshots', link: '/en/share-snapshots' },
              { text: 'LDOH Site Lookup', link: '/en/ldoh-site-lookup' }
            ]
          }
=======
          "/en/changelog"
>>>>>>> main
        ],
        sidebar: [
          {
            text: '🚀 Getting Started',
            collapsible: true,
            children: [
              '/en/get-started',
              '/en/permissions',
              '/en/extension-update-install',
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
              '/en/site-announcements',
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
              '/en/sponsor-guides',
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
<<<<<<< HEAD
          {
            text: '機能ガイド',
            children: [
              { text: '対応ツール', link: '/ja/supported-export-tools' },
              { text: '対応サイト', link: '/ja/supported-sites' },
              { text: 'Safari インストール', link: '/ja/safari-install' },
              { text: 'QQ / 360 などのブラウザのインストール', link: '/ja/other-browser-install' },
              { text: 'Cloudflare ヘルパー', link: '/ja/cloudflare-helper' },
              { text: 'クイックエクスポート', link: '/ja/quick-export' },
              { text: '自動更新', link: '/ja/auto-refresh' },
              { text: '自動サインイン', link: '/ja/auto-checkin' },
              { text: '自動検出', link: '/ja/auto-detect' },
              { text: '引き換えアシスタント', link: '/ja/redemption-assist' },
              { text: 'WebDAV 同期', link: '/ja/webdav-sync' },
              { text: 'データ管理', link: '/ja/data-management' },
              { text: 'New API モデル同期', link: '/ja/new-api-model-sync' },
              { text: 'New API チャネル管理', link: '/ja/new-api-channel-management' },
              { text: 'Octopus チャネル管理', link: '/ja/octopus-channel-management' },
              { text: 'CLIProxyAPI 連携', link: '/ja/cliproxyapi-integration' },
              { text: 'モデルリダイレクト', link: '/ja/model-redirect' },
              { text: '並び順優先度設定', link: '/ja/sorting-priority' },
              { text: '権限管理', link: '/ja/permissions' },
              { text: 'ブックマーク管理', link: '/ja/site-bookmarks' },
              { text: '使用分析', link: '/ja/usage-analytics' },
              { text: 'API 認証情報プロファイル', link: '/ja/api-credential-profiles' },
              { text: 'スナップショット共有', link: '/ja/share-snapshots' },
              { text: 'LDOH サイト検索', link: '/ja/ldoh-site-lookup' }
            ]
          }
=======
          "/ja/changelog"
>>>>>>> main
        ],
        sidebar: [
          {
            text: '🚀 導入ガイド',
            collapsible: true,
            children: [
              '/ja/get-started',
              '/ja/permissions',
              '/ja/extension-update-install',
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
              '/ja/site-announcements',
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
              '/ja/sponsor-guides',
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
