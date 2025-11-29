import { viteBundler } from "@vuepress/bundler-vite"
import { defaultTheme } from "@vuepress/theme-default"
import { defineUserConfig } from "vuepress"

export default defineUserConfig({
  base: "/",

  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'All API Hub - 中转站管理器',
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
    logo: "https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true",
    
    locales: {
      '/': {
        selectLanguageText: '选择语言',
        selectLanguageName: '简体中文',
        navbar: [
          "/",
          "/get-started",
          "/faq",
          {
            text: '专题指南',
            children: [
              { text: 'Cloudflare 过盾助手', link: '/cloudflare-helper' },
              { text: '快速导出站点', link: '/quick-export' },
              { text: '自动刷新', link: '/auto-refresh' },
              { text: '自动签到', link: '/auto-checkin' },
              { text: '兑换助手', link: '/redemption-assist' },
              { text: 'WebDAV 同步', link: '/webdav-sync' },
              { text: '数据导入导出', link: '/data-management' },
              { text: 'New API 模型同步', link: '/new-api-model-sync' },
              { text: 'New API 渠道管理', link: '/new-api-channel-management' }
            ]
          }
        ],
      },
      '/en/': {
        selectLanguageText: 'Languages',
        selectLanguageName: 'English',
        navbar: [
          "/en/",
          "/en/get-started",
          "/en/faq",
          {
            text: 'Guides',
            children: [
              { text: 'Cloudflare Helper', link: '/en/cloudflare-helper' },
              { text: 'Quick Export', link: '/en/quick-export' },
              { text: 'Auto Refresh', link: '/en/auto-refresh' },
              { text: 'Auto Check-in', link: '/en/auto-checkin' },
              { text: 'Redemption Assistant', link: '/redemption-assist' },
              { text: 'WebDAV Sync', link: '/en/webdav-sync' },
              { text: 'Data Management', link: '/en/data-management' },
              { text: 'New API Model Sync', link: '/en/new-api-model-sync' },
              { text: 'New API Channel Mgmt', link: '/en/new-api-channel-management' }
            ]
          }
        ],
      },
      '/ja/': {
        selectLanguageText: '言語選択',
        selectLanguageName: '日本語',
        navbar: [
          "/ja/",
          "/ja/get-started",
          "/ja/faq",
          {
            text: '機能ガイド',
            children: [
              { text: 'Cloudflare ヘルパー', link: '/ja/cloudflare-helper' },
              { text: 'クイックエクスポート', link: '/ja/quick-export' },
              { text: '自動更新', link: '/ja/auto-refresh' },
              { text: '自動サインイン', link: '/ja/auto-checkin' },
              { text: '引き換えアシスタント', link: '/redemption-assist' },
              { text: 'WebDAV 同期', link: '/ja/webdav-sync' },
              { text: 'データ管理', link: '/ja/data-management' },
              { text: 'New API モデル同期', link: '/ja/new-api-model-sync' },
              { text: 'New API チャネル管理', link: '/ja/new-api-channel-management' }
            ]
          }
        ],
      }
    }
  }),

  bundler: viteBundler()
})
