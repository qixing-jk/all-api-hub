# Real-Site E2E

These Playwright specs exercise account auto-detection against live deployments
of supported, source-available, self-hostable upstreams. The specs are intended
to cover representative real-site account flows where the upstream surface makes
that practical, without documenting every shared test step in this README.
A site type should only be added here after inspecting the upstream repository
and confirming it contains server source code plus a runnable deployment path,
not merely a public GitHub link.

Confirmed source-available targets in this suite:

- New API: Go server source, web source, Docker/deployment files.
- OneHub: Go server source, web source, Docker/deployment files.
- DoneHub: Go server source, web source, Docker/deployment files.
- Veloera: Go server source, web source, Docker/deployment files.
- Sub2API: dedicated auth model and real-site helper.

Provider compatibility checks:

- WebDAV providers: verify the live provider's UI-driven save, connection
  test, upload overwrite, and download/import flow. Nutstore is included as a
  regression target for existing-file `MOVE` compatibility and non-ASCII
  `Destination` header paths. CTFile is included as a regression target for
  providers that reject hidden temporary upload names.

For current coverage details, inspect the specs in this directory and the shared
helpers under `e2e/scenarios/`.

Account auto-detection and existing-account feature checks are separate
scenario helpers. Real-site specs compose them by saving an account from a live
site, passing the returned account fixture into reusable usage scenarios, then
cleaning up through the fixture owner.

Run all real-site specs:

```bash
pnpm e2e:real-site
```

Run one real-site category locally:

```bash
pnpm e2e:real-site:account
pnpm e2e:real-site:managed-site
pnpm e2e:real-site:webdav
```

Run one shared WebDAV provider flow locally:

```bash
pnpm e2e:real-site:nutstore
pnpm e2e:real-site:ctfile
pnpm e2e:real-site:webdav-provider
```

`pnpm e2e:real-site:webdav` runs every WebDAV real-site matrix entry.
`pnpm e2e:real-site:webdav-provider` keeps the provider-focused behavior and
defaults to Nutstore unless a provider prefix is passed.
Category scripts run each matching matrix entry separately and reuse the first
extension build for the remaining entries.

The GitHub Actions workflow has a `category` input with `all`, `account`,
`managed-site`, and `webdav`. Scheduled runs still use `all`; manual runs can
select a single category so the CI job list and artifacts are visibly grouped as
`Account / ...`, `Managed Site / ...`, or `WebDAV / ...`.

Playwright loads `.env` and `.env.local` from the repo root. Shell or CI
environment variables take precedence. Each block is optional; specs skip when
that site's required variables are missing. Use dedicated low-privilege test
accounts.

## New API

```env
AAH_E2E_NEW_API_BASE_URL=https://new-api.example.com
AAH_E2E_NEW_API_USERNAME=test-user
AAH_E2E_NEW_API_PASSWORD=replace-with-test-password
# AAH_E2E_NEW_API_TOTP_SECRET=replace-with-base32-secret
# AAH_E2E_NEW_API_LOGIN_PATH=/login
# AAH_E2E_NEW_API_LOGIN_API_PATH=/api/user/login
# AAH_E2E_NEW_API_LOGIN_2FA_API_PATH=/api/user/login/2fa
# AAH_E2E_NEW_API_USERNAME_SELECTOR=input[name="username"]
# AAH_E2E_NEW_API_PASSWORD_SELECTOR=input[type="password"]
# AAH_E2E_NEW_API_SUBMIT_SELECTOR=button[type="submit"]
# AAH_E2E_NEW_API_AGREE_SELECTOR=input[type="checkbox"]
```

The managed-site channel E2E uses the same New API deployment for account-backed
status checks and also needs managed-site admin credentials. It creates
temporary channels and keys with an `AAH E2E ...` prefix, deletes stale matching
channels before each run, and deletes created channels/keys after each run. It
intentionally does not run model-list sync.

```env
AAH_E2E_NEW_API_ADMIN_TOKEN=replace-with-admin-access-token
AAH_E2E_NEW_API_ADMIN_USER_ID=1
```

## OneHub

