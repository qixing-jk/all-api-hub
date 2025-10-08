## [1.9.0](https://github.com/qixing-jk/all-api-hub/compare/v1.8.0...v1.9.0) (2025-10-04)


### Features

* add isNotEmptyArray utility and conditional ModelLimits rendering ([99fec91](https://github.com/qixing-jk/all-api-hub/commit/99fec919ca79b7f5acbdf86b3ffccf5ded3474b7))
* **api:** add fallback site detection from object's siteType property ([82937be](https://github.com/qixing-jk/all-api-hub/commit/82937be12238d7ab7423f5bb387e91c17c9e9f6a))
* **api:** add OneHub token management types and fetch functionality ([5aa92cb](https://github.com/qixing-jk/all-api-hub/commit/5aa92cb92afedd0371d93ee097ad6d724bd5d324))
* **api:** add user group data transformation and API integration ([d83fcde](https://github.com/qixing-jk/all-api-hub/commit/d83fcde0fc86d84f72e1f64977e055a619aa6278))
* **api:** implement one hub fetchAvailableModels ([5541961](https://github.com/qixing-jk/all-api-hub/commit/5541961d1283df7fda501a52b79d7f32e3abf3b7))
* **api:** refactor API request handling with modular functions ([7536a7a](https://github.com/qixing-jk/all-api-hub/commit/7536a7a7f552bf4de1074074fe2def1e59ef0167))
* replace inline account object with DisplaySiteData type ([9048f2a](https://github.com/qixing-jk/all-api-hub/commit/9048f2a16ef4aeca0a49040818c55db2c53d2ce7))
* **site:** add site-specific API usage paths and URL utilities ([e307f92](https://github.com/qixing-jk/all-api-hub/commit/e307f92be31ea5d3734ecefe5c85e1c021808d72))

## [1.11.0](https://github.com/qixing-jk/all-api-hub/compare/v1.10.0...v1.11.0) (2025-10-08)


### Features

* **account:** enhance refresh functionality with detailed status tracking ([e0997c6](https://github.com/qixing-jk/all-api-hub/commit/e0997c664e8b6e199602860a4336c41f85886529))
* **account:** implement minimum refresh interval to prevent frequent requests ([b87d710](https://github.com/qixing-jk/all-api-hub/commit/b87d710d7a9873cd8984d513abae42c8cf8944a4))
* **account:** improve refresh logic and return updated account data ([b6a1f13](https://github.com/qixing-jk/all-api-hub/commit/b6a1f1324572ec2ee31946cb3e357b4041773976))
* **api:** add generic fetch utility and refactor OneHub service ([21b7e21](https://github.com/qixing-jk/all-api-hub/commit/21b7e21ecb9b380dee7a05fbcb3dfee37e80f6bb))
* **navigation:** update account manager URL to reflect icon functionality ([c2d885d](https://github.com/qixing-jk/all-api-hub/commit/c2d885d4382b0785a71ee549277828872a5569df))
* **ui:** add account management page header with icon and description ([854bc1b](https://github.com/qixing-jk/all-api-hub/commit/854bc1b2d6cdff956a7fe29e496df7ed388b146f))
* **ui:** adjust component borders and spacing for visual consistency ([c1fddfe](https://github.com/qixing-jk/all-api-hub/commit/c1fddfe8e721ab82eb5a4320931ee1c44a1bf53f))
* **ui:** adjust form layout and styling consistency ([748f493](https://github.com/qixing-jk/all-api-hub/commit/748f493aa218dc06dd79df4ebd7adaf5d102bffa))
* **ui:** adjust padding and spacing in BalanceSection and AccountDialog ([a8071ca](https://github.com/qixing-jk/all-api-hub/commit/a8071cae91bdb06912b0412672af79d73f759a9d))
* **ui:** remove horizontal spacing between account action buttons ([bb83579](https://github.com/qixing-jk/all-api-hub/commit/bb835792da8012fd0ad3bd64668c258118125323))
* **ui:** standardize typography and spacing across components ([b0c090f](https://github.com/qixing-jk/all-api-hub/commit/b0c090f65e4c4ecf2562bac60856e0ca93108ee2))


### Bug Fixes

* **AccountDialog:** correct conditional rendering of URL input options ([e84a243](https://github.com/qixing-jk/all-api-hub/commit/e84a243cb7e064f52779db82e36b9da4cd234fd6))
* **account:** prevent missing tab check on account data updates ([1499982](https://github.com/qixing-jk/all-api-hub/commit/1499982818cd63256fd9f2d00d1d514ccf243132))
* **url-input:** prevent current tab option when URL is auto-detected ([d6b61e2](https://github.com/qixing-jk/all-api-hub/commit/d6b61e29f6fdb3cf41399f0f2267ecc5002ad04a))

## [1.10.0](https://github.com/qixing-jk/all-api-hub/compare/v1.9.0...v1.10.0) (2025-10-07)


### Features

* **copy-key:** add Cherry Studio integration for API keys ([48765f7](https://github.com/qixing-jk/all-api-hub/commit/48765f7f75044e910d2351937e0ddcd03432b34c)), closes [#25](https://github.com/qixing-jk/all-api-hub/issues/25)


### Bug Fixes

* **account:** adjust exchange rate input step to 0.01 precision ([df94748](https://github.com/qixing-jk/all-api-hub/commit/df9474850f7835b4a563cae872e1cf78673b8354)), closes [#27](https://github.com/qixing-jk/all-api-hub/issues/27)
* **account:** restore auto-refresh on plugin open functionality ([e9d7113](https://github.com/qixing-jk/all-api-hub/commit/e9d7113c71ac72fd56b229dc82386cdde4d1798b))
* prevent infinite execution in account data loading ([eae4f6e](https://github.com/qixing-jk/all-api-hub/commit/eae4f6ec5d69b92808c5e4c682b212c15e5ca778))
* **types:** correct `siteType` property casing and remove duplicate field ([606a1be](https://github.com/qixing-jk/all-api-hub/commit/606a1be7a8806edd6a1927564c2462536860f937))

## [1.8.0](https://github.com/qixing-jk/all-api-hub/compare/v1.7.1...v1.8.0) (2025-10-04)


### Features

* **account:** add site type support for account management ([e8ee5e9](https://github.com/qixing-jk/all-api-hub/commit/e8ee5e99f853154ac00c9c143c38c404c2ff6243))
* add site type detection and improve auto-detect site flow ([348a3ae](https://github.com/qixing-jk/all-api-hub/commit/348a3ae19de04dfef7c2935c6e7394557cc7aeec))
* add site type detection functionality ([f33529e](https://github.com/qixing-jk/all-api-hub/commit/f33529e34307cf38a3373aa4ae9cfc3884af1d00))
* **api:** refactor site override handling & implement oneHub pricing ([2be1dfe](https://github.com/qixing-jk/all-api-hub/commit/2be1dfe4cc6955c2e7bfb10b8bedae421b2b7d56))
* **model-pricing:** support complex per-call pricing structure ([f09f985](https://github.com/qixing-jk/all-api-hub/commit/f09f9853a94d10888ebcd3d2930dd6099b9de459))


### Bug Fixes

* **account:** include siteType in stored account data ([624cef4](https://github.com/qixing-jk/all-api-hub/commit/624cef48c2b93ea90d6965833f1804c47ab90775))
* **detectSiteType:** return title from fetch and use URL in getSiteType ([19ea199](https://github.com/qixing-jk/all-api-hub/commit/19ea19936b4b24b17cae855811071ee9faf08138))
* **siteType:** add word boundaries to regex patterns to prevent false matches ([0f0639f](https://github.com/qixing-jk/all-api-hub/commit/0f0639f7e6b4084b6d659e17c8c8bf1beec53c7e))

## [1.7.1](https://github.com/qixing-jk/all-api-hub/compare/v1.7.0...v1.7.1) (2025-10-03)


### Bug Fixes

* **api:** correct check-in support detection using site status ([572fb38](https://github.com/qixing-jk/all-api-hub/commit/572fb385ac92d9298b387e7a6763e6edc4afc505))

## [1.7.0](https://github.com/qixing-jk/all-api-hub/compare/v1.6.0...v1.7.0) (2025-10-03)


### Features

* add check-in support detection and toggle functionality ([645e3d6](https://github.com/qixing-jk/all-api-hub/commit/645e3d69a414a571bd3c5a9be7c765907419ce9c))
* **api:** add check-in status support for accounts ([e8048e8](https://github.com/qixing-jk/all-api-hub/commit/e8048e834e56f03df93b0209454c0502b869af2d))

## [1.6.0](https://github.com/qixing-jk/all-api-hub/compare/v1.5.0...v1.6.0) (2025-10-03)


### Features

* **account:** add notes field support for account management ([86be441](https://github.com/qixing-jk/all-api-hub/commit/86be44149e2a6cbd7b1396e072b1f3e091452ccc)), closes [#11](https://github.com/qixing-jk/all-api-hub/issues/11)
* **ui:** add user icon to site username display ([0ed4362](https://github.com/qixing-jk/all-api-hub/commit/0ed4362752e046aaae2f80f41154e5e2cb5404ed))

## [1.5.0](https://github.com/qixing-jk/all-api-hub/compare/v1.4.1...v1.5.0) (2025-10-02)


### Features

* add program name placeholder to WebDAV settings input ([d4f570f](https://github.com/qixing-jk/all-api-hub/commit/d4f570fadf69b52ebc2024de91e549d9dcf6a5b6))
* ensure consistent height ([668ff53](https://github.com/qixing-jk/all-api-hub/commit/668ff53e83370487528064205eda8804281af735))
* hide scrollbar while maintaining scroll functionality ([a4b98ea](https://github.com/qixing-jk/all-api-hub/commit/a4b98eadd8ea798f75d944b2a8e21afbd29f36c3))
* **ui:** adjust ControlPanel layout and spacing ([7164a88](https://github.com/qixing-jk/all-api-hub/commit/7164a888468310a69df91f0aea98b3c5da23aac9))
* **ui:** adjust item spacing and remove redundant wrapper ([a9e60e6](https://github.com/qixing-jk/all-api-hub/commit/a9e60e63c0536487d20b3d999e4969a66aced712))
* **ui:** align action button with form controls visually ([1e85f7a](https://github.com/qixing-jk/all-api-hub/commit/1e85f7adbdf9a3f1940610bb2cc749d74da51794))


### Performance Improvements

* **ModelList:** replace static render with Virtuoso for optimized list performance ([a7d4655](https://github.com/qixing-jk/all-api-hub/commit/a7d4655aa4c0c6ae26c9aea8dee0ff5d7aa20d68))

## [1.4.1](https://github.com/qixing-jk/all-api-hub/compare/v1.4.0...v1.4.1) (2025-10-02)


### Bug Fixes

* correct ModelDisplay props type and missing newline ([9316eca](https://github.com/qixing-jk/all-api-hub/commit/9316ecaa8ad0fa65b3b6b3f80e26260a5ad363a9))
* reset detected account state when no existing account found ([9e4c552](https://github.com/qixing-jk/all-api-hub/commit/9e4c5525c89fc3f846c57161e902c24b709f62ad))

## [1.4.0](https://github.com/qixing-jk/all-api-hub/compare/v1.3.1...v1.4.0) (2025-10-02)


### Features

* add copy model names functionality to control panel ([45326fb](https://github.com/qixing-jk/all-api-hub/commit/45326fbdb490fd4088a150a55a5093c8e86b3ab6))
* **model-list:** add state comments and set default values for visibility ([632deca](https://github.com/qixing-jk/all-api-hub/commit/632deca4759494a38ec60d3336e12c92c13c5685))
* **model:** add support for additional AI providers ([13ebd9a](https://github.com/qixing-jk/all-api-hub/commit/13ebd9a9013b592fe12941301cbbcbced06589dc))
* **ModelList:** sort providers in descending order by filtered count ([aa82688](https://github.com/qixing-jk/all-api-hub/commit/aa82688988afb00b8e5d35e8bce5187889e00345))
* **models:** add Baidu and Yi model providers ([aa204a2](https://github.com/qixing-jk/all-api-hub/commit/aa204a266bad314306c216fbbb1966e58f90a047))
* **models:** add DeepMind provider and update OpenAI patterns ([421e210](https://github.com/qixing-jk/all-api-hub/commit/421e21022499dcd99f740067c771c70aa60067b8))
* **ProviderTabs:** add horizontal scroll on wheel event ([41e142f](https://github.com/qixing-jk/all-api-hub/commit/41e142f82a13862c621faf59478708c14d51d26a))


### Bug Fixes

* add children prop to ProviderTabs for nested Tab.Panels rendering ([5a3b251](https://github.com/qixing-jk/all-api-hub/commit/5a3b25194aa4ea52a1c5f6e80bc687e0c42bf589))

## [1.3.1](https://github.com/qixing-jk/all-api-hub/compare/v1.3.0...v1.3.1) (2025-10-01)


### Bug Fixes

* **ci:** update release PR workflow config ([77d76c9](https://github.com/qixing-jk/all-api-hub/commit/77d76c9bd02db9b1e17fef5de654ee4a6a7b9672))

## [1.3.0](https://github.com/qixing-jk/all-api-hub/compare/v1.2.0...v1.3.0) (2025-10-01)


### Features

* add WebDAV backup and sync functionality ([c81faa8](https://github.com/qixing-jk/all-api-hub/commit/c81faa87244cabd22a499b3bfc6ed9d0408a93f5))


### Bug Fixes

* ensure WebDAV backup directory creation before file upload ([a338574](https://github.com/qixing-jk/all-api-hub/commit/a33857460da6281c073d8265e3177ac74046df80))

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

## [1.1.0](https://github.com/qixing-jk/all-api-hub/compare/v1.0.0...v1.1.0) (2025-09-08)


### Features

* **account:** add manual addition support with streamlined UI flow ([429b924](https://github.com/qixing-jk/all-api-hub/commit/429b924f11a78bafe87b63b3c3aaf01569e85020))

## [1.0.0](https://github.com/qixing-jk/all-api-hub/compare/v0.0.3...v1.0.0) (2025-09-08)


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
