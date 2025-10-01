# [1.1.0](https://github.com/qixing-jk/all-api-hub/compare/v1.0.0...v1.1.0) (2025-09-08)


### Features

* **account:** add manual addition support with streamlined UI flow ([429b924](https://github.com/qixing-jk/all-api-hub/commit/429b924f11a78bafe87b63b3c3aaf01569e85020))



# [1.0.0](https://github.com/qixing-jk/all-api-hub/compare/v0.0.3...v1.0.0) (2025-09-08)


### Bug Fixes

* **account:** handle URL with port in fetchSiteStatus call ([f50ae36](https://github.com/qixing-jk/all-api-hub/commit/f50ae367729174d9db2e75b98f6b328ffdf9a4cc))
* **ci:** move Node.js setup after pnpm initialization ([f692d91](https://github.com/qixing-jk/all-api-hub/commit/f692d911b1ef677673890978f67d5fd06a4345bf))


### Features

* **account:** implement current site detection and highlight ([648e94c](https://github.com/qixing-jk/all-api-hub/commit/648e94c5bf690b01c259dc1ebcc2f3cc6095dfe6))
* **account:** prioritize site's own name over domain prefix for site naming ([b27a77b](https://github.com/qixing-jk/all-api-hub/commit/b27a77bc71aae484973489f9bbba38fa8e21e848))
* add Firefox browser detection and account addition warning ([713e304](https://github.com/qixing-jk/all-api-hub/commit/713e304a1044d8fbbe9c176747300fe1c4205319))
* add Firefox MV3 support with dev and build scripts ([de43f5c](https://github.com/qixing-jk/all-api-hub/commit/de43f5c099cfbb3e48bcf7f2661db82dc266a695))
* add Firefox WebExtension browser types support ([e5b6f79](https://github.com/qixing-jk/all-api-hub/commit/e5b6f795dee98669de8f22b7640003429f542ccd))
* add support for Super-API site type ([cb7527d](https://github.com/qixing-jk/all-api-hub/commit/cb7527d2b15a2c99bc39827fe3ae1d7590622428))
* **api:** add PaymentUSDRate field and fallback logic for price retrieval ([6059450](https://github.com/qixing-jk/all-api-hub/commit/6059450875dbe9735f7e156636f771038b5ddcb6))
* **api:** add VoAPI site type support ([7093d18](https://github.com/qixing-jk/all-api-hub/commit/7093d1896dec5fa51c905f7f5e3ae74f79a2fe10))
* **apiService.ts:** 支持Veloera，添加Veloera请求头项 ([5299d73](https://github.com/qixing-jk/all-api-hub/commit/5299d73c9d09f05f530272e1a6f549927a52ccc5))
* **content:** implement fallback to fetchUserInfo for done-hub and one-hub sites ([e709338](https://github.com/qixing-jk/all-api-hub/commit/e709338b331708917dd91ab8c93115d997e43eed))
* **popup:** add edit account functionality to AddAccountDialog ([b316213](https://github.com/qixing-jk/all-api-hub/commit/b316213ee086914670c7a408e5675da23d0d2694))
* **popup:** close window after opening sidebar action ([60972d7](https://github.com/qixing-jk/all-api-hub/commit/60972d7770e8aa9389b04d1ca86505d469b40b51))
* **sidebar:** Add the sidebar feature to replace the automatic site configuration feature of the pop-up window ([a9a7a61](https://github.com/qixing-jk/all-api-hub/commit/a9a7a619aaffb62522765484c1eb9c6057c01a3b)), closes [#10](https://github.com/qixing-jk/all-api-hub/issues/10)
* 支持 one-hub 和 done-hub 站点类型 ([#18](https://github.com/qixing-jk/all-api-hub/issues/18)) ([a8a2ac8](https://github.com/qixing-jk/all-api-hub/commit/a8a2ac83a3afc9196e2ea8d6f73e0458bf209d50))



## [1.2.1](https://github.com/qixing-jk/all-api-hub/compare/v1.2.0...v1.2.1) (2025-10-01)


### Bug Fixes

* **ci:** move pnpm setup before Node.js configuration ([dab2a41](https://github.com/qixing-jk/all-api-hub/commit/dab2a418d3db2b76ccb3f7c30cb99cb75439ef01))

## [1.2.0](https://github.com/qixing-jk/all-api-hub/compare/v1.1.1...v1.2.0) (2025-10-01)


### Features

* **account:** update page title from "账户列表" to "账户管理" ([9b32d9b](https://github.com/qixing-jk/all-api-hub/commit/9b32d9bd062f879331bfb43e4f01642225fdbb27)), closes [#9](https://github.com/qixing-jk/all-api-hub/issues/9)
* add dialog helper for Firefox account warning ([12a3c1a](https://github.com/qixing-jk/all-api-hub/commit/12a3c1a52ec1a75ef21da34b613bfb6235fa6ab9))
* **options:** add AccountManagement page with full CRUD functionality ([feb1d85](https://github.com/qixing-jk/all-api-hub/commit/feb1d85e523aae7c6fa42e6c605545e5a9852d10))
* **popup:** replace custom dialog with direct function call ([1d22f41](https://github.com/qixing-jk/all-api-hub/commit/1d22f415ed70735bb5c25bbaa1ae4fe3be2e7717))


### Bug Fixes

* update `onViewKeys` prop to accept `siteId` instead of `site` object ([605a612](https://github.com/qixing-jk/all-api-hub/commit/605a61200d736c55bde3298a1374d890ef26f4e8))
* update onViewModels prop to accept siteId instead of site object ([1f6f734](https://github.com/qixing-jk/all-api-hub/commit/1f6f734469e5fdd1b40f32baf142e8573b71a170))

## [1.1.1](https://github.com/qixing-jk/all-api-hub/compare/v1.1.0...v1.1.1) (2025-09-09)


### Bug Fixes

* **account-operations:** handle missing system name and correct check ([32d8a46](https://github.com/qixing-jk/all-api-hub/commit/32d8a4694f37bbbe1dddfaa6bdd1f165643886fa))
* **account:** optimize site name retrieval with early return ([75fd551](https://github.com/qixing-jk/all-api-hub/commit/75fd5516a5f3c8d157efc969c2f7c283b8246807))

## [0.0.3](https://github.com/qixing-jk/all-api-hub/compare/v0.0.2...v0.0.3) (2025-08-19)


### Bug Fixes

* neo 错别字更改为 new ([c24d2eb](https://github.com/qixing-jk/all-api-hub/commit/c24d2eb35d91c0e7be832497d64b51314176f47f))
* **tailwind:** exclude node_modules from content scan ([#12](https://github.com/qixing-jk/all-api-hub/issues/12)) ([0240db4](https://github.com/qixing-jk/all-api-hub/commit/0240db4592834fcc864f6e9bd8c2e9db00e260a5))
* 优化URL输入处理，自动提取协议和主机部分 ([d7fe2e2](https://github.com/qixing-jk/all-api-hub/commit/d7fe2e25bd8d721da4f0a569cffbf8ae9df17bde))
* 修复 CopyKeyDialog 兼容性问题并优化 UI 设计 ([8b8f1ad](https://github.com/qixing-jk/all-api-hub/commit/8b8f1adaf07a2fb02984534326dd0eee2995ca01))
* 修复API请求凭证处理问题 ([6e63839](https://github.com/qixing-jk/all-api-hub/commit/6e638393824162dcc5a1b1424e04a8d952f7fcc4))
* 修复Tooltip组件中ReactNode的类型导入错误 ([285a0c3](https://github.com/qixing-jk/all-api-hub/commit/285a0c30f2d2cf49165b4d8be971b8c7cb54e320))
* 修复Tooltip组件触发区域过大问题 ([b433e35](https://github.com/qixing-jk/all-api-hub/commit/b433e35ada807cba0126696c10a6657137664e98))
* 修复模块导入路径问题 ([5a9050f](https://github.com/qixing-jk/all-api-hub/commit/5a9050ffeaddef31a1c40e5b66fbe0ef323a7c50))
* 修复模型数据格式不兼容导致的崩溃问题 ([8ebdc25](https://github.com/qixing-jk/all-api-hub/commit/8ebdc25b4b433da9c3f0c693367605503af5c205))
* 修复自动识别功能中的 localStorage 访问问题 ([073838b](https://github.com/qixing-jk/all-api-hub/commit/073838bcbc27962e67a66ccc8325cafdd35bf031))
* 修复账号存储功能权限和调试问题 ([5a73cda](https://github.com/qixing-jk/all-api-hub/commit/5a73cda924ee2af5c4d86fd825a23fe7f12c4c6b))
* 修正API认证方式，区分cookie和Bearer token使用场景 ([69c086e](https://github.com/qixing-jk/all-api-hub/commit/69c086ef366725da27bae93adfdb838803ac5a19))
* 删除未使用的active_tab权限 ([5ff2146](https://github.com/qixing-jk/all-api-hub/commit/5ff21462e26435b1f088af9127ae5fb2002810f0))
* 将新添加的账号同步时间默认值设置为 0 ([7f490e1](https://github.com/qixing-jk/all-api-hub/commit/7f490e1b0728ff29190389c13bef1c49981f71a3))
* 将账号存储键名更改为site_accounts ([7ce4d68](https://github.com/qixing-jk/all-api-hub/commit/7ce4d6841b6e05cbfd574c767d90655c032fa3e3))
* 改进自动刷新功能的用户体验和默认配置 ([fc59651](https://github.com/qixing-jk/all-api-hub/commit/fc5965153913fcd0456675556c6bdbb43295ca52))
* 更新getEndpointTypesText函数以处理未定义的endpointTypes参数 ([cd7a183](https://github.com/qixing-jk/all-api-hub/commit/cd7a183bf3bf445c3a91c134f4348ed7a7b85338))
* 更新package.json中的描述信息 ([f3e775c](https://github.com/qixing-jk/all-api-hub/commit/f3e775ce852193691efdd3cf4dc415286e10517a))
* 添加分页逻辑处理大量日志数据 ([e679c9f](https://github.com/qixing-jk/all-api-hub/commit/e679c9fb6dccc9e43e15ed538fcb08be73554b74))


### Features

* UI优化与功能增强 ([9d6705d](https://github.com/qixing-jk/all-api-hub/commit/9d6705df11533e9d169a4e3fdb12ef6f23266b81))
* 为 AddAccountDialog 中的当前标签页 URL 提示添加浮现动画 ([dde9965](https://github.com/qixing-jk/all-api-hub/commit/dde996549da075449055ad4054ff77efc1339035))
* 为 CopyKeyDialog 添加默认折叠功能 ([0373226](https://github.com/qixing-jk/all-api-hub/commit/0373226c2ef1b55359680a96e3db6ee45cc7db62))
* 为popup页面添加数字滚动动画效果 ([a74b026](https://github.com/qixing-jk/all-api-hub/commit/a74b02693c22a59f64458ba565cf4ea25fd7327d))
* 为tooltip添加平滑动画过渡效果 ([ea72497](https://github.com/qixing-jk/all-api-hub/commit/ea72497003c3a7d645e605a5ff82ec6ae515f9a7))
* 为今日消耗金额添加减号前缀 ([492e871](https://github.com/qixing-jk/all-api-hub/commit/492e871df45ab7c891a644c6c4b87f0e99b39b52))
* 为删除账号对话框添加 toast 提示 ([1cd36e2](https://github.com/qixing-jk/all-api-hub/commit/1cd36e264e742351a393c7b065424e1ac1b9c140))
* 为账号信息添加 id 字段支持 ([69479c7](https://github.com/qixing-jk/all-api-hub/commit/69479c742a3b9b041d77fe2cc9cf66b2ed6a9b5d))
* 为账号列表添加 hover 触发的操作按钮组 ([d64718a](https://github.com/qixing-jk/all-api-hub/commit/d64718a3ccf762a32f39d7f42943b6c867b49448))
* 为账号列表添加可排序表头 ([b6b12f4](https://github.com/qixing-jk/all-api-hub/commit/b6b12f485e0070951919b01d12303adf0eae6bc3))
* 为账号列表添加复制密钥对话框功能 ([7d31f0a](https://github.com/qixing-jk/all-api-hub/commit/7d31f0a4a8b960701155b24757e1cd9373279a4e))
* 为账号刷新操作添加 toast 提示功能 ([d793169](https://github.com/qixing-jk/all-api-hub/commit/d79316985eaecf83ffa9848a4494a18c800f39c0))
* 为账号添加和编辑对话框添加 toast 提示 ([1f90753](https://github.com/qixing-jk/all-api-hub/commit/1f90753d951374868a3abf8cc4638d47f9e0e028))
* 为选项页面添加 toast 通知组件 ([bba8e47](https://github.com/qixing-jk/all-api-hub/commit/bba8e47ae6fabe8e45f5e2f00198d058ba36a88c))
* 优化充值比例编辑框，删除默认值，必须用户手动填写 ([ffbc09a](https://github.com/qixing-jk/all-api-hub/commit/ffbc09ab154f2f6bb9d771fafc7992017381563e))
* 优化删除dialog 提示词 ([2293482](https://github.com/qixing-jk/all-api-hub/commit/22934829f67b300b6f3f6a751bddcc9ca0b804e7))
* 优化整体滚动布局和修复TypeScript类型警告 ([372546b](https://github.com/qixing-jk/all-api-hub/commit/372546b78ff9fb298b3faf1ac4840e922fed337b))
* 优化添加账号对话框用户体验 ([ec945c3](https://github.com/qixing-jk/all-api-hub/commit/ec945c35613e0da9f0f72a0f393a114eb926e33c))
* 优化站点名称自动提取逻辑 ([2985d22](https://github.com/qixing-jk/all-api-hub/commit/2985d227c7219c65e62ae46bd3d96f5174c01436))
* 优化账号列表消耗金额显示样式 ([235ceca](https://github.com/qixing-jk/all-api-hub/commit/235ceca91f98ba550b4ded7e9cd52109795d362b))
* 优化账号识别流程，支持自动创建访问令牌 ([021c8f4](https://github.com/qixing-jk/all-api-hub/commit/021c8f432cd476c61c325cacf1a89918e40f5a02))
* 修改`令牌`字符为`密钥` ([4ff62b0](https://github.com/qixing-jk/all-api-hub/commit/4ff62b01cd99d37063a958eb385356648fef6f54))
* 修改token组tooltip展示文字为'提示'和'补全'并分行显示 ([b661c3c](https://github.com/qixing-jk/all-api-hub/commit/b661c3c915af8521d8d84415ead6fd292ace8e0c))
* 修改网站名称为链接可点击跳转 ([2185488](https://github.com/qixing-jk/all-api-hub/commit/218548821770f250be57451718edfd81537a30b2))
* 删除未使用的模拟数据文件 mockData.ts ([ff98ca3](https://github.com/qixing-jk/all-api-hub/commit/ff98ca3b6ea8ee4e233a2414e482c7a65bef28f9))
* 在ModelItem组件中新增可用分组和所有分组模式支持 ([d6c9d9d](https://github.com/qixing-jk/all-api-hub/commit/d6c9d9d87d7c9927c34a60033aea567333de394e))
* 在ModelItem组件中添加分组点击回调函数，并优化分组显示逻辑 ([87b5d26](https://github.com/qixing-jk/all-api-hub/commit/87b5d26bd6a51088fcb958d3fc5fd15e86226eb2))
* 在ModelList组件中添加分组选择逻辑 ([0f0a4bb](https://github.com/qixing-jk/all-api-hub/commit/0f0a4bbf8297d196e3c3140dafb1c411598a3d1d))
* 在标题下方添加 slogan ([8b2ba0f](https://github.com/qixing-jk/all-api-hub/commit/8b2ba0fd49201cdfecc6da5370278312c7e77b37))
* 在添加账号对话框中添加充值金额比例设置 ([4d7a29b](https://github.com/qixing-jk/all-api-hub/commit/4d7a29b94c96d922c4d80700a458ce6849d220c1))
* 完善自动刷新功能的前端界面和交互 ([b3287db](https://github.com/qixing-jk/all-api-hub/commit/b3287db1c05abfc1d48925f6848ef84335a2512f))
* 实现AccountList模型菜单跳转并自动选择账号 ([ae8a49d](https://github.com/qixing-jk/all-api-hub/commit/ae8a49d15f2a8e9fa88aae002faaf86cb8a20ee6))
* 实现popup页面真实数据展示并修正美元金额计算 ([76c263b](https://github.com/qixing-jk/all-api-hub/commit/76c263be81e4bd76b43dda8b05c323f7396d3694))
* 实现后台自动刷新服务 ([56b0e3d](https://github.com/qixing-jk/all-api-hub/commit/56b0e3db96638d1ef5160ab3108548a3d2ccbc7a))
* 实现完整的 options 设置页面系统 ([a6f258d](https://github.com/qixing-jk/all-api-hub/commit/a6f258dc2eda8128677bb5d0e72c665e508d5860))
* 实现完整的API密钥创建功能 ([020c223](https://github.com/qixing-jk/all-api-hub/commit/020c2235eb027a55fbbb6b7ffbe43fcb62932bc5))
* 实现完整的模型列表管理功能 ([7a0b8a3](https://github.com/qixing-jk/all-api-hub/commit/7a0b8a345555b6824fbac831ebe150beecf6be5c))
* 实现密钥编辑和删除功能 ([c7e3827](https://github.com/qixing-jk/all-api-hub/commit/c7e3827888534fbd2f1248806a45e91175c65d9e))
* 实现插件页面间URL路由和跳转功能 ([64f4e18](https://github.com/qixing-jk/all-api-hub/commit/64f4e1898fb7c6bff728f6feb945346ca022460b))
* 实现用户偏好设置持久化存储 ([07de877](https://github.com/qixing-jk/all-api-hub/commit/07de8779dbe9aaaec51ca84508accdc4a9ab7b18))
* 实现自动获取站点充值比例功能 ([41e48ba](https://github.com/qixing-jk/all-api-hub/commit/41e48bacdaa6e0706d0fbe5ff3666f62aa42b591))
* 实现行业标准的Tab滚动交互体验 ([4e2eb79](https://github.com/qixing-jk/all-api-hub/commit/4e2eb79043032dfd4917541201434ecc9f033225))
* 实现账号健康状态动态更新机制 ([588569d](https://github.com/qixing-jk/all-api-hub/commit/588569da7f764074c2414f78eb64fe6b05b4ba09))
* 实现账号删除功能和确认对话框 ([5ff1ff2](https://github.com/qixing-jk/all-api-hub/commit/5ff1ff249ccd31ab73b336f298559633d310df06))
* 实现账号存储服务系统 ([b7dcb9c](https://github.com/qixing-jk/all-api-hub/commit/b7dcb9cdd68612c7a648f96fc6bfcf17413d6259))
* 实现账号编辑功能和代码重构 ([af43ac3](https://github.com/qixing-jk/all-api-hub/commit/af43ac3d76f2e2e98bb45c7fa660dcffe8384116))
* 密钥复制时自动添加 sk- 前缀 ([4bfdd07](https://github.com/qixing-jk/all-api-hub/commit/4bfdd07070a28daf1d6e2efca60a1bc9cc117a84))
* 密钥管理页面要求手动选择账号后才能查看密钥 ([1704201](https://github.com/qixing-jk/all-api-hub/commit/1704201ae874abbbb768edd18afd614c9de42dd0))
* 封装Tooltip组件并优化UI交互 ([ae98fc7](https://github.com/qixing-jk/all-api-hub/commit/ae98fc7c6726a5cd0a7ba1e58658695d89f2832b))
* 将今日消耗总金额文本增加至5xl 大小 ([b28ae80](https://github.com/qixing-jk/all-api-hub/commit/b28ae80323d1e46c5664b5fd11ec87dc855d94e5))
* 将今日消耗标题重构为 Headless UI Tabs，支持今日消耗和总余额切换 ([cf8df3d](https://github.com/qixing-jk/all-api-hub/commit/cf8df3d15c524ac5041f0e626c086c363f43fd30))
* 扩展用户偏好设置支持自动刷新配置 ([8bc3b73](https://github.com/qixing-jk/all-api-hub/commit/8bc3b73848a4740cb2e8ea6713ad68085af577b2))
* 改进自动识别错误处理和用户体验 ([3f807ed](https://github.com/qixing-jk/all-api-hub/commit/3f807edf6d6fe3d2c32df31bb9389df0a8239471))
* 新增添加站点 dialog ([66a981b](https://github.com/qixing-jk/all-api-hub/commit/66a981b2a772e4aa02f97b6c3ec7e129cb0fcf43))
* 更改按钮名称和描述文字 ([589a1e4](https://github.com/qixing-jk/all-api-hub/commit/589a1e404cb1f2123d0ab3f5d04bdcd0fac854a4))
* 更改账号列表为空时的 UI 图标和文字提示 ([fbef754](https://github.com/qixing-jk/all-api-hub/commit/fbef75478d1d80e0e89888865937112df04d6afb))
* 更新关于页面和自动识别错误处理 ([924c5ea](https://github.com/qixing-jk/all-api-hub/commit/924c5ea93ffacc51c2afe590765f5a5080f952c8))
* 更新弹出层使用新的数据存储系统 ([14c0a98](https://github.com/qixing-jk/all-api-hub/commit/14c0a9892a6a40ba697a36289db40854a71dd06b))
* 更新账号管理按钮图标和文案 ([d32a61d](https://github.com/qixing-jk/all-api-hub/commit/d32a61dc3a7d90efdcd7f2b4bf8cd0a8369c3519))
* 添加@plasmohq/storage依赖 ([202cbc1](https://github.com/qixing-jk/all-api-hub/commit/202cbc124890acc0c41731f8eed3c79d79646a01))
* 添加刷新按钮和最后更新时间功能 ([3285ced](https://github.com/qixing-jk/all-api-hub/commit/3285cedcab2eae75b00b24efe3c66dece474121b))
* 添加复制 URL 的功能实现 ([50d3970](https://github.com/qixing-jk/all-api-hub/commit/50d39702afffc3926a7201df51ea718ae3c87db7))
* 添加新的AI模型厂商支持 ([72683e7](https://github.com/qixing-jk/all-api-hub/commit/72683e7e99f7655f232fcc265f3563ada0653457))
* 添加滚动条隐藏工具类 ([60fd8bd](https://github.com/qixing-jk/all-api-hub/commit/60fd8bd2fde987a6ac6824ad41417f110bed06a2))
* 添加现代前端技术栈和美观欢迎页面 ([5c9c1c4](https://github.com/qixing-jk/all-api-hub/commit/5c9c1c465d5b19700c726d010b4d2aa6fbedb6a1))
* 添加站点状态指示器 ([84befc0](https://github.com/qixing-jk/all-api-hub/commit/84befc0e4fd52b6914f13970d26b890cad9ab473))
* 添加符合新数据结构的模拟数据 ([cbdafde](https://github.com/qixing-jk/all-api-hub/commit/cbdafdea12e48c388bba540bb6b06cafafe7795b))
* 添加简洁价格格式化函数 ([6b562f6](https://github.com/qixing-jk/all-api-hub/commit/6b562f6dea9fd0041baafc2b376b64aeaf5da937))
* 添加自动打开窗口识别站点功能 ([2fe21bf](https://github.com/qixing-jk/all-api-hub/commit/2fe21bfbb9b560ecf4bd3aac57b329e79218aa34))
* 添加账号余额和今日使用情况自动获取功能 ([2abd6a3](https://github.com/qixing-jk/all-api-hub/commit/2abd6a3209ec550948f2249d24ce471115f6f1ac))
* 添加账号存储系统使用示例 ([f865d21](https://github.com/qixing-jk/all-api-hub/commit/f865d21a2fea876dca1d7067b917f31283442ef8))
* 添加账号存储系统数据类型定义 ([c339d54](https://github.com/qixing-jk/all-api-hub/commit/c339d54f2e3a2a070d1ee8657ee7d65fa776d4da))
* 网站地址输入框下方显示当前标签页选项 ([3a22403](https://github.com/qixing-jk/all-api-hub/commit/3a224032f3550e73f98b79b70babee37b0ea24b9))
* 设置默认按余额降序排序 ([4235bac](https://github.com/qixing-jk/all-api-hub/commit/4235bac7ec6294a0b9ca10a8c4acbec01c0b8e2e))
* 重构popup界面为API管理器样式 ([f5847cd](https://github.com/qixing-jk/all-api-hub/commit/f5847cd3eb6ce88459894cac0243d45f0d995e02))
* 重构账号列表按钮组，添加单账号刷新功能 ([cb03d20](https://github.com/qixing-jk/all-api-hub/commit/cb03d20a69d8a0cca6f60ccab84ccc7bae6c8efa))



## 0.0.1 (2025-07-21)
