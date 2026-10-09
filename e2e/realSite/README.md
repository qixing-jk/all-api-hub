# Real-Site E2E

These Playwright specs exercise account auto-detection against live deployments of supported, source-available, self-hostable upstreams. The specs are intended to cover representative real-site account flows where the upstream surface makes that practical, without documenting every shared test step in this README. A site type should only be added here after inspecting the upstream repository and confirming it contains server source code plus a runnable deployment path, not merely a public GitHub link.

Confirmed source-available targets in this suite:

- New API: Go server source, web source, Docker/deployment files.
- OneHub: Go server source, web source, Docker/deployment files.
- DoneHub: Go server source, web source, Docker/deployment files.
- Veloera: Go server source, web source, Docker/deployment files.
- Sub2API: dedicated auth model and real-site helper.
- gpt-load: Go control plane, embedded web UI, runnable source build and Docker deployment.
- Magpie: Go CLI, embedded management web server and provider management APIs.

Provider compatibility checks:

- WebDAV providers: verify the live provider's UI-driven save, connection test, upload overwrite, and download/import flow. Nutstore is included as a regression target for existing-file `MOVE` compatibility and non-ASCII `Destination` header paths. CTFile is included as a regression target for providers that reject hidden temporary upload names. OpenCloud is included as a live compatibility target for asynchronous upload post-processing; the deterministic `425 Too Early` retry contract is covered by the WebDAV service tests rather than by replacing a live provider response.

For current coverage details, inspect the specs in this directory and the shared helpers under `e2e/scenarios/`.

Account auto-detection and existing-account feature checks are separate scenario helpers. Real-site specs compose them by saving an account from a live site, passing the returned account fixture into reusable usage scenarios, then cleaning up through the fixture owner.

Managed-gateway import tests use the credential library directly. Configure one reusable OpenAI-compatible inference source in the primary worktree's `.env.local`:

```env
AAH_E2E_UPSTREAM_BASE_URL=https://inference.example.com/v1
AAH_E2E_UPSTREAM_API_KEY=replace-with-inference-api-key
```

The URL preserves any reverse-proxy prefix. Both the extension and gateway backend must be able to reach it for backend model discovery; Magpie model sync requires at least one visible model. These are inference credentials, separate from each target gateway's management credentials. A New API or Sub2API source account, source login, and token creation are unnecessary. Missing source values skip only the real credential import/model tests, not management CRUD. Duplicate checks respect the target's capabilities: masked keys or differing model sets can produce a review/verification warning instead of a confirmed duplicate.

CI runs targets in a single parallel matrix. The local managed-site category uses one Playwright process and its bounded worker pool (four workers by default, overridable with `--workers` or `AAH_E2E_WORKERS`), building the extension once. Each test uses its own browser profile and cleans only its own resource names/IDs. Account detection/login/token lifecycle tests still use their own account credentials and retain their account-specific scheduling.

Managed-site coverage includes New API, AxonHub, and Octopus multi-key persistence in `managedSiteChannels.spec.ts`, so the existing managed-site matrix runs it. The tests create a uniquely named temporary channel with nonfunctional keys and an `.invalid` upstream, edit keys through the UI, reopen and inspect native responses, verify preserved metadata and Octopus model grants, then delete the run-owned channel and query again to confirm cleanup. Cleanup errors remain test failures. A deployment exposing Octopus's single-key protocol is explicitly skipped before creating a channel. Authenticated screenshots, traces, and videos are disabled; assertions do not print native credentials. The New API multi-key scenario verifies append-before-delete replacement without reading saved keys, including selection mode, per-key status, unchanged channel fields, and cleanup. Its additional secret-disclosure and in-place editing checks require `AAH_E2E_NEW_API_ADMIN_USERNAME`, `AAH_E2E_NEW_API_ADMIN_PASSWORD`, and `AAH_E2E_NEW_API_ADMIN_TOTP_SECRET` for its secure key-read verification. These must belong to `AAH_E2E_NEW_API_ADMIN_USER_ID`; ordinary account-test login credentials are not reused. When those login credentials are absent, native save/readback still runs and the untested disclosure checks are recorded in a `disclosure-not-tested` annotation.

