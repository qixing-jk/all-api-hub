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
  regression target for existing-file `MOVE` compatibility.

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

Run the shared WebDAV provider flow locally:

```bash
pnpm e2e:real-site:nutstore
pnpm e2e:real-site:webdav
```

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
The spec deletes this exact file before and after the run. The local WebDAV
runner selects these variables by default.

```env
AAH_E2E_NUTSTORE_WEBDAV_URL=https://dav.jianguoyun.com/dav/all-api-hub-e2e/all-api-hub-nutstore-move.json
AAH_E2E_NUTSTORE_WEBDAV_USERNAME=test-user@example.com
AAH_E2E_NUTSTORE_WEBDAV_PASSWORD=replace-with-nutstore-app-password
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
pnpm e2e:real-site:webdav CUSTOM_WEBDAV
```
