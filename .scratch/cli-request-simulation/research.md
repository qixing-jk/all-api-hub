# CLI request simulation protocol research

Investigated: 2026-10-24. Scope: requests using the user's existing API key and custom inference URL. No OAuth account impersonation, token acquisition, or claims of remote compatibility are established here. Sources were retrieved directly from GitHub and official browser documentation. This note preserves protocol decisions and remaining validation gaps under the local issue tracker retention rules.

## Pinned sources

| Source | Investigated revision |
| --- | --- |
| Codex CLI 0.164.0 | `rust-v0.164.0`, commit `6aaac694803004a63c6f393d153c96d22521a6b9` |
| Gemini CLI 0.65.0 | `v0.65.0`, commit `6006c14a4decfe4b891c6263ad6ad5992e404b5b` |
| Sub2API | `37067e8e340e9440d173a92b4faa05e8ce58368f` |
| CLIProxyAPI | `8289ec4c71ad914d0612c2776352b76ba3d355a6` |

Claude Code's public repository does not expose the complete request implementation. Its profile is based on an actual installed-client loopback capture plus corroborating gateway implementation, rather than full official source. `capture-clients.mjs` captured installed Claude Code 2.1.306 and Codex CLI 0.164.0 against a loopback-only receiver with synthetic credentials and isolated working directories. Local raw evidence is under `artifacts/client-capture/`. Codex inherited Orca's `codex_exec` originator/UA override in this environment; the product profile uses the official default `codex_cli_rs` from the pinned source. Claude's bare capture used the SDK CLI surface; the product uses the documented Claude Code identity required by the gateway validator and excludes proprietary prompt/tool inventories and billing claims.

## Codex