Run only these persistence checks with the existing `.env.local` configuration:

```bash
pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --grep "persists multi-key" --workers=1
```

Run all real-site specs:

```bash
pnpm e2e:real-site
```

## gpt-load managed gateway

The managed-site matrix includes `gpt-load-managed-site`, using `gptLoadGroups.spec.ts` and the shared extension fixture. It requires the root management key, not a downstream access key:

```env
AAH_E2E_GPT_LOAD_BASE_URL=http://127.0.0.1:3001
AAH_E2E_GPT_LOAD_MANAGEMENT_KEY=replace-with-AUTH_KEY
```

The spec creates a uniquely named group through the extension with two nonfunctional keys and an `.invalid` upstream. It verifies native settings, credential IDs and models, renames the group and appends a key through the UI, checks preservation, then deletes through the UI and verifies cleanup. On failure, native cleanup deletes only that run's assigned group ID (or exact unique name after a lost create response). Authenticated traces, videos and screenshots stay disabled. This tests the management contract, not inference. The target is independent of account-test credentials.

For a repeatable disposable backend, use the server source revision verified with this suite: `tbphp/gpt-load@82115ac676216bdcafde921e610cc03ce67118ad` (reports `2.0.0-dev`). Use the Go toolchain declared in its `go.mod`; this revision includes the embedded management UI and can run without Docker:

```bash
git clone https://github.com/tbphp/gpt-load.git gpt-load-e2e
cd gpt-load-e2e
git checkout 82115ac676216bdcafde921e610cc03ce67118ad
go build -o gpt-load-e2e .
PORT=3001 DATA_DIR=./e2e-data AUTH_KEY=disposable-test-admin ./gpt-load-e2e
# In another terminal: curl http://127.0.0.1:3001/health
```

Use a free port and a new data directory; do not reuse an operator's database. Set the two test variables to this instance, then run from all-api-hub:

```bash
AAH_E2E_REAL_SITE_CATEGORY=managed-site AAH_E2E_MANAGED_SITE_TARGET=gpt-load pnpm exec playwright test e2e/realSite/gptLoadGroups.spec.ts --project=chromium --workers=1
```

`pnpm e2e:real-site:managed-site` also includes this target. CI uses the same matrix and `AAH_E2E_GPT_LOAD_BASE_URL` / `AAH_E2E_GPT_LOAD_MANAGEMENT_KEY` secrets; it reports missing configuration explicitly. After a local run, stop only the disposable process you started and remove its run-owned `e2e-data` directory if no longer needed. The spec itself verifies group cleanup. Hosted forks still need deployment-specific checks. The dedicated `pnpm e2e:cdp:gpt-load` runner separately tests the live development browser.

## Magpie managed gateway

`magpie-managed-site` runs `magpieProviders.spec.ts`. The four scenarios share their UI and native-readback implementation with `pnpm e2e:cdp:magpie` under `scripts/suites/magpie/`. Required deployment configuration:

```env
AAH_E2E_MAGPIE_BASE_URL=http://127.0.0.1:3430
AAH_E2E_MAGPIE_WEB_KEY=replace-with-MAGPIE_WEB_KEY
```

For an existing VPS deployment, put the first two values in the primary worktree's `.env.local` (or this checkout's `.env.local`); the commented template is in [`.env.example`](../../.env.example). Use the externally reachable web management URL, including any reverse-proxy prefix; do not append API/inference paths or the `?k=...` login query. Copy the Web key from the server's `MAGPIE_WEB_KEY` or the `k` parameter of its management login link. When the server generates the key at startup, update this value after a restart; a configured fixed key avoids that change. Existing VPS deployments do not need `AAH_E2E_MAGPIE_BINARY` or the disposable-backend wrapper.

Model sync uses the shared `AAH_E2E_UPSTREAM_BASE_URL` and `AAH_E2E_UPSTREAM_API_KEY` above. A VPS needs no extra fixture service: use an existing inference API. Without these values, management and all four protocol import projection checks still run; only real model sync is skipped. A gateway running directly on this machine can use an automatically started authenticated local model-list fixture. The disposable-backend wrapper always uses that fixture.

