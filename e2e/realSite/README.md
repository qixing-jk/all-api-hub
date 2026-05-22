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
