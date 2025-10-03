import { viteBundler } from "@vuepress/bundler-vite"
import { defaultTheme } from "@vuepress/theme-default"
import { defineUserConfig } from "vuepress"

export default defineUserConfig({
  base: "/all-api-hub/",

  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'All API Hub - 中转站管理器',
      description: '一个开源的浏览器插件，旨在优化管理New API等AI中转站账号的体验。用户可以轻松集中管理和查看账户余额、模型及密钥，并自动添加新站点。',
    },
    '/en/': {
      lang: 'en-US',
      title: 'All API Hub',
      description: 'An open-source browser extension to aggregate and manage all your API hub accounts, including balance, models, and keys, without the hassle of logging in.',
    },
  },

  theme: defaultTheme({
    logo: "https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true",
    
    locales: {
      '/': {
        selectLanguageText: '选择语言',
        selectLanguageName: '简体中文',
        navbar: ["/", "/get-started", "/faq"],
      },
      '/en/': {
        selectLanguageText: 'Languages',
        selectLanguageName: 'English',
        navbar: ["/en/", "/en/get-started", "/en/faq"],
      }
    }
  }),

  bundler: viteBundler()
})