Use the management web address and its Web key. The inference address (normally port 3425) and provider API keys cannot authenticate management. Reverse-proxy prefixes in the management URL are preserved. Native preflight uses a separate Cookie jar, so it cannot accidentally authenticate the extension before the UI connection test. Real management responses are never mocked.

Coverage:

- Web key validation, rejection with an already valid Cookie, and recovery.
- UI create/read/edit/delete; independent Chat, Responses, Anthropic and Gemini URLs and saved API type; model and balance lookup settings, concurrency, RPM, price multiplier, explicit clearing, and preservation of concurrent native settings.
- Multi-key bulk paste/deduplication, per-key names/protocols/weights/status, routing, primary reveal/replacement/promotion, masked-only extra keys, cancellation, all-disabled rejection and preservation of concurrently added keys. Desktop and narrow layouts check overflow and API-type label wrapping.
- Credential-library UI creation and import projection for all four protocols with synthetic keys and proxy URLs, exact duplicate warning/cancel, and credential deletion. These checks do not claim callable inference for all protocols.
- Real OpenAI-compatible credential import and single-channel background model sync. The test observes the backend's actual model-list response and checks the saved model set through independent native readback; it assumes no fixed model names. The local fallback fixture returns two deterministic model IDs and serves no inference.

Each run owns UUID names and observed IDs. Cleanup recovers a lost create response by exact name, never deletes baseline IDs or another run's resources, and fails the test if deletion/readback fails. CDP restores only its preference fields, credential records, model-sync history, language and management Cookies, retaining unrelated changes. It closes only its own page and detaches from the browser. Use an idle, dedicated test deployment/profile: changing the selected managed gateway and native enable/delete operations can affect active client selections. Automatic screenshots, traces and videos are disabled. Explicit management and key-pool screenshots capture only this run's synthetic provider forms; real-site attaches them to test results, and CDP saves them with `--evidence-dir=path`. These checks cover gateway management and key routing, not paid inference, OAuth subscriptions or routing groups.

Run against a configured deployment (test configuration uses the shared env loader):

```bash
pnpm exec playwright test e2e/realSite/magpieProviders.spec.ts --project=chromium
pnpm e2e:cdp:magpie
pnpm browser:cdp:isolate -- --prod
pnpm e2e:cdp:magpie -- --suite=all --write --isolate
```

The CDP default is a read-only protocol probe; UI mutations require `--write` and an isolated browser profile. It verifies the installed extension's exact path without reloading it. Use `--extension-dir=.output/chrome-mv3-dev` to select a running dev build; the default is `.output/chrome-mv3`. `--env-file=path` is supported; pass credentials through environment files, not command-line flags.

### Disposable pinned backend

