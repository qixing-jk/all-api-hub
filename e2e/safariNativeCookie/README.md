# Safari native Cookie validation

Normal Safari builds send an explicitly saved account Cookie through the Safari app extension's Swift handler and an isolated Foundation `URLSession`. The checks distinguish extension accounts A/B from an ordinary Safari tab C. Missing permissions, missing or older native handlers and invalid scope fail closed. No automatic fallback sends those credentials through browser fetch or DNR.

The release asset packager embeds the handler inside the existing Safari extension app, including its network entitlement. Users do not install a separate Chrome-style native messaging host. Source converter projects must also run `scripts/configure-safari-native-cookie-project.py` as shown in the installation guide. See [authorization research](authorization-research.md) for the Apple/WebKit sources and existing product approaches, and [the scoped acceptance record](../../.scratch/safari-cookie-comparison/spec.md) for actual observations and remaining gaps.

The accepted delivery scope is the Safari enhancement with its demonstrated native results and documented limitations. The remaining acceptance matrix tracks follow-up work; completing every scenario is not a prerequisite for delivery. No experiment flag is required.

## Prepare an independent native build

Use macOS with Safari and full Xcode. Follow `.nvmrc` and `package.json` for Node/pnpm versions. Preserve existing worktrees, release applications and browser accounts: run in an isolated checkout, use a fresh converter destination and a distinct bundle identifier, and enable the trial only in a disposable Safari profile. The normal [Safari installation guide](../../docs/docs/safari-install.md) explains local activation.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
pnpm install --frozen-lockfile
pnpm run build:safari
SAFARI_PROJECT_DIR=/path/to/new-trial-project \
  SAFARI_APP_NAME='All API Hub Cookie Trial' \
  SAFARI_BUNDLE_IDENTIFIER=io.github.qixingjk.allapihub.cookieTrial \
  bash scripts/prepare-safari-native-cookie-experiment.sh
security find-identity -v -p codesigning
```

The helper runs `xcrun safari-web-extension-converter`, copies resources, embeds the native handler, enables outgoing sandbox connections and lists actual schemes. Inspect the generated project and signing support; a paid team is not assumed. For example, local ad-hoc builds were possible on the validation Mac:

```sh
xcodebuild -project '<trial-project>/<app-name>.xcodeproj' \
  -scheme '<listed-scheme>' -configuration Release \
  -destination 'platform=macOS' -archivePath '<trial-run>/Release.xcarchive' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= archive
```

Register/run only the distinct trial app, then enable that extension and grant the required website and optional Cookie permissions in Safari. Safari may require local authorization for unsigned extensions. Inspect the actual built manifest: `cookies` and DNR stay optional, `nativeMessaging` is declared by normal Safari builds, and Safari has neither `sidePanel` nor Gecko `browser_specific_settings`. Do not apply Chromium E2E permission-removal flags.

This build contains normal product UI without instrumentation. Options refresh and the actual toolbar Popup need separate native checks. A passing build, browser API availability, HTTP bootstrap, mocked test or Playwright WebKit run is not Safari Web Extension validation.

## Instrumented synthetic protocol checks

The protocol harness is a separate build that injects `native-probe.js` into the background and Options. It does not establish that a native Popup click works. Start a fresh observation file; the server overwrites the selected path, so retain earlier runs first.

```sh
SAFARI_NATIVE_OBSERVATIONS=.scratch/safari-native-cookie/run-001.json \
  node e2e/safariNativeCookie/server.mjs
```

In another terminal, prepare a distinct app and build/enable its listed scheme as above:

```sh
node e2e/safariNativeCookie/prepare.mjs
```

Preparation writes a fresh timestamped directory and `identity.json` under `.scratch/safari-native-cookie/runs/`. Its Options controller (`?nativeCookieTrial=1`) opens the synthetic browser fixture and waits for optional Cookie permission. Grant Cookie and localhost/127.0.0.1 website access in the trial context. After `trial-complete`:

```sh
node e2e/safariNativeCookie/verify.ts .scratch/safari-native-cookie/run-001.json
node e2e/safariNativeCookie/verify.ts .scratch/safari-native-cookie/run-001.json --formal
```

The verifier checks the latest attempt and server observations for concurrent account isolation, Cookie/Origin, Set-Cookie suppression, redirect rejection and cancellation. `--formal` deliberately exits 2: the harness cannot establish full release readiness. The maintained historical regression recordings live under `tests/fixtures/safariNativeCookie/`; their passing unit tests are not fresh native observations.

Additional commands are sent as `{"command":"saved-accounts"}` to POST `http://127.0.0.1:41672/safari1669native/control`. Available checks include `permission-url-check`, `permissions-deny`, `permissions-allow`, `revoke-in-flight`, `timeout`, `native-admission`, `product-seed`, `product-service`, `product-background`, `product-observe` and `product-cleanup`. Change Safari website permissions through the real UI, read them back, and compare server requests; the command alone does not change or prove permission state. Product service calls are not native UI clicks. `hold-for-crash` / `after-crash` require separately scoped lifecycle actions against the identified trial process.