The official default client sets `originator: codex_cli_rs` and a `User-Agent` beginning `codex_cli_rs/<version>`, followed by OS, architecture, terminal and optional client suffix. See [default client lines 152–178 and 458–460](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/login/src/auth/default_client.rs#L152).

The HTTP transport POSTs `/responses`, requests `text/event-stream`, and adds session/thread IDs and `x-client-request-id`; the core adds compatibility headers and body metadata. See [Responses transport lines 73–95 and 136–146](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-api/src/endpoint/responses.rs#L73), [core options lines 1495–1517](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L1495), and [metadata lines 330–394](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/responses_metadata.rs#L330).

The 0.164.0 body explicitly uses `store:false`, `stream:true`, `include:["reasoning.encrypted_content"]`, `tool_choice:"auto"`, tools and model-dependent reasoning/text options. Base instructions are inserted into the input prefix in this version; there is no universal top-level `instructions` requirement in this source. Do not copy older ChatGPT-backend instructions or add OAuth-only headers to API-key requests. See [body construction lines 1032–1041 and 1075–1130](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L1032).

**A real reason header-only profiles fail:** current Sub2API's `codex_cli_only` detector checks official UA/originator, parses the engine version, enforces optional minimum/maximum versions, then evaluates all configured required fingerprint signals. The default signal requires an `x-codex-*` header; other optional seeded signals include session/thread headers and `client_metadata.x-codex-window-id` / installation ID. See [detector lines 83–173](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/service/openai_client_restriction_detector.go#L83) and [fingerprint policy lines 26–50](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/pkg/openai/engine_fingerprint_signal.go#L26). This proves that gateway revision's policy, not every deployed site's configuration.

Recommended minimal profile: matched UA/originator, actual supplied bearer key, SSE accept header, `store:false`, reasoning include, generated request-session IDs, `x-codex-window-id` and corresponding consistent body metadata. Generate identities locally for the verification run; never reuse another person's account identifiers. Preserve requested model, user text, tools and selected streaming mode; a nonstreaming override is a customized profile rather than the native default.

## Claude Code

Sub2API's strict validator requires a `claude-cli/<semver>` UA. For normal `/messages` requests it additionally requires nonempty `x-app`, `anthropic-beta`, `anthropic-version`, a system array matching known Claude Code identity text (or billing attribution recognition), and parseable `metadata.user_id`. It has separate exemptions for lightweight one-token/count-token requests; those exemptions do not prove ordinary generation compatibility. See [validator lines 16–49 and 84–158](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/service/claude_code_validator.go#L84).

The accepted metadata has changed: version >=2.1.78 uses a JSON-encoded string with `device_id`, `account_uuid` (may be empty), and `session_id`; older versions use a concatenated legacy format. See [parser/formatter lines 9–97](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/service/metadata_userid.go#L9). Use a generated local device/session identity and empty account UUID for API-key tests rather than a fictional OAuth account.

CLIProxyAPI independently implements this as a distinct cloaking path: it installs a Claude Code identity system block, preserves caller instructions through its own policy, generates metadata, and sets `x-app:cli` plus SDK identity headers. See [system block lines 403–445](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_cloaking.go#L403), [metadata lines 95–125](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_cloaking.go#L95), and [headers lines 1508–1535](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_request.go#L1508). These are implementation experience, not an official Anthropic compatibility guarantee.

Recommended profile: captured version UA and relevant SDK headers, `x-app:cli`, captured API version and API-key appropriate beta set, identity system text as its own text block, and JSON metadata. Preserve the actual test prompt, schema and tools. Do not add the OAuth beta, ChatGPT account headers, billing-signature claims or unrelated agent tooling. Full proprietary system prompts and tool inventories are unnecessary for this validator and would alter test semantics and cost.

## Gemini CLI

Official Gemini CLI creates `@google/genai` with API-key/custom URL configuration for API-key and gateway modes. It generates `User-Agent: GeminiCLI/<version>/<model> (<platform>; <arch>; <surface>)` (with an optional client-name variant), defaults to `x-goog-api-key`, and supports a configured bearer mechanism. Google-login/ADC modes take a different Code Assist path. See [client selection and headers lines 269–315](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/contentGenerator.ts#L269), [custom base URL and SDK lines 317–396](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/contentGenerator.ts#L317).

Recommended profile: API-key path only, native Gemini protocol and CLI UA with model/version, using existing authentication configuration. Do not label a raw `generateContent`/`streamGenerateContent` test as Google-login/Code Assist compatibility. No Gemini CLI binary or target-site result was obtained in this research.

## Extension transport and validation consequences

MDN documents Chrome silently dropping a manually set `User-Agent` from Fetch; Chrome's extension DNR API can modify request headers. An SDK mock proving a `Headers` object contains the profile is insufficient: observe the receiving server's actual header. See [MDN forbidden request headers](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header) and [Chrome declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest). The parent confirmed the repository already has a DNR-backed header-override transport; reuse it and its stream-lifetime cleanup/isolation.

Suggested acceptance distinctions:

1. HTTP contract assertions against verified client fixtures: headers, body, protocol, response parsing and no leaked credentials.
2. Actual extension-to-loopback receiving-server assertions: UA really arrived, concurrent profiles remain isolated and cancellation cleans rules.
3. Ordinary versus simulated request on the same authorized target/key/model: record both outcomes and request mode, without assuming a rejection's cause.

No real remote-site success is established by source research, local fixtures, a profile name, or matching request headers. TLS fingerprints, browser-only transport details, site-specific rules, client-version limits and signed attestation may remain different. Record those as gaps if encountered; do not silently fall back to another profile and report success for the original one.

## Owned Sub2API live investigation and temporary fixture

Read-only inspection of the shared `AAH_E2E_SUB2API_BASE_URL` deployment on 2026-10-24 established version `0.2.18`. It has active OpenAI API-key upstreams, including account 1 with a stored key, Responses support and `gpt-5.4-mini` in its model mapping. It has no Anthropic, Gemini or OpenAI OAuth upstream. Existing group 3 contains account 1. Global Codex restriction settings have no version limits, whitelist or blacklist, and retain the default required `x-codex-*` signal.

The Codex restriction cannot honestly be enabled by setting its extra flag on an API-key upstream: [Account.IsCodexCLIOnlyEnabled requires OpenAI OAuth](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/service/account.go#L2443). Conversely, OpenAI-platform `/v1/messages` is handled by the OpenAI bridge, which checks dispatch permission and does not enter the Anthropic strict-client validator. Thus neither existing API-key account mutation nor an OpenAI group labelled `claude_code_only` establishes a valid restricted-client experiment. See [route dispatch](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/server/routes/gateway.go#L191) and [OpenAI Messages handler](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/handler/openai_gateway_handler.go#L1153).

With explicit authorization to configure this owned test deployment, `live-sub2api-fixture.mjs` creates an isolated two-stage route:

1. Temporary Anthropic group 8 has `claude_code_only:true`, no fallback, and only new Anthropic API-key account 249.
2. Account 249 points to the same owned site's inference base with a newly generated runtime key fixed to temporary OpenAI dispatch group 7.
3. Dispatch group 7 permits `/v1/messages`, has no fallback, and borrows existing account 1 through temporary group membership. No source account credentials/type/settings or global settings were changed.
4. Temporary user 5 has four concurrency slots for the nested requests, balance 1, access limited to these two exclusive groups, and two expiring quota-limited keys (IDs 626/627).

This route cannot recurse: the outer key selects Anthropic group 8 while the account's inner key selects OpenAI group 7, which forwards to the existing independent upstream. The source membership baseline `[3]` is journalled for exact restoration. Only generated fixture secrets are retained in the feature-ignored `artifacts/live-sub2api/state.private.json`; admin and existing upstream secrets are never written. Do not add this private state to Git or public artifacts.

Observed on 2026-10-24: a normal outer request received HTTP 503 with an explicit message that this group only allows Claude Code clients. A request with the researched Claude profile advanced beyond that gate but received HTTP 502 downstream. A direct request using the generated inner dispatch key also failed; Responses returned Cloudflare HTML 502 and subsequently service-unavailable 503, while Chat Completions returned 503. Thus this experiment establishes the deployed strict-client decision and different request progression, **not successful real inference**. First failure evidence remains at `artifacts/live-sub2api/evidence.json`; later runner invocations use timestamped filenames. App-generated requests remain the parent's acceptance work.

Final acceptance used the user's confirmed boundary: admission through the client restriction, without requiring successful inference. The reproducible `probe` command now checks ordinary rejection and simulated admission (HTTP 200 or the observed downstream 502). The Chromium extension UI also passed the same ordinary/simulated comparison in `e2e/verificationRequestProfiles.spec.ts`; the simulated run is stopped after the admission response to avoid unnecessary upstream retries. Successful model inference is not claimed, and no remote Codex or Gemini gate was available on this deployment.

The fixture has been cleaned up. `node .scratch/cli-request-simulation/live-sub2api-fixture.mjs cleanup` deleted the new upstream, both generated keys, user and both groups, with authenticated 404 readback for each; source account 1 membership was restored exactly to `[3]`, then generated credentials were erased from the local state journal. Do not replay setup while a state journal exists. Preserve that journal locally as cleanup evidence. For a fresh authorized experiment use a separately named output journal, check the intended source account and deployment contract first, and run `check` before `probe`.

Retained source entry points are this pinned research note, the loopback-only installed-client capture script, and the disposable owned-site fixture script. Generated capture dumps, browser failure evidence, final acceptance and visual comparisons remain local under `artifacts/` and the shared ignored `.scratch/visual-captures/` output. They are retained for developer review; neither synthetic fixtures nor UI screenshots establish compatibility with an untested remote site.