The verified backend is [yetone/magpie](https://github.com/yetone/magpie) CLI `0.1.1126`, source revision `ea6f8f89f83143e39b139582e75a1dda1fcff4cf`. Use the official release's Windows CLI executable. Its verified SHA256 is `d00d43152e981046a60d706cead35f6600c9f413c3e71405a5ed67a2f677e135`. The wrapper verifies this checksum before execution, creates a new home plus XDG config/data/cache directories, sets `DO_NOT_TRACK=1`, and starts `web --addr 127.0.0.1:<free-port> --no-open` with a random fixed Web key. Isolating XDG directories alone does not isolate Magpie's saved CLI accounts.

Set the binary path in your shell or shared `.env.local`, then use PowerShell:

```powershell
$env:AAH_E2E_MAGPIE_BINARY = 'C:\tools\magpie-cli.exe'
# Native read-only probe:
pnpm e2e:magpie:disposable -- node scripts/test-magpie-e2e-live.mjs
# Fresh browser extension + real server; the Playwright build project checks/rebuilds output:
pnpm e2e:magpie:disposable -- node node_modules/@playwright/test/cli.js test e2e/realSite/magpieProviders.spec.ts --project=chromium
# Current worktree's already launched isolated CDP browser:
pnpm e2e:magpie:disposable -- node scripts/test-magpie-e2e-live.mjs --suite=all --write --isolate
```

Other platforms must provide their release binary's independently verified `AAH_E2E_MAGPIE_BINARY_SHA256`; the Windows checksum is never reused for them. The wrapper seeds a sentinel provider before starting the tests, verifies it is unchanged and all test-created providers are gone afterward, then stops only its child server and deletes only its generated temporary directory. This teardown also runs when the command fails. No production accounts are copied.

CI uses the same independent matrix target and the `AAH_E2E_MAGPIE_BASE_URL` / `AAH_E2E_MAGPIE_WEB_KEY` secrets, plus the shared inference URL/key for model sync. Missing credentials are reported explicitly. This wiring does not provision a remote deployment or publish secrets; a local passing run does not establish that the remote workflow ran.

Run one real-site category locally:

```bash
pnpm e2e:real-site:account
pnpm e2e:real-site:cloud-sync
pnpm e2e:real-site:managed-site
pnpm e2e:real-site:webdav
```

Run one shared WebDAV provider flow locally:

```bash
pnpm e2e:real-site:nutstore
pnpm e2e:real-site:ctfile
pnpm e2e:real-site:opencloud
pnpm e2e:real-site:webdav-provider
```

`pnpm e2e:real-site:webdav` runs every WebDAV real-site matrix entry. `pnpm e2e:real-site:webdav-provider` keeps the provider-focused behavior and defaults to Nutstore unless a provider prefix is passed. Category scripts run each matching matrix entry separately and reuse the first extension build for the remaining entries.

The GitHub Actions workflow has a `category` input with `all`, `account`, `cloud-sync`, `managed-site`, and `webdav`. Scheduled runs still use `all`; manual runs can select a single category so the CI job list and artifacts are visibly grouped as `Account / ...`, `Cloud Sync / ...`, `Managed Site / ...`, or `WebDAV / ...`.

Playwright loads shared defaults from the primary worktree's `.env.local`, then this checkout's `.env` and `.env.local`. Shell or CI environment variables take precedence; CI never reads another worktree's env files. See [local tooling environment configuration](../../CONTRIBUTING.md#local-tooling-environment-configuration) for shared-source overrides and `pnpm env:diagnostics`. Each block is optional; specs skip when that site's required variables are missing. Use dedicated low-privilege test accounts.

## GitHub Secret Gist Cloud Sync

The cloud-sync spec uses a dedicated GitHub token to create one encrypted, unlisted (Secret) Gist, verify the file through the GitHub API, restore the data through the extension, and delete only the Gist it created. Creation IDs are captured from API responses before UI assertions, so persistence or UI failures still trigger cleanup. A teardown fixture has its own 90-second timeout budget, including when the test body times out. Cleanup verifies that the Gist returns 404, retries transient failures up to three times, and reports cleanup failures alongside the original test failure. If a creation response has no usable ID, cleanup reports the capture failure rather than deleting an unknown resource. The test skips when the token is not configured. The token is supplied only through the process/CI environment and is never written to the backup, logs, or repository.

```env
AAH_E2E_GITHUB_GIST_TOKEN=replace-with-a-dedicated-gists-token
```

For local runs:

```bash
pnpm e2e:real-site:cloud-sync
```

Use a dedicated low-privilege token with Gists read/write access. The test password is local-only and is defined inside the spec; it is not a GitHub credential.

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

The managed-site channel E2E uses the same New API deployment for account-backed status checks and also needs managed-site admin credentials. It creates temporary channels and keys with an `AAH E2E ...` prefix, deletes stale matching channels before each run, and deletes created channels/keys after each run. It intentionally does not run model-list sync.

```env
AAH_E2E_NEW_API_ADMIN_TOKEN=replace-with-admin-access-token
AAH_E2E_NEW_API_ADMIN_USER_ID=1
```

The advanced-settings case uses those three required values (base URL, admin token, user ID) to create one uniquely named, manually disabled OpenAI channel. It edits all nine advanced fields through the extension, reads the real API to verify persistence, reopens and clears them, and verifies unrelated top-level fields and nested `setting`/`settings` values survive both saves. Cleanup deletes only this run's channel and verifies it is gone, including after a failed check. The case records the server version and channel type as test annotations and disables screenshots, video, and traces for authenticated channel workflows.

Run only this case in PowerShell:

```powershell
$env:AAH_E2E_REAL_SITE_CATEGORY = 'managed-site'
$env:AAH_E2E_MANAGED_SITE_TARGET = 'new-api'
pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --project=chromium --workers=1 --grep 'saves and clears advanced'
```

This establishes real configuration persistence. It does not establish live upstream detection, automatic model synchronization, proxy routing, or model inference: the temporary channel has an invalid upstream URL and no usable key. The intercepted `e2e/newApiAdvancedEditor.spec.ts` separately checks grouped UI usability at desktop and narrow widths.

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

With the DoneHub managed-site credentials above configured, run the advanced channel editor check directly (it is not part of the managed-site matrix):

```bash
pnpm exec playwright test e2e/realSite/doneHubAdvancedEditor.spec.ts --project=chromium --workers=1
```

The check creates a disabled temporary channel, edits advanced settings through the UI, rereads the server values, then clears the settings and verifies unrelated fields survived. Cleanup deletes the temporary channel. Its upstream URL and key are nonfunctional fixtures, so this checks persistence, not live model routing.

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

Veloera channel CRUD/search and standalone credential import/duplicate checks are covered by the managed-site channel E2E with the shared inference URL/key.

## Managed-Site Channel Matrix

### CLIProxyAPI providers

CLIProxyAPI uses `e2e/realSite/cliProxyApiProviders.spec.ts`, registered as `cli-proxy-api` in the local and GitHub Actions managed-site matrix. Set these values in the existing real-site environment file or CI secrets:

```env
AAH_E2E_CLI_PROXY_API_BASE_URL=http://localhost:8317
AAH_E2E_CLI_PROXY_API_ADMIN_TOKEN=replace-with-management-key
```

The URL may include a reverse-proxy prefix or `/v0/management`. Use the management key, not a client API key. Run only this target with:

```bash
pnpm exec playwright test e2e/realSite/cliProxyApiProviders.spec.ts --project=chromium --workers=1
```

In the Real-Site E2E workflow, choose category `managed-site` and target `cli-proxy-api`. Missing credentials are reported as skips. Older servers may skip Vertex AI, xAI, or Gemini Interactions only when the corresponding endpoint returns 404; authentication errors fail the test.

Seven serial scenarios exercise provider creation, search, model replacement, credential rotation, preservation of request headers and proxy settings, and deletion through the extension UI. Independent management API reads confirm the persisted results. No upstream model requests are made. Each run uses unique dummy credentials and an `.invalid` upstream URL, and cleans only its own provider in a finalizer, including after a failed UI assertion. Traces, screenshots, and videos are disabled for this spec.

Use a dedicated test deployment without concurrent configuration writers: CLIProxyAPI collection PUTs do not offer compare-and-swap protection.

### Other managed-site targets

The shared managed-site channel spec can be scoped to one target with `AAH_E2E_MANAGED_SITE_TARGET`. CI runs it once per managed site so targets can execute independently and in parallel.

```bash
AAH_E2E_MANAGED_SITE_TARGET=new-api pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --project=chromium
AAH_E2E_MANAGED_SITE_TARGET=done-hub pnpm exec playwright test e2e/realSite/managedSiteChannels.spec.ts --project=chromium
```

Managed-site import tests use `AAH_E2E_UPSTREAM_BASE_URL` and `AAH_E2E_UPSTREAM_API_KEY` directly through the credential library. They never log into a source account or create/revoke its API keys. Missing shared credentials skip the import scenario while management CRUD/search remains active.

Import scenarios add a custom model where the editor supports one, then check persisted channel identity and duplicate detection. For targets that compare model sets or mask keys, the second import must show a candidate-review or verification warning. It is cancelled without creating another channel. Octopus model-discovery steps separately check the request protocol, successful response, and usable editor controls; an empty model list is valid. The custom model must remain saved after reopening the channel and refreshing discovery. Controlled browser tests continue to cover account key-row status badges and both empty and populated catalogs.

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
AAH_E2E_SUB2API_ADMIN_TOKEN=replace-with-admin-api-key
# AAH_E2E_SUB2API_LOGIN_PATH=/login
# AAH_E2E_SUB2API_LOGIN_API_PATH=/api/v1/auth/login
# AAH_E2E_SUB2API_USERNAME_SELECTOR=input#email
# AAH_E2E_SUB2API_PASSWORD_SELECTOR=input#password
# AAH_E2E_SUB2API_SUBMIT_SELECTOR=form button[type="submit"]
# AAH_E2E_SUB2API_AGREE_SELECTOR=input[type="checkbox"]
```

The managed-site Sub2API target uses the Admin API Key to create temporary `type=apikey` accounts with an `AAH E2E Sub2API` prefix. It verifies that token status checks inventory accounts without sending the imported URL through the upstream name-search parameter, then reopens Key Management to confirm the matching candidate key is read through the raw-data endpoint. Temporary accounts are removed afterward.

## Nutstore WebDAV

Use a dedicated low-value Nutstore app password and a test-only JSON file URL. Keep the test file under a clearly named non-ASCII child directory, such as `all-api-hub-e2e/中文目录测试`, so the live run also covers percent-encoded WebDAV `MOVE` `Destination` headers while reusing the existing test root collection. The spec deletes this exact file before and after the run. The local WebDAV runner selects these variables by default.

```env
AAH_E2E_NUTSTORE_WEBDAV_URL=https://dav.jianguoyun.com/dav/all-api-hub-e2e/中文目录测试/all-api-hub-nutstore-move.json
AAH_E2E_NUTSTORE_WEBDAV_USERNAME=test-user@example.com
AAH_E2E_NUTSTORE_WEBDAV_PASSWORD=replace-with-nutstore-app-password
```

## CTFile WebDAV

Use a dedicated low-value CTFile test file URL. The shared provider flow uploads through the extension UI, overwrites the same JSON file, imports it back, and deletes the exact test file before and after the run. This provider covers WebDAV servers that reject hidden `PUT` target names.

```env
AAH_E2E_CTFILE_WEBDAV_URL=https://dav.ctfile.com/test-space/all-api-hub-e2e/all-api-hub-ctfile.json
AAH_E2E_CTFILE_WEBDAV_USERNAME=test-user
AAH_E2E_CTFILE_WEBDAV_PASSWORD=replace-with-ctfile-password
```

## OpenCloud WebDAV

Use a dedicated low-value OpenCloud account and either an existing writable space URL or an explicit test-only JSON file URL. For a space URL, the shared provider flow uses the product's app-owned `all-api-hub-backup/all-api-hub-1-0.json` target. It removes only that exact file before and after the run. The E2E keeps OpenCloud responses live; the WebDAV service tests cover deterministic `425 Too Early` retry behavior.

```env
AAH_E2E_OPENCLOUD_WEBDAV_URL=https://opencloud.example.invalid/dav/spaces/example-space/all-api-hub-e2e/all-api-hub-opencloud.json
AAH_E2E_OPENCLOUD_WEBDAV_USERNAME=test-user
AAH_E2E_OPENCLOUD_WEBDAV_PASSWORD=replace-with-opencloud-password
```

## Additional WebDAV Providers

The shared WebDAV provider spec is UI-driven and can run against another real WebDAV backend by setting the generic variables directly:

```env
AAH_E2E_WEBDAV_PROVIDER_NAME=Nextcloud
AAH_E2E_WEBDAV_ACCOUNT_PREFIX=nextcloud
AAH_E2E_WEBDAV_URL=https://nextcloud.example.com/remote.php/dav/files/test-user/all-api-hub-e2e.json
AAH_E2E_WEBDAV_USERNAME=test-user
AAH_E2E_WEBDAV_PASSWORD=replace-with-test-password
```

CI can also add a matrix entry with a provider-specific prefix such as `CUSTOM_WEBDAV`, then provide `AAH_E2E_CUSTOM_WEBDAV_URL`, `AAH_E2E_CUSTOM_WEBDAV_USERNAME`, and `AAH_E2E_CUSTOM_WEBDAV_PASSWORD`.

For local provider-prefixed variables beyond Nutstore, pass the prefix to the runner only after that provider has real test credentials:

```bash
pnpm e2e:real-site:webdav-provider CUSTOM_WEBDAV
```
