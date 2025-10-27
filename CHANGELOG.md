# Changelog

## [1.38.0](https://github.com/qixing-jk/all-api-hub/compare/v1.37.0...v1.38.0) (2025-10-27)


### Features

* **account-sorting:** pin accounts with custom check-in or redeem URLs to top ([#80](https://github.com/qixing-jk/all-api-hub/issues/80)) ([2207440](https://github.com/qixing-jk/all-api-hub/commit/22074409c955d139e7a9f6076864ccd14ae981b1))
* **account:** add total count display in account list header ([5ee0822](https://github.com/qixing-jk/all-api-hub/commit/5ee082218b78bb62e1bd066cf07af7ec88d68e35))
* **account:** disable sort buttons and always show header during search ([5f0ac59](https://github.com/qixing-jk/all-api-hub/commit/5f0ac59bb9fc27d2a61825362fe4a0e575e7e37b))
* **sort:** add custom redeem and open tab match as sort rules ([8fe2951](https://github.com/qixing-jk/all-api-hub/commit/8fe2951aaa491babf40a6048232527863e084899))
* **testing:** add Vitest, MSW, browser API mock, and CI for extension apps ([721c5cf](https://github.com/qixing-jk/all-api-hub/commit/721c5cfc51d05cfe882f4d2302fb484516ca1a7e))


### Bug Fixes

* **account:** correct tab matching logic and add score parameter ([c40f8a3](https://github.com/qixing-jk/all-api-hub/commit/c40f8a348e2220bc3087f66746c5753fe1c9bc6e))
* **config:** correct sorting config migration logic strictness ([8df55de](https://github.com/qixing-jk/all-api-hub/commit/8df55de18ca5f675dba6182254ff9b80d524c674))
* **config:** ensure deep copy of default sorting criteria ([6d7da69](https://github.com/qixing-jk/all-api-hub/commit/6d7da69ccb26b7b3ae9e9d2cd32bde582d7d0399))
* **config:** resolve path alias using `rootDir` in vitest config ([72e444b](https://github.com/qixing-jk/all-api-hub/commit/72e444b05a3c330c546f340f4d3c36b65b9919e2))
* **sorting:** migrate and default new criteria to disabled ([24632ae](https://github.com/qixing-jk/all-api-hub/commit/24632aec12381347af6b5b7b8984dd44a78e5c3c))
* **sorting:** remove obsolete version field from config interfaces ([4171abc](https://github.com/qixing-jk/all-api-hub/commit/4171abc5cd3c61d20436ecd00ec1c13cd3eb2b84))
* **sorting:** remove redundant click handler for toggle switch ([ea6fdd3](https://github.com/qixing-jk/all-api-hub/commit/ea6fdd3c8a57f437c0a536ea2ad5a988e84c76aa))
* use migratedPrefs in migration loop condition ([04c0c4a](https://github.com/qixing-jk/all-api-hub/commit/04c0c4a4347f4215658c28d4166b536acaee19fe))

## [1.37.0](https://github.com/qixing-jk/all-api-hub/compare/v1.36.0...v1.37.0) (2025-10-27)


### Features

* **account-search:** implement composite multi-field account search across UI surfaces ([603a04d](https://github.com/qixing-jk/all-api-hub/commit/603a04dd6e788d4fdf9200c5169977497aea4a68))
* **account:** adjust search input size to small for better UI fit ([c944a64](https://github.com/qixing-jk/all-api-hub/commit/c944a64845fdd4c66e016d87b34e7be828fe7134))
* add side panel open functionality ([ad90a8a](https://github.com/qixing-jk/all-api-hub/commit/ad90a8a467625cc7502d9fd1aac28c299a52f079))
* **ui:** adjust balance tab currency display font size in compact mode ([47a13f9](https://github.com/qixing-jk/all-api-hub/commit/47a13f94f0a28e25ffd15a2d0aeb4232df13f7d0))
* **ui:** restructure balance section layout and spacing ([af5df7b](https://github.com/qixing-jk/all-api-hub/commit/af5df7b061ab25875043d37ae3fa270077e99253))
* **ui:** simplify BalanceTabs layout by removing redundant wrapper div ([85863f3](https://github.com/qixing-jk/all-api-hub/commit/85863f399244fb98dd7e447df7056d0529239ba5))
* **ui:** update action buttons size from sm to default ([cba5edc](https://github.com/qixing-jk/all-api-hub/commit/cba5edcbab3553186aa36170eef9ed7972592e27))


### Bug Fixes

* **account:** prevent default and stop propagation on Escape key press ([d7b5668](https://github.com/qixing-jk/all-api-hub/commit/d7b56685e96701f82710c1f8cbd2f09dda2ea9cd))
* **i18n:** add 'clear' action translation and update usage ([122be7c](https://github.com/qixing-jk/all-api-hub/commit/122be7c510233eb03be3509b838334731c035c13))

## [1.36.0](https://github.com/qixing-jk/all-api-hub/compare/v1.35.0...v1.36.0) (2025-10-26)


### Features

* **account:** add configurable redeem page path and navigation action ([7a78e1a](https://github.com/qixing-jk/all-api-hub/commit/7a78e1af598f24f3380fd2e8035f92142dd35b98))
* **check-in:** allow disabling auto-open redeem ([#78](https://github.com/qixing-jk/all-api-hub/issues/78)) ([a4cc3f4](https://github.com/qixing-jk/all-api-hub/commit/a4cc3f4314d860a5466e7e1927d0c4e1b19d1f9f))
* **navigation:** support opening both check-in and redeem pages simultaneously ([b5242af](https://github.com/qixing-jk/all-api-hub/commit/b5242af5808931cab159da7a47f442c0a9d91730))


### Bug Fixes

* correct site URL input icon alignment ([1234a35](https://github.com/qixing-jk/all-api-hub/commit/1234a351830c51f0a36459ce3c58fe2a0f2050ed))
* **siteType:** update API router paths for various sites ([4c54093](https://github.com/qixing-jk/all-api-hub/commit/4c540937c00458d4e07fba2aa4504af3c94c1d1f))

## [1.35.0](https://github.com/qixing-jk/all-api-hub/compare/v1.34.0...v1.35.0) (2025-10-26)


### Features

* **account:** replace check-in icons with CurrencyYenIcon ([475b0a2](https://github.com/qixing-jk/all-api-hub/commit/475b0a21f476439744769c96411b98de912390f2)), closes [#68](https://github.com/qixing-jk/all-api-hub/issues/68)


### Bug Fixes

* **check-in:** auto-reset custom check-in accounts daily ([6382ff4](https://github.com/qixing-jk/all-api-hub/commit/6382ff44fb3afb3a0eb7e4afa396bfaddeba5fae))
* **check-in:** correct default value for `isCheckedInToday` flag ([90359f6](https://github.com/qixing-jk/all-api-hub/commit/90359f683063d01ac0d973b7cecbbc47bd8fdaf0))
* correct default `isCheckedInToday` value in documentation ([1b70a65](https://github.com/qixing-jk/all-api-hub/commit/1b70a65b2b93ca7255dc3eeb2971f71f5eb6ce67))
* **i18n:** add 'more' action translation ([c47807f](https://github.com/qixing-jk/all-api-hub/commit/c47807fdcfa5d9fa59cc1d2587e6bf86cc73b811))

## [1.34.0](https://github.com/qixing-jk/all-api-hub/compare/v1.33.0...v1.34.0) (2025-10-26)


### Features

* **webdav:** add automatic WebDAV account data sync with merge strategy ([b03df00](https://github.com/qixing-jk/all-api-hub/commit/b03df00a094312a8629670ff41c76634f67ff73a))


### Bug Fixes

* correct WebDAV auto-sync button text and add missing locale keys ([ebc487c](https://github.com/qixing-jk/all-api-hub/commit/ebc487c10c81a4307e223fc26cdd40c350a81b61))
* replace chrome.runtime with browser.runtime and improve error handling ([f122d0a](https://github.com/qixing-jk/all-api-hub/commit/f122d0a94794a5cdb6eb30f896fa53aa41e61386))

## [1.33.0](https://github.com/qixing-jk/all-api-hub/compare/v1.32.1...v1.33.0) (2025-10-25)


### Features

* **layout:** introduce reusable AppLayout component ([d12b83c](https://github.com/qixing-jk/all-api-hub/commit/d12b83c0de094c4e691dc1e32481ba7690eaee4e))

## [1.32.1](https://github.com/qixing-jk/all-api-hub/compare/v1.32.0...v1.32.1) (2025-10-25)


### Bug Fixes

* **card:** correct right content container width on small screens ([641bf07](https://github.com/qixing-jk/all-api-hub/commit/641bf07556b1de1f204bf459ee90637d37d5a4d4))

## [1.32.0](https://github.com/qixing-jk/all-api-hub/compare/v1.31.0...v1.32.0) (2025-10-25)


### Features

* **account:** improve UI layout and responsiveness ([6b3868a](https://github.com/qixing-jk/all-api-hub/commit/6b3868ad08856446bc6149052565c20783b76053))
* **config:** extract React DevTools auto-injection into dedicated plugin ([2b243b2](https://github.com/qixing-jk/all-api-hub/commit/2b243b27e8563122aa050d8bd4c48686de4632bf))
* **plugins:** add configurable react-devtools auto plugin with cache ([3264c1c](https://github.com/qixing-jk/all-api-hub/commit/3264c1c0e75a00ba5edc6d155f42e5b617a53e27))
* **react-devtools:** enhance plugin with env vars and force fetch support ([95b2126](https://github.com/qixing-jk/all-api-hub/commit/95b21264e607abb95640e153b4b06fdd0672bafa))
* **ui:** improve CardItem responsive layout ([8f2baee](https://github.com/qixing-jk/all-api-hub/commit/8f2baee12f661260ea7544e26fa46825abfba87d))


### Bug Fixes

* remove redundant width classes from input fields ([9be8a8c](https://github.com/qixing-jk/all-api-hub/commit/9be8a8cfc86dff0c3cbf9b4c6f300599d013e0cc))
* **sidebar:** correct mobile overlay z-index to ensure proper layering ([bc57532](https://github.com/qixing-jk/all-api-hub/commit/bc57532f8b3391e3eb570d4c42cef396bd2a9347))
* **ui:** adjust button sizes with responsive scaling for mobile ([817c501](https://github.com/qixing-jk/all-api-hub/commit/817c501093e364f1161c77cf28c71cb4e9e52269))
* **ui:** correct z-index stacking order in Sidebar component ([77938db](https://github.com/qixing-jk/all-api-hub/commit/77938dbc5c48699dddc5fe524896c2045dc92259))
* **ui:** ensure consistent CardContent usage across components ([d0e8d25](https://github.com/qixing-jk/all-api-hub/commit/d0e8d25a2c548c31c504e01b2f63681f8fc67b11))
* **ui:** implement responsive sizing for buttons, cards and icons ([eb6d10e](https://github.com/qixing-jk/all-api-hub/commit/eb6d10e9a8d0fd5ce108a09d2699758d1eb24789))
* **ui:** refactor password input fields to use `rightIcon` prop ([5d2d1ad](https://github.com/qixing-jk/all-api-hub/commit/5d2d1ad4b8f6eedce448d97e7eb6efdb62ed3b5a))
* **ui:** wrap card content in CardContent component for consistency ([f23e1f7](https://github.com/qixing-jk/all-api-hub/commit/f23e1f7244e596f4b12e2d1b20dad1872069616a))

## [1.31.0](https://github.com/qixing-jk/all-api-hub/compare/v1.30.0...v1.31.0) (2025-10-24)


### Features

* **account:** add account creation button and restructure layout ([c433b7d](https://github.com/qixing-jk/all-api-hub/commit/c433b7d377b63f3a0d7f9c8ca424444366469534)), closes [#60](https://github.com/qixing-jk/all-api-hub/issues/60)
* **account:** add siteName support to account detection flow ([ffa2b8a](https://github.com/qixing-jk/all-api-hub/commit/ffa2b8aababcb579eaa898817b659130a694afed))
* **account:** add usage log feature to account management ([8bd878b](https://github.com/qixing-jk/all-api-hub/commit/8bd878b1c265ebd940e71500ec2f55e47a7be5d9))
* **account:** adjust balance display width to improve responsiveness ([beaff87](https://github.com/qixing-jk/all-api-hub/commit/beaff873cb7c9e353bbd12b72477fd57e04f3aa3))
* add missing i18n translation dependencies to useEffect hooks ([fd71410](https://github.com/qixing-jk/all-api-hub/commit/fd71410f308d51062fd6312aafafa0fd5e8a8c11))
* **api:** enhance user info handling with fallback mechanism ([30b5cd0](https://github.com/qixing-jk/all-api-hub/commit/30b5cd0762b9e906b03a3b660d408c6f1c50a5dc))
* **SortingPrioritySettings:** auto-save on drag end & remove save button ([8847cc2](https://github.com/qixing-jk/all-api-hub/commit/8847cc2c969824e6a890f4e0ccb904ff34ed51ce))
* **ui:** streamline ImportExport layout with consistent spacing ([4040ca2](https://github.com/qixing-jk/all-api-hub/commit/4040ca211e73cda2ebf57fd381175acc29fa8ba9))


### Bug Fixes

* **account:** update SiteInfo IconButton sizes and aria-labels ([89ae2c9](https://github.com/qixing-jk/all-api-hub/commit/89ae2c93ad4a710680cbb1d6679f1cd59e9f3b74))
* **card:** correct padding props and password toggle button styling ([57b8c3b](https://github.com/qixing-jk/all-api-hub/commit/57b8c3b6ec646297680f49e7de790aa33d79310e))
* **import:** adjust card content padding to 'md' for better spacing ([105fadf](https://github.com/qixing-jk/all-api-hub/commit/105fadf655ce264e0a4678f4ea3132e69b846acd))
* **import:** adjust import section UI spacing and textarea height ([11bd49a](https://github.com/qixing-jk/all-api-hub/commit/11bd49ad6739d43648c347423dd642c704385efd))
* **locales:** add missing translations for visibility toggle and descriptions ([a2a10b6](https://github.com/qixing-jk/all-api-hub/commit/a2a10b681c1094929f3ba351307dc855cd46ec5d))


### Performance Improvements

* **account:** extend parallel fetches for check-in support and site name ([e98c555](https://github.com/qixing-jk/all-api-hub/commit/e98c55551b1b7cb42a7a44d1728bbfbee9bb38a2))

## [1.30.0](https://github.com/qixing-jk/all-api-hub/compare/v1.29.0...v1.30.0) (2025-10-23)


### Features

* **account-mgmt:** simplify DelAccountDialog modal structure ([dca6c6b](https://github.com/qixing-jk/all-api-hub/commit/dca6c6bfece650aa263c7341ddac686479f7c0bc))
* **account:** refactor dialog layout and fix UI inconsistencies ([7f320ab](https://github.com/qixing-jk/all-api-hub/commit/7f320abe472e6f805d02d6e4257b1380c3724ab6))
* **account:** reorganize site info layout for tighter spacing ([de9fc0f](https://github.com/qixing-jk/all-api-hub/commit/de9fc0f4e6199d9740b5f0e50e2c3a1d61c0c1c7))
* **Alert:** replace semantic color variables with Tailwind color classes ([663fad1](https://github.com/qixing-jk/all-api-hub/commit/663fad195857910eb5cdca59d3d5b76cef3be09a))
* **dialog:** replace headlessui dialogs with custom Modal component ([a81da70](https://github.com/qixing-jk/all-api-hub/commit/a81da703d7c561187cb0a5b12d286e22a7f00de8))
* **dialog:** replace headlessui dialogs with reusable Modal component ([ce8f29b](https://github.com/qixing-jk/all-api-hub/commit/ce8f29bd6adcd5c2dbee37e01462ab5d73a0ec5c))
* **form:** migrate token management dialog inputs to FormField component ([2674063](https://github.com/qixing-jk/all-api-hub/commit/2674063f12370fdecb610a2ea12f2e9a9a44f3d3))
* **i18n:** add missing interpolation handler to return empty string ([166f2d3](https://github.com/qixing-jk/all-api-hub/commit/166f2d34b0555f39fe8cc91c7459e6f20a8bff51))
* **key-management:** refactor search input to use leftIcon prop ([d893613](https://github.com/qixing-jk/all-api-hub/commit/d8936133e85e02331ab1d3b76ed727a560ae9a44))
* **key-management:** replace custom buttons and inputs with UI components ([6e53939](https://github.com/qixing-jk/all-api-hub/commit/6e53939a8af9236530b467db327110158f864a11))
* **key-mgmt:** refactor token header layout for improved alignment ([6b956e0](https://github.com/qixing-jk/all-api-hub/commit/6b956e0f4b338c40bdade6b320df42acebeffdc1))
* **key-mgmt:** wrap key display in flex container for better alignment ([b566802](https://github.com/qixing-jk/all-api-hub/commit/b566802b48a9892a1804c49a1e24dfdfb2048edf))
* **newapi:** add validation for empty models list ([1cc101b](https://github.com/qixing-jk/all-api-hub/commit/1cc101b49b4206f91cd16713e6c5c53c84d028ce))
* **options:** remove focus styles from theme toggle button ([0025d77](https://github.com/qixing-jk/all-api-hub/commit/0025d77ecf615a7fc9f09114767f486e6d139977))
* **sidebar:** replace h2 and span with Heading3 component ([11f71b9](https://github.com/qixing-jk/all-api-hub/commit/11f71b906d0fa6854f1612d1f24832cb7c97a907))
* **ui:** add CardList and CardItem components ([6e71db0](https://github.com/qixing-jk/all-api-hub/commit/6e71db09bd604f5ab5c943e61aae6e3df0d27a4d))
* **ui:** add comprehensive UI component library ([5ec2415](https://github.com/qixing-jk/all-api-hub/commit/5ec2415f920bb2a95b55698c30d8b3fa51f8bbf3))
* **ui:** add EmptyState component and refactor UI components ([8f9dddb](https://github.com/qixing-jk/all-api-hub/commit/8f9dddb8076a27ca5712adad1106eb6d28cea063))
* **ui:** add new ToggleButton component and refactor UI elements ([a4027a6](https://github.com/qixing-jk/all-api-hub/commit/a4027a60584d4db9ed59bbac0e3306c7fd249d59))
* **ui:** adjust button hover state color and focus styles ([fca06c4](https://github.com/qixing-jk/all-api-hub/commit/fca06c4bbff0ce01ba5c8428bad883eeb5a810e9))
* **ui:** adjust small size button height to h-8 for consistency ([f4f159a](https://github.com/qixing-jk/all-api-hub/commit/f4f159adad3bf7d629f92ed229a59390bfd69849))
* **ui:** enhance Card components with padding and border props ([9cf0f10](https://github.com/qixing-jk/all-api-hub/commit/9cf0f104dec322260768d12c5a0a16befe12666f))
* **ui:** implement consistent card component system ([343f51b](https://github.com/qixing-jk/all-api-hub/commit/343f51b9c31d7e67d07f0886811913577e36696a))
* **ui:** implement size-based switch thumb positioning ([9bdd17b](https://github.com/qixing-jk/all-api-hub/commit/9bdd17b581bd09a35b817c9f3c45587da0767feb))
* **ui:** improve card layout and spacing consistency ([c7b1a32](https://github.com/qixing-jk/all-api-hub/commit/c7b1a32ddebd4d5062ea084176664027d3535e8b))
* **ui:** increase popup width from 400px to 410px ([3d6aa32](https://github.com/qixing-jk/all-api-hub/commit/3d6aa32ab1739f4295a49ecf890d7156c3c0ab57))
* **ui:** introduce reusable Card and Switch components ([4cc5b0c](https://github.com/qixing-jk/all-api-hub/commit/4cc5b0c620df348615ae6bdc64e78f1a71dd7517))
* **ui:** refactor card headers with CardTitle and CardDescription ([dc78508](https://github.com/qixing-jk/all-api-hub/commit/dc78508c51e104f431002442a6ffbb5b8e6db5a6))
* **ui:** rename padding size 'default' to 'md' and add empty default case ([9bcc700](https://github.com/qixing-jk/all-api-hub/commit/9bcc7006aed1bcb58c52216f3c4824cf44ea9478))
* **ui:** replace custom buttons with IconButton and Badge components ([ed1f0ce](https://github.com/qixing-jk/all-api-hub/commit/ed1f0ce3d272383d3c4e931fc3f42a39c2deeb35))
* **ui:** replace custom buttons with shared Button component ([55b9ea0](https://github.com/qixing-jk/all-api-hub/commit/55b9ea02d8b79dd72ce61135a18f004e0a3f87df))
* **ui:** replace custom components with shared UI library components ([93d59ef](https://github.com/qixing-jk/all-api-hub/commit/93d59ef72e3457b1fc6a04d15b9111b3bd375dae))
* **ui:** replace custom components with standardized UI components ([2be46b0](https://github.com/qixing-jk/all-api-hub/commit/2be46b0cb1c95b4c191e2ae75e9f4a886cc174f3))
* **ui:** replace custom div containers with Card components ([a633897](https://github.com/qixing-jk/all-api-hub/commit/a6338971f5c6bcb3faaabc217ad8ee5b99594c9f))
* **ui:** replace custom elements with shared UI components ([00aa8c9](https://github.com/qixing-jk/all-api-hub/commit/00aa8c97195cc9b101dcd6ea88bf606217b3766a))
* **ui:** replace native buttons with Button and IconButton components ([5969c9f](https://github.com/qixing-jk/all-api-hub/commit/5969c9f019098a878e2cf83a0e9850daf91f8b70))
* **ui:** replace native buttons with custom Button and IconButton components ([0d7a4a5](https://github.com/qixing-jk/all-api-hub/commit/0d7a4a53461d605679e70e6fe094ad2636710e7e))
* **ui:** replace native inputs with custom Input component ([4dd5e0e](https://github.com/qixing-jk/all-api-hub/commit/4dd5e0e1edd23d9f8f0e6a1f7320d87e1ca17143))
* **ui:** replace raw HTML elements with Typography components ([fb7f1b1](https://github.com/qixing-jk/all-api-hub/commit/fb7f1b1d10704092996b32a4df62b9e717733ca1))
* **ui:** restructure sorting priority settings with card component ([4ed62d9](https://github.com/qixing-jk/all-api-hub/commit/4ed62d927a8c5743766e54849c4111836846ceab))
* **ui:** standardize UI components and improve localization formatting ([486ae03](https://github.com/qixing-jk/all-api-hub/commit/486ae0342a8d57ed80860e946750430ed887a41c))


### Bug Fixes

* **about:** update PluginIntroCard with i18n support ([5239806](https://github.com/qixing-jk/all-api-hub/commit/5239806e6e56445e2ff87f0f574dc462e7d40502))
* **account-dialog:** replace Button with native button for SiteInfoInput ([911dc29](https://github.com/qixing-jk/all-api-hub/commit/911dc29c7089d95b9ef5b96dcb2922fc4752964f))
* **AccountDialog:** remove redundant overflow-y-auto from modal panel class ([f5972c1](https://github.com/qixing-jk/all-api-hub/commit/f5972c16a5af848b30a95c5366cd795bc2d500c8))
* **account:** remove redundant padding class from notes textarea ([f2e83e6](https://github.com/qixing-jk/all-api-hub/commit/f2e83e6f8f5af79e54788341309bbf4a943f4bc3))
* **account:** remove unnecessary flex-1 class from site name container ([4182ffe](https://github.com/qixing-jk/all-api-hub/commit/4182ffee235405b2bbe49f2e469ce2bd55e43fc7))
* add dark mode support for language switcher icon ([f87b2f6](https://github.com/qixing-jk/all-api-hub/commit/f87b2f66b2b659686d4d7ad05270630d833719b8))
* **Alert:** correct ref types for AlertTitle and AlertDescription ([0d4830c](https://github.com/qixing-jk/all-api-hub/commit/0d4830cb8fcade5e62869a505ab812b830f45a95))
* **api:** correct check-in logic and sorting priority ([34def7f](https://github.com/qixing-jk/all-api-hub/commit/34def7f9cf63bd41caf059ae4ed307ed7070073c))
* **balance:** replace custom Button with native button element ([6460aeb](https://github.com/qixing-jk/all-api-hub/commit/6460aeb0593b7dbd7b062e497b32aea9f159aca4))
* **button:** ensure type attribute defaults to "button" when not provided ([0eeb58e](https://github.com/qixing-jk/all-api-hub/commit/0eeb58e4453ba7895e06ccfc2ce7b2c57098108b))
* **card:** remove unused `asChild` prop from CardProps interface ([7446818](https://github.com/qixing-jk/all-api-hub/commit/7446818fffd4af61b1769548ee435bcae53ab8d5))
* **CopyKeyDialog:** remove redundant padding from content container ([76895cc](https://github.com/qixing-jk/all-api-hub/commit/76895cc7e5bedbcfc58a87211b946b8e7832ebec))
* correct Modal imports to use named imports ([96fe36c](https://github.com/qixing-jk/all-api-hub/commit/96fe36cd8b30ebef093b0ada637f53a8da10b16c))
* correct translation keys for toast messages in settings ([609dd40](https://github.com/qixing-jk/all-api-hub/commit/609dd4069bac0c82c961593763e26aa24aa63125))
* **key-management:** ensure refresh button displays correct state with account ([84091ee](https://github.com/qixing-jk/all-api-hub/commit/84091ee18cce2b6b5315678064fe39708c9e6a95))
* **key-mgmt:** remove redundant search input styling and icon positioning ([1b94d7e](https://github.com/qixing-jk/all-api-hub/commit/1b94d7e33fb8ca9dd1b5cbb33876152e1f128f72))
* **modal:** remove redundant styling classes from Modal components ([1161066](https://github.com/qixing-jk/all-api-hub/commit/11610665cc6b446b66197347652854c1431adfbd))
* **NewApiSettings:** correct password toggle icon vertical alignment ([77881cf](https://github.com/qixing-jk/all-api-hub/commit/77881cfab526c1a0b109956e684cb0f207c363ef))
* remove duplicate chevron icon in Select component ([adb1fbe](https://github.com/qixing-jk/all-api-hub/commit/adb1fbef9182495e30ce476478b1268a0f4c5ed7))
* remove fixed dimensions from CherryIcon components ([6e80244](https://github.com/qixing-jk/all-api-hub/commit/6e8024479db146c1f0057585158d9c7bba27a687))
* remove semantic color tokens from design system ([97a3a84](https://github.com/qixing-jk/all-api-hub/commit/97a3a84a23a9d892458579c0fbd7d9aa21e9aead))
* replace Link component with native anchor tag in SiteInfo ([53c0f19](https://github.com/qixing-jk/all-api-hub/commit/53c0f19fecbd527708f77e1785959bc4074c95ba))
* **sidebar:** adjust mobile overlay opacity and z-index for better UX ([33c20f7](https://github.com/qixing-jk/all-api-hub/commit/33c20f7d6dc21408194beda67f65fc8d9f91555a))
* **typography:** remove default weight to enable variant-specific styling ([f0921cd](https://github.com/qixing-jk/all-api-hub/commit/f0921cd30a12c960c9c7eea332cee6ee30b32123))
* **typography:** remove unused `Label` component and its export ([351ba18](https://github.com/qixing-jk/all-api-hub/commit/351ba189ffcc6246f82bb205d5ec297bbaf9bcf7))

## [1.29.0](https://github.com/qixing-jk/all-api-hub/compare/v1.28.0...v1.29.0) (2025-10-22)


### Features

* **navigation:** add popup detection and auto-close functionality ([2ce9a49](https://github.com/qixing-jk/all-api-hub/commit/2ce9a49a01548737ac646d192e0ce19f8ec714f4))
* **popup:** add mobile responsive layout to prevent zoom requirement ([91f7ffa](https://github.com/qixing-jk/all-api-hub/commit/91f7ffa77ca9248c5bfea13e902d09a5c2f5eede))

## [1.28.0](https://github.com/qixing-jk/all-api-hub/compare/v1.27.0...v1.28.0) (2025-10-21)


### Features

* **auto-detect:** improve tab detection by using active tab as fallback ([91099d6](https://github.com/qixing-jk/all-api-hub/commit/91099d612bd4c51d33d37d3e461ac1920b29a65b))
* **browser:** enhance browser API fallback with chrome preference ([ee1c1cd](https://github.com/qixing-jk/all-api-hub/commit/ee1c1cd171cfec08e08c69d919ddaf71db11f960))
* **device:** add DeviceContext for responsive device detection ([7ccc0f0](https://github.com/qixing-jk/all-api-hub/commit/7ccc0f0cb9adfce06f42636b01a40407eab4d9bd))
* **drag-drop:** enhance mobile touch support and remove unused CSS ([416be3a](https://github.com/qixing-jk/all-api-hub/commit/416be3a706cba608660ebdf0ff671542dc462bc8))
* implement cross-platform auto-detect with smart fallback logic ([94c822b](https://github.com/qixing-jk/all-api-hub/commit/94c822bcdfc6803e861edd98775fd864eaf236da))
* migrate from chrome.* to browser.* API with improved error handling ([945ed4c](https://github.com/qixing-jk/all-api-hub/commit/945ed4c1890220c13c515ca274abdb14712477e9))
* **mobile:** Ensure compatibility with mobile devices in terms of features and user interface design ([#62](https://github.com/qixing-jk/all-api-hub/issues/62)) ([f95bcd4](https://github.com/qixing-jk/all-api-hub/commit/f95bcd49c75f9762ddcef40e80ab8ebe017ff4c4))
* **mobile:** implement responsive design improvements across UI ([f702eb0](https://github.com/qixing-jk/all-api-hub/commit/f702eb01b5e734390f03b9aae07a2fa0ac1bf527))
* **mobile:** improve responsive layout for model and key components ([1aa6fad](https://github.com/qixing-jk/all-api-hub/commit/1aa6fadc86e98a9aa4ff524d18ffa36eadd6f787))
* **mobile:** improve SortingCriteriaItem mobile responsiveness ([e210c8a](https://github.com/qixing-jk/all-api-hub/commit/e210c8ab8712fffd156ed1fa618d3c635d0e76fd))
* **mobile:** improve touch device support in account management ([1484577](https://github.com/qixing-jk/all-api-hub/commit/1484577df1cb6778c725c69347e5c0d9ee8f06ff))
* restrict Firefox account warning to desktop only ([1938d2c](https://github.com/qixing-jk/all-api-hub/commit/1938d2c1293a389b138e5f7b503b8d08c1cc9506))
* **ui:** improve responsive layout for account list items ([1dfb05b](https://github.com/qixing-jk/all-api-hub/commit/1dfb05bd017cb066ff337ff593d0cfa46d6fd709))


### Bug Fixes

* **account-dialog:** ensure async handling of login tab opening ([cfe4e6a](https://github.com/qixing-jk/all-api-hub/commit/cfe4e6a31f007feb9729384639a1dac0d377590f))
* **browser:** improve error handling and type consistency in API utils ([6133ca3](https://github.com/qixing-jk/all-api-hub/commit/6133ca30a1ec7384adb85f56cd95d53b1c3c3896))
* **config:** enable minification in production builds ([78ab9ca](https://github.com/qixing-jk/all-api-hub/commit/78ab9ca230acfe0ce02b0c27a3ce9644bf0d2cc8))
* correct responsive padding regression in ThemeToggle ([9ac8481](https://github.com/qixing-jk/all-api-hub/commit/9ac8481bc7a567ef9367f684a10324db332f2c27))
* **device:** align breakpoint with Tailwind's responsive utilities ([2d44555](https://github.com/qixing-jk/all-api-hub/commit/2d4455563d1f58874d2bfcc0065546b2da1d5997))
* **eslint:** correct file pattern to exclude non-TypeScript files ([56a86c2](https://github.com/qixing-jk/all-api-hub/commit/56a86c2827a0f5ce5d6c4aa74fe774ca11ff5381))
* handle undefined userData in background service ([0e21a5d](https://github.com/qixing-jk/all-api-hub/commit/0e21a5db326213a19a1a5a3db8ea6d8e5b906c82))
* **i18n:** correct translation key path in help button label ([a5a12e0](https://github.com/qixing-jk/all-api-hub/commit/a5a12e0018d09da273cfc761f740854b7c524259))
* prevent unnecessary re-renders in UserPreferencesContext ([a6aaaa6](https://github.com/qixing-jk/all-api-hub/commit/a6aaaa6063427581237d39aa85ee0906e4111170))
* reliably resolve tabId after window creation ([64961c1](https://github.com/qixing-jk/all-api-hub/commit/64961c16879a097f99ac8841ca94c5853cafcd35))
* remove undefined union type from sendResponse parameter ([9002db9](https://github.com/qixing-jk/all-api-hub/commit/9002db9fe9ceae1e82927155cecefc1d02229da5))
* remove unnecessary dependency in account data cleanup effect ([5a2e6a3](https://github.com/qixing-jk/all-api-hub/commit/5a2e6a30d282b87cb847d5af730db6c07c081132))
* **ui:** prevent button border spin during refresh ([80da861](https://github.com/qixing-jk/all-api-hub/commit/80da861f43469405a8f590c2283046585b29f932))

## [1.27.0](https://github.com/qixing-jk/all-api-hub/compare/v1.26.0...v1.27.0) (2025-10-20)


### Features

* auto-close AccountDialog after successful auto-config to New API ([d98f9f7](https://github.com/qixing-jk/all-api-hub/commit/d98f9f7328f51300d3b7105881b5b65b85a3e15b))
* **i18n:** add error details to account update failure messages ([0bb746a](https://github.com/qixing-jk/all-api-hub/commit/0bb746aea3c4288f37a4f976de3645938a5758bd))
* **i18n:** implement dynamic locale resource loading ([6f78249](https://github.com/qixing-jk/all-api-hub/commit/6f7824904763ab1262443c06ebbdffae4a8d8f43))
* **ModelItem:** add aria attributes to expand button ([8dd34ea](https://github.com/qixing-jk/all-api-hub/commit/8dd34ea22416f162b9fc3ec281c74fa598df6db8))


### Bug Fixes

* **account:** add error handling utility import ([20adedb](https://github.com/qixing-jk/all-api-hub/commit/20adedb3da032baec6a98d8af30b4e94733adf4b))
* **account:** replace hardcoded error messages with i18n translations ([20dee02](https://github.com/qixing-jk/all-api-hub/commit/20dee025e051e63bf33bec14572fc49b074c101d))
* **account:** replace hardcoded validation messages with i18n keys ([bfce6b8](https://github.com/qixing-jk/all-api-hub/commit/bfce6b8b4c9c9c615d0cc6c8c677b72946033d97))
* add i18n internationalization to accountOperations.ts service ([27e31f6](https://github.com/qixing-jk/all-api-hub/commit/27e31f6380fe0c6d89def9b75c18dbf3d8dfbea9))
* **i18n:** add internationalization support for error messages ([3d85dd4](https://github.com/qixing-jk/all-api-hub/commit/3d85dd404368cbd9a03831474c40d6621496eeef))
* **i18n:** add missing "resetting" translation key in en and zh_CN locales ([21073e4](https://github.com/qixing-jk/all-api-hub/commit/21073e44a5294b95a8f8d0a9e4a78096ccab9f44))
* **locales:** correct currency switch template syntax for en/zh_CN ([fcb8c4b](https://github.com/qixing-jk/all-api-hub/commit/fcb8c4b59ae4d90ab5a6f5e72b790207e6f43d60))

## [1.26.0](https://github.com/qixing-jk/all-api-hub/compare/v1.25.0...v1.26.0) (2025-10-19)


### Features

* add unified service response type definitions ([d7a3bbe](https://github.com/qixing-jk/all-api-hub/commit/d7a3bbe85b7392c84bb36cc4949e8cef6eb37404))


### Bug Fixes

* **account:** add i18n support for error messages ([4be6b46](https://github.com/qixing-jk/all-api-hub/commit/4be6b46aee8a3d3d846b9b7a7864f05a5d77f151))
* **account:** update default token generation logic ([56d5b41](https://github.com/qixing-jk/all-api-hub/commit/56d5b41327fcb8210fa29a44df442f2f8092a975))
* **i18n:** replace hardcoded Chinese strings with i18n keys in newApiService ([aa51099](https://github.com/qixing-jk/all-api-hub/commit/aa51099d3274b54976993a6298f73900300eb180))
* **i18n:** replace hardcoded Chinese strings with i18n keys in newApiService and autoDetectUtils ([60b847c](https://github.com/qixing-jk/all-api-hub/commit/60b847c1219e8f34bc7a25667839ebe67924f5f9))

## [1.25.0](https://github.com/qixing-jk/all-api-hub/compare/v1.24.0...v1.25.0) (2025-10-18)


### Features

* improve WebDAV settings form accessibility ([3948a2a](https://github.com/qixing-jk/all-api-hub/commit/3948a2a73b6aa6c7c9e6fe65771700fe355ba71b))
* **model-list:** hide empty providers in model selection ([a30a1ba](https://github.com/qixing-jk/all-api-hub/commit/a30a1ba8b94ca02ccf9b660062854dd6e5555e93))


### Bug Fixes

* **i18n:** Replace hardcoded Chinese string in TokenHeader toast with translation key ([ea53487](https://github.com/qixing-jk/all-api-hub/commit/ea534873a291b6a8dfeb5e748e881604790b0d3e))
* **i18n:** Replace hardcoded Chinese strings in cherryStudio.ts with proper i18n keys ([2a88ffc](https://github.com/qixing-jk/all-api-hub/commit/2a88ffcd47ef37ffdd49c3406c08e57d2468c151))
* **i18n:** Replace hardcoded toast strings with translation keys in useImportExport hook ([89a1605](https://github.com/qixing-jk/all-api-hub/commit/89a1605cc87c1115a95d4da0d741296972fe6f03))
* **i18n:** update success and failure messages in WebDAV and AddTokenDialog components; add new translations for copy URL and exporting ([05b6b6b](https://github.com/qixing-jk/all-api-hub/commit/05b6b6bc4c51806e3345664cc22e50414a16ee23))
* incorrect i18n key in AddTokenDialog component ([37d38e1](https://github.com/qixing-jk/all-api-hub/commit/37d38e1f1c9023488340d2a0b457b61845512029))
* replace hardcoded Chinese strings with i18n translation keys in accountOperations.ts ([eef6b27](https://github.com/qixing-jk/all-api-hub/commit/eef6b27cf09bb6879c84e80e416fb7dd7599b499))
* Replace hardcoded toast strings with translation keys in WebDAVSettings.tsx ([03cf97c](https://github.com/qixing-jk/all-api-hub/commit/03cf97c533799c11dfddde7adbf8845fe1230c09))

## [1.24.0](https://github.com/qixing-jk/all-api-hub/compare/v1.23.2...v1.24.0) (2025-10-16)


### Features

* **i18n:** add health status translation keys and refactor error messages ([d3ea168](https://github.com/qixing-jk/all-api-hub/commit/d3ea168f1accc753f63701511dc34a4663a95535))
* **i18n:** add refresh partial skipped status message ([31d3d27](https://github.com/qixing-jk/all-api-hub/commit/31d3d27ad220cf1cd6df000a5c9d4c1183f10d22))
* **i18n:** add translations for site info health status and current site ([15d8bed](https://github.com/qixing-jk/all-api-hub/commit/15d8bed5d040c8493ea67b0aeae42807af97d2e0))
* **i18n:** add translations for site info health status and current site ([be14335](https://github.com/qixing-jk/all-api-hub/commit/be14335392576903852e11abc714b20a6ff0297d))
* **i18n:** implement i18n for toast messages and function return values ([b622d5e](https://github.com/qixing-jk/all-api-hub/commit/b622d5e315841c0e6cf6fea15ae1928aa7591332))
* **i18n:** integrate dayjs locale with language switching ([e40a642](https://github.com/qixing-jk/all-api-hub/commit/e40a642f6fe6c72ecbad1f527d53bd1901d39cde))

## [1.23.2](https://github.com/qixing-jk/all-api-hub/compare/v1.23.1...v1.23.2) (2025-10-16)


### Bug Fixes

* **api:** correct currency conversion logic for CNY ([daebcc0](https://github.com/qixing-jk/all-api-hub/commit/daebcc026d90cfe5c6bee8d5e4ae5406bd6a66b8))

## [1.23.1](https://github.com/qixing-jk/all-api-hub/compare/v1.23.0...v1.23.1) (2025-10-16)


### Bug Fixes

* **api:** add exchange rate support for amount extraction ([a7ce101](https://github.com/qixing-jk/all-api-hub/commit/a7ce101780bb33e07c6ad35d7f36417128d005ae))

## [1.23.0](https://github.com/qixing-jk/all-api-hub/compare/v1.22.0...v1.23.0) (2025-10-15)


### Features

* **about:** remove all features and conditionally render feature section ([e62dc49](https://github.com/qixing-jk/all-api-hub/commit/e62dc4966d0cf8e130ae81b4edd7a7cc89692487))
* **api:** improve channel naming logic and default token generation ([498a7d5](https://github.com/qixing-jk/all-api-hub/commit/498a7d5fe50c01b66260768fb55c1aa7e2436fa1))
* **i18n:** add Chinese and English localization support ([dc65dfc](https://github.com/qixing-jk/all-api-hub/commit/dc65dfc144308d1b18d1d3533c4a2751c56855d4))
* **i18n:** add comprehensive localization support for UI components ([a39f2e3](https://github.com/qixing-jk/all-api-hub/commit/a39f2e3f79e75d17b5c5bf1643a10ce4896dc0ca))
* **i18n:** add comprehensive localization support for UI components ([3963116](https://github.com/qixing-jk/all-api-hub/commit/39631162638bfa9bf1639d053cec832fc95173d3))
* **i18n:** add dynamic page title support for all entry points ([4fb4d43](https://github.com/qixing-jk/all-api-hub/commit/4fb4d43b777c08016f8a7ecb01a9fc7e6b0eb44f))
* **i18n:** add internationalization support ([d388a57](https://github.com/qixing-jk/all-api-hub/commit/d388a574bda25701e7dd38bfa59ba98d4705d8b8))
* **i18n:** add internationalization support ([17be2ef](https://github.com/qixing-jk/all-api-hub/commit/17be2ef083755b2ebef2bb013496edc6fed47346))
* **i18n:** add internationalization support ([c2d2f9b](https://github.com/qixing-jk/all-api-hub/commit/c2d2f9be4f276ac086b6e9d884533e553500d8ec))
* **i18n:** add internationalization support for account dialog and related ([e95b20a](https://github.com/qixing-jk/all-api-hub/commit/e95b20a1968a7572628e0019339f97beb7929846))
* **i18n:** add internationalization support for account management ([25c9b8e](https://github.com/qixing-jk/all-api-hub/commit/25c9b8e747fc9b084c1fcb825f685ef984981233))
* **i18n:** add internationalization support for manifest ([b8226d3](https://github.com/qixing-jk/all-api-hub/commit/b8226d3720a44ec1c8c852e6847719f255c1c6c5))
* **i18n:** add internationalization support for settings and about pages ([1488cc5](https://github.com/qixing-jk/all-api-hub/commit/1488cc5d06b8d27335c7b984f75b4c35ab1e3a2f))
* **i18n:** add language switching support with Suspense loading ([71aa893](https://github.com/qixing-jk/all-api-hub/commit/71aa893150fe5d157bad3248c1f4116dc85119a5))
* **i18n:** restructure about page tech stack section and update intro ([27537f0](https://github.com/qixing-jk/all-api-hub/commit/27537f0805aaf795103651804ab9e3d056de6908))
* improve internationalization for About page and billing modes ([33414a8](https://github.com/qixing-jk/all-api-hub/commit/33414a8c1d593bbfd54073165a876a648df04ad7))


### Bug Fixes

* **account:** ensure checkSupport fallback and remove unused param in token gen ([d99a9eb](https://github.com/qixing-jk/all-api-hub/commit/d99a9eb4404ccef46ffcaa76442dca7dfaf0a2d3))
* **account:** include today_income in AccountData and sync operations ([2b7dc8e](https://github.com/qixing-jk/all-api-hub/commit/2b7dc8e0447d4ce7c6d2620dbb62b73dd692afef))
* **api:** improve auth handling and error logging ([ee3c63a](https://github.com/qixing-jk/all-api-hub/commit/ee3c63a1b02b962c75bc67dd3ab2d46153e360cc))
* complete internationalization for remaining hardcoded text ([efe28dc](https://github.com/qixing-jk/all-api-hub/commit/efe28dc57a4e1a3b8c2944e62874d6c069a598d1))
* **config:** add empty descriptions to browser and sidebar action commands ([3a0c227](https://github.com/qixing-jk/all-api-hub/commit/3a0c2279405905b8ae5e5acd8f60f994ad7bc4ae))
* prevent success message when no accounts are refreshed ([3053d42](https://github.com/qixing-jk/all-api-hub/commit/3053d42ef04cf6617833edf37bdf3efba2d76154))
* remove unused translation params in model list components ([4b7d5b6](https://github.com/qixing-jk/all-api-hub/commit/4b7d5b6785ebda6d2e859f75b4209c0853a6d51e))
* **tooltip:** prevent horizontal overflow by limiting max width to 90vw ([37e5eae](https://github.com/qixing-jk/all-api-hub/commit/37e5eae10b3f54b10b4dabff5bdb7f70e98d7728))
* **ui:** restore incorrect style changes made during i18n process ([674cdfe](https://github.com/qixing-jk/all-api-hub/commit/674cdfeeb7c3f13191214ffb312b403f2634b280))

## [1.22.0](https://github.com/qixing-jk/all-api-hub/compare/v1.21.0...v1.22.0) (2025-10-15)


### Features

* **account:** add today_total_income field and income display UI ([f96af58](https://github.com/qixing-jk/all-api-hub/commit/f96af581b7e682deea42358da22d86a79a1a346b))
* **account:** add today's income display with animated value component ([76420f4](https://github.com/qixing-jk/all-api-hub/commit/76420f4b5ab63a15162931ad8d80a3145620247f)), closes [#50](https://github.com/qixing-jk/all-api-hub/issues/50)
* **account:** support redemption code type recharge ([93cca65](https://github.com/qixing-jk/all-api-hub/commit/93cca65c20294845d47d42903512c36ce1c35f52))
* **api:** add LogType enum and update log-related interfaces ([07828ac](https://github.com/qixing-jk/all-api-hub/commit/07828ac90af9a78e5659be24222fab35e8a548c2))
* **api:** add today income tracking and amount extraction utility ([4835a33](https://github.com/qixing-jk/all-api-hub/commit/4835a33d3f80eaaecb0d612f54d3063e20521533))
* **api:** add today income tracking and refactor type definitions ([736a5da](https://github.com/qixing-jk/all-api-hub/commit/736a5dae9199614f7a01531aee146394fea9df05))
* **api:** narrow query scope to consume logs only ([56fa0f2](https://github.com/qixing-jk/all-api-hub/commit/56fa0f243e845b4a151d5fa3eb164518b6177ce0))
* **config:** remove default keybindings and descriptions for commands ([5ab5a69](https://github.com/qixing-jk/all-api-hub/commit/5ab5a695403ce4c9727cb19837541ce80f81e253))
* **ui:** adjust AccountListItem padding and height ([86da034](https://github.com/qixing-jk/all-api-hub/commit/86da0349d854c02a5397d1e5c46f6b11d8d3d91c))
* **ui:** improve layout responsiveness and text truncation ([ac6c2d4](https://github.com/qixing-jk/all-api-hub/commit/ac6c2d4588e14d43116dfaf4fa311a43f0dd82f6))


### Bug Fixes

* **account:** correct check-in UI rendering logic for custom URLs ([9d1cd98](https://github.com/qixing-jk/all-api-hub/commit/9d1cd988432a616c61188e2deaadac63d59f214e))
* **api:** correct checkin field name and return structure ([8e4e2f3](https://github.com/qixing-jk/all-api-hub/commit/8e4e2f31abd20350c27e7c6625c91ff3b65bb40e))
* resolve spinner and currency suffix overlap in recharge ratio input ([19a92d9](https://github.com/qixing-jk/all-api-hub/commit/19a92d9f286364cfa5835f30378531d2e2b75d38))
* **tooltip:** prevent tooltip overflow by adding max-width constraint ([d1cf0b4](https://github.com/qixing-jk/all-api-hub/commit/d1cf0b42388d8cac74d7fdd8e6ddb6fb98fe0288))

## [1.21.0](https://github.com/qixing-jk/all-api-hub/compare/v1.20.0...v1.21.0) (2025-10-14)


### Features

* add favicon and extension icons to popup, options and sidepanel ([7f4f28b](https://github.com/qixing-jk/all-api-hub/commit/7f4f28b59345f70ceb2c43e39d645f8281559d93)), closes [#40](https://github.com/qixing-jk/all-api-hub/issues/40)
* **api:** replace Proxy with direct function wrapping to avoid background errors ([0d6654b](https://github.com/qixing-jk/all-api-hub/commit/0d6654bf7eb2a7147873ca404a0d4b594a9e5026))
* **config:** add keyboard shortcuts for sidebar and popup actions ([79f3817](https://github.com/qixing-jk/all-api-hub/commit/79f381763f55bdb2cc5bb0a0e3a81d9b4f626b9e)), closes [#42](https://github.com/qixing-jk/all-api-hub/issues/42)
* migrate from Plasmo to WXT framework ([9abe559](https://github.com/qixing-jk/all-api-hub/commit/9abe559d7d04492d3232b75788ea5d32109731b7))
* **ui:** update page titles for popup, options and sidepanel entrypoints ([de304e2](https://github.com/qixing-jk/all-api-hub/commit/de304e224c0fa7dc1fde8189581321ae58836c69))


### Bug Fixes

* **content:** correct script type and import path for API service ([c221e63](https://github.com/qixing-jk/all-api-hub/commit/c221e638f09d85316cf502ddc1cb974745655016))

## [1.20.0](https://github.com/qixing-jk/all-api-hub/compare/v1.19.0...v1.20.0) (2025-10-14)


### Features

* **account-mgmt:** add refresh functionality to balance and health indicators ([a2e9c59](https://github.com/qixing-jk/all-api-hub/commit/a2e9c59125a5adb70c3e444e09761dc98073862d))
* **account:** add wrapperClassName to Tooltip for consistent icon alignment ([cb414cd](https://github.com/qixing-jk/all-api-hub/commit/cb414cde087af7a929fc8e505ce603f9fb86b664))
* **account:** simplify menu item labels and adjust menu width ([66800d3](https://github.com/qixing-jk/all-api-hub/commit/66800d3fb7c766cb81660a8399a5edcd3557d5d4))
* **newApiService:** enhance channel import with model list comparison ([a1b2040](https://github.com/qixing-jk/all-api-hub/commit/a1b2040c5d4111fe3fe8e3196cbfa8da03e616ee))
* **newApiService:** update groups type and add error handling ([edd3465](https://github.com/qixing-jk/all-api-hub/commit/edd34652cc57fdde4c3524384836b188a65ada74))
* **Tooltip:** add wrapperClassName prop and reorder imports ([32ef60c](https://github.com/qixing-jk/all-api-hub/commit/32ef60c63f8caa434209306ce2735dffb8764655))
* **Tooltip:** improve Tooltip with better ID generation and element type ([c4ff71b](https://github.com/qixing-jk/all-api-hub/commit/c4ff71bb2f79a9d77b261885fbadccfa21ff1932))
* **ui:** refactor action buttons with unified UI and smart key handling ([83df337](https://github.com/qixing-jk/all-api-hub/commit/83df337029aa233729720a4b40028478322b87a7)), closes [#44](https://github.com/qixing-jk/all-api-hub/issues/44) [#45](https://github.com/qixing-jk/all-api-hub/issues/45)

## [1.19.0](https://github.com/qixing-jk/all-api-hub/compare/v1.18.0...v1.19.0) (2025-10-13)


### Features

* add dark mode support to all components ([5e88dfd](https://github.com/qixing-jk/all-api-hub/commit/5e88dfd1a39c8a3ae7f0136a068f3dc5fab26c55))
* add theme toggle components for display settings ([393e8a6](https://github.com/qixing-jk/all-api-hub/commit/393e8a6116ce78d0fd7fc60e01a2c1fbfdbaa11e))
* **api:** enhance API proxy with type safety and external hints ([e44a131](https://github.com/qixing-jk/all-api-hub/commit/e44a131a0327da5d66b068cfe933eb18b4669794))
* implement theme system with dark/light/system mode support ([32efede](https://github.com/qixing-jk/all-api-hub/commit/32efedec9eb8bff58c568cea48fbfd86a8ad449f))
* **manifest:** add sidebar action configuration ([b925d05](https://github.com/qixing-jk/all-api-hub/commit/b925d05b2b23555296a946435393951e66faa269))
* optimize token data loading with useCallback ([17dbb91](https://github.com/qixing-jk/all-api-hub/commit/17dbb911e68b4c43fe010cc3ae0390ca0809154e))
* **styles:** add dark mode support and extended color palette ([c08f0ec](https://github.com/qixing-jk/all-api-hub/commit/c08f0eca0dfd8a9072d5cef4f9938223cb546237))
* **theme:** enhance theme toggle components with descriptions & UI polish ([698cd94](https://github.com/qixing-jk/all-api-hub/commit/698cd94bbf5c28f14bba189b237d1bf784898a90))
* **toast:** introduce theme-aware toaster component ([44966e5](https://github.com/qixing-jk/all-api-hub/commit/44966e5607e8e48a577b80479da05d905051598f))
* **types:** enforce required `authType` in API config interface ([c60b47e](https://github.com/qixing-jk/all-api-hub/commit/c60b47eae130a6e32ae63290aa8f74c0fa4bf246))

## [1.18.0](https://github.com/qixing-jk/all-api-hub/compare/v1.17.0...v1.18.0) (2025-10-13)


### Features

* **account:** add custom check-in button with Yen icon ([538b784](https://github.com/qixing-jk/all-api-hub/commit/538b784d7e38ce4d3e6cc5f47a960cb47d4c481d))
* **account:** replace boolean check-in flag with comprehensive CheckInConfig ([a007916](https://github.com/qixing-jk/all-api-hub/commit/a007916c2dd2202391a6288adb9ec82b7f954716))
* **config:** implement versioned configuration migration system ([01ec27f](https://github.com/qixing-jk/all-api-hub/commit/01ec27fdae6480e05a18cf6cd32e4fad87168819))
* implement refresh mechanism via URL hash parameter ([a816312](https://github.com/qixing-jk/all-api-hub/commit/a816312dcb7bb1bc0b386a555e9f421fc30a8bc3))
* **navigation:** implement reusable Chrome API wrapper functions ([2ccdda5](https://github.com/qixing-jk/all-api-hub/commit/2ccdda5169bf838c9d0d28bbf8950e05bceb7ba8)), closes [#43](https://github.com/qixing-jk/all-api-hub/issues/43)
* **sorting:** add custom check-in URL sorting criteria ([6c3a113](https://github.com/qixing-jk/all-api-hub/commit/6c3a113845c46e7940843c492e17c8960be3621b))
* **tooltip:** center children content in container ([d299bbc](https://github.com/qixing-jk/all-api-hub/commit/d299bbc0114c2e4bbbbcc1065e0b9258b304c04d))
* **ui:** standardize dialog width using max-w-md class ([10f7f45](https://github.com/qixing-jk/all-api-hub/commit/10f7f451b647b8553850eecee19be7e40faf9ca3))


### Bug Fixes

* **account:** correct check-in detection logic and default state ([8e5a960](https://github.com/qixing-jk/all-api-hub/commit/8e5a960b5fb1938f4376da47351a576fedb2709e))
* **account:** pass custom check-in URL to openCheckInPage handler ([039f114](https://github.com/qixing-jk/all-api-hub/commit/039f114cd3e489f087950288bd3604bebf628d38)), closes [#46](https://github.com/qixing-jk/all-api-hub/issues/46)
* **Tooltip:** ensure tooltip visibility by adding high z-index default ([0489f08](https://github.com/qixing-jk/all-api-hub/commit/0489f0808e8e0fa3e21249e782c4eae4593d9193))

## [1.17.0](https://github.com/qixing-jk/all-api-hub/compare/v1.16.0...v1.17.0) (2025-10-12)


### Features

* **account:** add authentication type selection support ([09d26fe](https://github.com/qixing-jk/all-api-hub/commit/09d26feabb23ad9553ac20e515a6c55d7b043fef))
* **account:** add conditional rendering for access token field based on auth type ([b4e54d6](https://github.com/qixing-jk/all-api-hub/commit/b4e54d644b4c29ade07980650c294cf53a7abb71))
* **account:** rename UrlInput to SiteInfoInput and improve auth type labeling ([453783d](https://github.com/qixing-jk/all-api-hub/commit/453783d26f999e69fbb6be854bbebe7ddc7efcb1))
* **api:** add generic fetchApi utility and update channel creation ([b00fb0d](https://github.com/qixing-jk/all-api-hub/commit/b00fb0d7519e37d2eea9de85c1de7c89fec5aa0b))
* **api:** add support for 'none' auth type and refactor auth options ([43561b4](https://github.com/qixing-jk/all-api-hub/commit/43561b4067bb49c7fe6fa81a848103f88794ad2c))
* **api:** modify all API calls to accept optional authType parameter ([cf568b8](https://github.com/qixing-jk/all-api-hub/commit/cf568b8df813acfa3c3494cb5fafa3365cd304b9))
* **siteType:** add UNKNOWN_SITE constant and rule ([1324203](https://github.com/qixing-jk/all-api-hub/commit/1324203ed5191c24adce3b82b3a404f4fff36980))
* **tooltip:** migrate to react-tooltip library to resolve overflow issues ([447a52b](https://github.com/qixing-jk/all-api-hub/commit/447a52b94c98d1306ab7d3b7841024d1a48531f3))
* **ui:** add popup dimension constants and refactor tooltip positioning ([92fd6d2](https://github.com/qixing-jk/all-api-hub/commit/92fd6d2dcf4525b21da32454c932a55f690ef45c))


### Bug Fixes

* **siteType:** correct default usage path from /log to /console/log ([5f32eda](https://github.com/qixing-jk/all-api-hub/commit/5f32eda87bf9a8e2cbc3884dba5d737d73f6581d))

## [1.16.0](https://github.com/qixing-jk/all-api-hub/compare/v1.15.0...v1.16.0) (2025-10-12)


### Features

* **account:** add auto-configuration to New API feature ([c5da075](https://github.com/qixing-jk/all-api-hub/commit/c5da0757aecf311814999f3be7ad6de07d2a1083))
* **account:** add check-in functionality for site accounts ([76c5b59](https://github.com/qixing-jk/all-api-hub/commit/76c5b596286bbc916bc5fc10c8852f6fa033c6f1))
* **account:** add check-in priority to account sorting logic ([3dd6615](https://github.com/qixing-jk/all-api-hub/commit/3dd6615330b8569ec020db048e50748576c4bba4))
* **account:** support single account conversion in convertToDisplayData ([ce5638e](https://github.com/qixing-jk/all-api-hub/commit/ce5638ea9e1bda2121dc5ca4952120e3bc43ff57))
* **deps:** add [@dnd-kit](https://github.com/dnd-kit) packages for drag-and-drop functionality ([5489fe7](https://github.com/qixing-jk/all-api-hub/commit/5489fe733166d8630c981f11753a8493445def9e))
* **sorting:** implement customizable sorting priority system ([40e0884](https://github.com/qixing-jk/all-api-hub/commit/40e0884b2e78401f60082c68501467952488e6e2))
* **ui:** standardize dialog width using container class ([8d6a777](https://github.com/qixing-jk/all-api-hub/commit/8d6a777f0b32ae977c71c3bec8d5725abfe0d721))
* **ui:** update auto-config text to specify New API target ([4286f70](https://github.com/qixing-jk/all-api-hub/commit/4286f70b22e220b56c10ce8e2519f952b0498851))

## [1.15.0](https://github.com/qixing-jk/all-api-hub/compare/v1.14.0...v1.15.0) (2025-10-11)


### Features

* **account:** centralize toaster in AccountManagementProvider ([c61ed38](https://github.com/qixing-jk/all-api-hub/commit/c61ed38a85c311f876e255287ae1620ccd4dec5a))
* **ui:** wrap token form in container with vertical spacing ([9434f1f](https://github.com/qixing-jk/all-api-hub/commit/9434f1fae093735b67e1adc36ddfdfd75b405fdf))


### Bug Fixes

* **ui:** prevent unnecessary updates and notifications when values remain unchanged ([9328a9f](https://github.com/qixing-jk/all-api-hub/commit/9328a9f022143e478ef1d05d67b68d077adc587d))

## [1.14.0](https://github.com/qixing-jk/all-api-hub/compare/v1.13.0...v1.14.0) (2025-10-11)


### Features

* **account:** add tab activation & update listeners for auto-check ([e829502](https://github.com/qixing-jk/all-api-hub/commit/e829502b4f9d1b7cdd39e3d330ad594341c29841))
* **ui:** add text alignment and overflow handling ([f79ec94](https://github.com/qixing-jk/all-api-hub/commit/f79ec943f9adbbc00944603464bf9ca82e41d548))

## [1.13.0](https://github.com/qixing-jk/all-api-hub/compare/v1.12.1...v1.13.0) (2025-10-09)


### Features

* **api:** add createBaseRequest utility and enhance auth request creators ([0d391ff](https://github.com/qixing-jk/all-api-hub/commit/0d391ff45c2006e5a26d52fcf1beff4c8ac0dc99))
* **api:** add New API integration for token import ([860cea1](https://github.com/qixing-jk/all-api-hub/commit/860cea1b91ef6512b2b2c714fd607424195b8128))
* **api:** add upstream models fallback for new API service ([ebc9537](https://github.com/qixing-jk/all-api-hub/commit/ebc95370061d573986bd7edf0d6484646ac2cd82))
* **api:** add upstream models fetching functionality ([78fe703](https://github.com/qixing-jk/all-api-hub/commit/78fe703d1472a34847bf7c39dc7c554148511bbb))
* **api:** enhance error handling with response message ([36d7810](https://github.com/qixing-jk/all-api-hub/commit/36d7810a0b89bf34a1b116d7cea45f3993c76883))
* **api:** implement controlled form inputs with local state to prevent frequently saving input values ([98411df](https://github.com/qixing-jk/all-api-hub/commit/98411dfe88932e69aa6ec9d02dc92a483f80a91f))
* **api:** make userId optional with null default in auth requests ([02d81d9](https://github.com/qixing-jk/all-api-hub/commit/02d81d96d8c635705e84d0fabcb3a73deddfc434))
* **api:** support more account types in fetchAvailableModels ([8f30aaa](https://github.com/qixing-jk/all-api-hub/commit/8f30aaa5ae4c7b049b34936a6c08861e1299c58a))
* **NewApiSettings:** add toggle visibility for admin token input ([7a323d4](https://github.com/qixing-jk/all-api-hub/commit/7a323d47fdf5542075d521d3263d91f3b882ec50))
* **preferences:** add New API integration settings ([4471b60](https://github.com/qixing-jk/all-api-hub/commit/4471b6032e6db980d2cd4a462af1033c442b1605))
* **ui:** add password visibility toggle functionality ([122ea23](https://github.com/qixing-jk/all-api-hub/commit/122ea234622ba1dc9533671df2c997afec4f808a))
* **ui:** restructure token list item layout for better usability ([3ff3c6e](https://github.com/qixing-jk/all-api-hub/commit/3ff3c6e58fe49a32f6a8cf4fd1f3b30898a6cec1))
* **ui:** restructure token list item layout for better usability ([f2377bc](https://github.com/qixing-jk/all-api-hub/commit/f2377bc289981366a00def095fdaf52e43368015))

## [1.12.1](https://github.com/qixing-jk/all-api-hub/compare/v1.12.0...v1.12.1) (2025-10-09)


### Bug Fixes

* **preferences:** move default sort values to UserPreferencesContext ([00ba755](https://github.com/qixing-jk/all-api-hub/commit/00ba75557abef6988f5d1b95ce050d74100ed438))
* prevent rendering while preferences are loading ([a8ae1b0](https://github.com/qixing-jk/all-api-hub/commit/a8ae1b0c3dbad7a1d6f34b4690fff88ff75db26b))


### Performance Improvements

* **AccountDataContext:** remove redundant preferences loading check ([c362111](https://github.com/qixing-jk/all-api-hub/commit/c362111e6f432de90c16534076f5325f8b012b59))

## [1.12.0](https://github.com/qixing-jk/all-api-hub/compare/v1.11.0...v1.12.0) (2025-10-08)


### Features

* **account:** add health status priority to account sorting ([01a156c](https://github.com/qixing-jk/all-api-hub/commit/01a156cdeac6370a7cb295644bbe9278ab27900f))
* **account:** refactor health status to object with reason details ([e01232b](https://github.com/qixing-jk/all-api-hub/commit/e01232bde3b0bea77a597221e223f541380a393f))


### Bug Fixes

* **account:** move tooltip position to right for better visibility ([57934fe](https://github.com/qixing-jk/all-api-hub/commit/57934fe8012a3521b01e31c70110449b79a4a041))
* **account:** replace `health_status` with nested `health.status` object ([4efc8e0](https://github.com/qixing-jk/all-api-hub/commit/4efc8e047556afd954f4f569c360f0e02ca6d2dd))
* **changelog:** reorganize and complete changelog structure ([b1f0ebd](https://github.com/qixing-jk/all-api-hub/commit/b1f0ebdda24126bb57b38466015b78009b86d61e))

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