```env
AAH_E2E_ONE_HUB_BASE_URL=https://one-hub.example.com
AAH_E2E_ONE_HUB_USERNAME=test-user
AAH_E2E_ONE_HUB_PASSWORD=replace-with-test-password
# AAH_E2E_ONE_HUB_TOTP_SECRET=replace-with-base32-secret
# AAH_E2E_ONE_HUB_LOGIN_PATH=/login
# AAH_E2E_ONE_HUB_LOGIN_API_PATH=/api/user/login
# AAH_E2E_ONE_HUB_LOGIN_2FA_API_PATH=/api/user/login/2fa
# AAH_E2E_ONE_HUB_USERNAME_SELECTOR=input[name="username"]
# AAH_E2E_ONE_HUB_PASSWORD_SELECTOR=input[type="password"]
# AAH_E2E_ONE_HUB_SUBMIT_SELECTOR=button[type="submit"]
# AAH_E2E_ONE_HUB_AGREE_SELECTOR=input[type="checkbox"]
```

## DoneHub

```env
AAH_E2E_DONE_HUB_BASE_URL=https://done-hub.example.com
AAH_E2E_DONE_HUB_USERNAME=test-user
AAH_E2E_DONE_HUB_PASSWORD=replace-with-test-password
# AAH_E2E_DONE_HUB_TOTP_SECRET=replace-with-base32-secret
# AAH_E2E_DONE_HUB_LOGIN_PATH=/login
# AAH_E2E_DONE_HUB_LOGIN_API_PATH=/api/user/login
# AAH_E2E_DONE_HUB_LOGIN_2FA_API_PATH=/api/user/login/2fa
# AAH_E2E_DONE_HUB_USERNAME_SELECTOR=input[name="username"]
# AAH_E2E_DONE_HUB_PASSWORD_SELECTOR=input[type="password"]
# AAH_E2E_DONE_HUB_SUBMIT_SELECTOR=button[type="submit"]
# AAH_E2E_DONE_HUB_AGREE_SELECTOR=input[type="checkbox"]
AAH_E2E_DONE_HUB_ADMIN_TOKEN=replace-with-admin-access-token
AAH_E2E_DONE_HUB_ADMIN_USER_ID=1
```

## Veloera

```env
AAH_E2E_VELOERA_BASE_URL=https://veloera.example.com
AAH_E2E_VELOERA_USERNAME=test-user
AAH_E2E_VELOERA_PASSWORD=replace-with-test-password
# AAH_E2E_VELOERA_TOTP_SECRET=replace-with-base32-secret
# AAH_E2E_VELOERA_LOGIN_PATH=/login
# AAH_E2E_VELOERA_LOGIN_API_PATH=/api/user/login
# AAH_E2E_VELOERA_LOGIN_2FA_API_PATH=/api/user/login/2fa
# AAH_E2E_VELOERA_USERNAME_SELECTOR=input[name="username"]
# AAH_E2E_VELOERA_PASSWORD_SELECTOR=input[type="password"]
# AAH_E2E_VELOERA_SUBMIT_SELECTOR=button[type="submit"]
# AAH_E2E_VELOERA_AGREE_SELECTOR=input[type="checkbox"]
AAH_E2E_VELOERA_ADMIN_TOKEN=replace-with-admin-access-token
AAH_E2E_VELOERA_ADMIN_USER_ID=1
```

Veloera channel CRUD/search is covered by the managed-site channel E2E. Key
channel-status assertions are skipped for Veloera because the product currently
does not support base-URL channel lookup for that managed-site type.

## Managed-Site Channel Matrix

The shared managed-site channel spec can be scoped to one target with
`AAH_E2E_MANAGED_SITE_TARGET`. CI runs it once per managed site so targets can
execute independently and in parallel.

```bash
AAH_E2E_MANAGED_SITE_TARGET=new-api pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --project=chromium
AAH_E2E_MANAGED_SITE_TARGET=done-hub pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --project=chromium
```

Managed-only site types use a New API source account for key channel-status
checks when New API account env is available. Without that source account, the
spec still covers channel CRUD/search for the managed target and annotates the
status check as skipped.