## Disposable HTTPS accounts and normal tab C

Real-site checks require explicitly authorized disposable fixtures. Scripts use `scripts/utils/local-env.mjs`: primary-checkout `.env.local` defaults remain below current-worktree files and explicit variables. `AAH_SAFARI_REAL_ENV_FILE` can select an override without copying credentials. Never print credentials or include them in artifacts.

`AAH_SAFARI_SAME_SITE=1` uses `AAH_E2E_DONE_HUB_BASE_URL`, `AAH_E2E_DONE_HUB_ADMIN_TOKEN` and `AAH_E2E_DONE_HUB_ADMIN_USER_ID` to create three ordinary, run-owned users. The protected cleanup journal blocks another run until cleanup is resolved. The alternate `realSite.mjs` prepares existing configured Done Hub/Veloera test sessions and does not prove same-site isolation by itself.

Generate a random local broker nonce before building the instrumented app. This nonce protects local credential bootstrap; it is not an upstream credential:

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs'; import { randomBytes } from 'node:crypto';
fs.mkdirSync('.scratch/safari-native-cookie', { recursive: true });
fs.writeFileSync('.scratch/safari-native-cookie/real-nonce', randomBytes(32).toString('hex'), { mode: 0o600 });
JS
node e2e/safariNativeCookie/prepare.mjs
```

Start the server with the same nonce loaded without printing it:

```sh
AAH_SAFARI_SAME_SITE=1 \
  SAFARI_NATIVE_OBSERVATIONS=.scratch/safari-native-cookie/https-001.json \
  node --input-type=module - <<'JS'
import fs from 'node:fs';
process.env.AAH_SAFARI_REAL_TOKEN = fs.readFileSync('.scratch/safari-native-cookie/real-nonce', 'utf8').trim();
await import('./e2e/safariNativeCookie/server.mjs');
JS
```

Create a disposable Safari profile named `All API Hub Safari Cookie Trial` (or set `AAH_SAFARI_TEST_PROFILE` consistently for every `normalTab.mjs` invocation). Enable only the trial there and grant its required website access. `node e2e/safariNativeCookie/normalTab.mjs start` verifies the profile window title before logging C in, using local Apple Events/Accessibility access and Safari's JavaScript-from-Apple-Events setting. Then send `real-site`, and run `normalTab.mjs observe` after the native interval. `resume`, `collect <new-scratch-json>` and `stop` manage only the recorded trial window's first tab. Safari has no Chromium CDP endpoint.

Stop the server normally to run owned-user cleanup. Confirm the classified `owned-backend-cleanup.confirmed` event and disappearance of the cleanup journal; preserve the journal on failure. Remove only trial extension records, close owned tabs/windows, disable/unregister only the trial app and delete only its disposable profile. For a synthetic run, visiting `/safari1669native/cleanup` on the fixture origin clears its dedicated Cookie path. Preserve raw run evidence outside the repository before branch delivery.

## Known limits and follow-up validation

The JavaScript URL permission probe and native dispatch are not atomic. Polling and cancellation cannot retract data already sent. A native-message capability handshake sends no credentials; per-URL checks, optional-permission loss and deadlines fail closed, but this does not prove zero bytes after a simultaneous website denial.

The native protocol buffers UTF-8 text requests/responses up to 512 KiB, rejects redirects and remote plain HTTP, and applies finite native/bridge deadlines. It does not provide streaming or arbitrary binary bodies. Oversized or unsupported requests fail without replay through browser credentials.

Broader acceptance still requires current-source HTTPS A/B/C and Cookie/Origin checks, ambient-cookie exclusion, Set-Cookie suppression, redirect rejection, permission revoke/regrant and measured cancellation, late-message cleanup, background/native/Safari restart with stable account storage, actual Options/Popup/background product flows, and signed packaging/upgrade. Ordinary browser `credentials: include` behavior must be tested independently under Safari's Cookie policies. A native request must not become its transparent replacement.