```env
AAH_E2E_OCTOPUS_BASE_URL=https://octopus.example.com
AAH_E2E_OCTOPUS_USERNAME=test-admin
AAH_E2E_OCTOPUS_PASSWORD=replace-with-test-password

AAH_E2E_AXON_HUB_BASE_URL=https://axonhub.example.com
AAH_E2E_AXON_HUB_EMAIL=admin@example.com
AAH_E2E_AXON_HUB_PASSWORD=replace-with-test-password

AAH_E2E_CLAUDE_CODE_HUB_BASE_URL=https://claude-code-hub.example.com
AAH_E2E_CLAUDE_CODE_HUB_ADMIN_TOKEN=replace-with-admin-token
```

## Sub2API

```env
AAH_E2E_SUB2API_BASE_URL=https://sub2api.example.com
AAH_E2E_SUB2API_USERNAME=test-user@example.com
AAH_E2E_SUB2API_PASSWORD=replace-with-test-password
# AAH_E2E_SUB2API_LOGIN_PATH=/login
# AAH_E2E_SUB2API_LOGIN_API_PATH=/api/v1/auth/login
# AAH_E2E_SUB2API_USERNAME_SELECTOR=input#email
# AAH_E2E_SUB2API_PASSWORD_SELECTOR=input#password
# AAH_E2E_SUB2API_SUBMIT_SELECTOR=form button[type="submit"]
# AAH_E2E_SUB2API_AGREE_SELECTOR=input[type="checkbox"]
```

## Nutstore WebDAV

Use a dedicated low-value Nutstore app password and a test-only JSON file URL.
Keep the test file under a clearly named non-ASCII child directory, such as
`all-api-hub-e2e/中文目录测试`, so the live run also covers percent-encoded WebDAV
`MOVE` `Destination` headers while reusing the existing test root collection.
The spec deletes this exact file before and after the run. The local WebDAV
runner selects these variables by default.

```env
AAH_E2E_NUTSTORE_WEBDAV_URL=https://dav.jianguoyun.com/dav/all-api-hub-e2e/中文目录测试/all-api-hub-nutstore-move.json
AAH_E2E_NUTSTORE_WEBDAV_USERNAME=test-user@example.com
AAH_E2E_NUTSTORE_WEBDAV_PASSWORD=replace-with-nutstore-app-password
```

## CTFile WebDAV

Use a dedicated low-value CTFile test file URL. The shared provider flow uploads
through the extension UI, overwrites the same JSON file, imports it back, and
deletes the exact test file before and after the run. This provider covers
WebDAV servers that reject hidden `PUT` target names.

```env
AAH_E2E_CTFILE_WEBDAV_URL=https://dav.ctfile.com/test-space/all-api-hub-e2e/all-api-hub-ctfile.json
AAH_E2E_CTFILE_WEBDAV_USERNAME=test-user
AAH_E2E_CTFILE_WEBDAV_PASSWORD=replace-with-ctfile-password
```

## Additional WebDAV Providers

The shared WebDAV provider spec is UI-driven and can run against another real
WebDAV backend by setting the generic variables directly:

```env
AAH_E2E_WEBDAV_PROVIDER_NAME=Nextcloud
AAH_E2E_WEBDAV_ACCOUNT_PREFIX=nextcloud
AAH_E2E_WEBDAV_URL=https://nextcloud.example.com/remote.php/dav/files/test-user/all-api-hub-e2e.json
AAH_E2E_WEBDAV_USERNAME=test-user
AAH_E2E_WEBDAV_PASSWORD=replace-with-test-password
```

CI can also add a matrix entry with a provider-specific prefix such as
`CUSTOM_WEBDAV`, then provide `AAH_E2E_CUSTOM_WEBDAV_URL`,
`AAH_E2E_CUSTOM_WEBDAV_USERNAME`, and `AAH_E2E_CUSTOM_WEBDAV_PASSWORD`.

For local provider-prefixed variables beyond Nutstore, pass the prefix to the
runner only after that provider has real test credentials:

```bash
pnpm e2e:real-site:webdav-provider CUSTOM_WEBDAV
```
