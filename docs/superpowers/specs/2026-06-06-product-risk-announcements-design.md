# Product Risk Announcements Design

Date: 2026-06-06

## Purpose

Add a low-noise remote announcement channel for All API Hub's own product
risk notices. The channel exists to warn installed users about severe version
bugs, data-risk issues, compatibility regressions, migration actions, or
temporary mitigations when store updates or release notes are not enough.

This is not a general product-news feed or a site-announcement replacement. It
should stay quiet by default and surface only notices that require user
awareness or action.

## Current Context

The repository already has a `SiteAnnouncements` feature. That feature fetches
announcements from user-added upstream sites, stores local records, tracks
read state, supports manual checks, and can send task notifications for newly
discovered site announcements.

Product risk announcements have a different owner and threat model:

- the publisher is All API Hub, not a user-added site.
- notices target installed extension versions, not saved accounts.
- the primary action is risk mitigation or update guidance.
- remote content must be constrained enough for extension security and store
  review.

For that reason, product risk announcements should use a separate
`productAnnouncements` domain instead of reusing `siteAnnouncements` storage or
message contracts.

## Goals

- Let the extension fetch a remote JSON announcement feed controlled by the
  project.
- Show notices only when they apply to the current extension version, language,
  time window, and local dismissal state.
- Provide a persistent announcement icon entry so users can reopen current
  product notices after reading or dismissing the top-level prompt.
- Support one announcement with multiple localized content blocks so dismissal
  is shared across languages.
- Handle multiple active notices with deterministic priority and low visual
  noise.
- Persist local dismissal state by `id` and `revision` so important updates to
  an existing notice can resurface.
- Keep fetch failures silent and non-blocking.
- Keep remote content safe: no remote JavaScript, no arbitrary HTML, and no
  arbitrary external links.
- Make the feature independently testable at the parser, selector, storage,
  service, and UI layers.

## Non-Goals

- Do not build a full announcement center in the first version.
- Do not add an admin backend or remote write API.
- Do not sync read or dismissed state across devices.
- Do not use this channel for marketing, routine changelog entries, or normal
  feature promotion.
- Do not send browser system notifications in the first version.
- Do not let remote JSON control feature flags, settings, extension behavior,
  or arbitrary navigation.
- Do not merge product announcements with user-site announcements.

## Remote Feed

Use the same repository-controlled static-data pattern as sponsor
recommendations: keep a bundled JSON file under `public/` and fetch the latest
copy from the `main` branch raw URL.

The bundled fallback file should be:

```text
public/product-announcements.json
```

The default production URL should be:

```text
https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/product-announcements.json
```

The extension only reads this document. Keep the URL behind a single service
constant so it can move with the sponsor catalog if the project later changes
remote static-data hosting.

The feed should be versioned:

```json
{
  "schemaVersion": 1,
  "defaultLocale": "en",
  "announcements": [
    {
      "id": "2026-06-balance-history-risk",
      "revision": 1,
      "severity": "critical",
      "priority": 100,
      "affectedVersions": ">=3.44.0 <3.44.1",
      "startsAt": "2026-06-06T00:00:00Z",
      "expiresAt": "2026-06-20T00:00:00Z",
      "content": {
        "en": {
          "title": "Balance history sync may fail",
          "message": "Some users on 3.44.0 may see balance history sync failures. Disable auto sync temporarily or update to 3.44.1.",
          "cta": {
            "label": "View fix notes",
            "url": "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1"
          }
        },
        "zh-CN": {
          "title": "Balance history sync may fail",
          "message": "Users on 3.44.0 may need to disable auto sync temporarily or update to 3.44.1.",
          "cta": {
            "label": "View fix notes",
            "url": "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1"
          }
        }
      }
    }
  ]
}
```

### Field Rules

- `schemaVersion`: supported feed schema. Unsupported schemas are ignored.
- `defaultLocale`: fallback locale for incomplete language coverage.
- `id`: stable announcement identity. It must not change for copy-only edits to
  the same incident.
- `revision`: increment when a dismissed notice needs to resurface.
- `severity`: one of `critical`, `warning`, or `info`.
- `priority`: numeric ranking within a severity tier. Larger values sort first.
- `affectedVersions`: semver-like range string for installed extension
  versions.
- `startsAt` and `expiresAt`: ISO timestamps defining the active window.
- `content`: localized content blocks keyed by locale.
- `cta`: optional, validated action link. Invalid links are dropped without
  dropping the whole notice.

## Locale Handling

Each announcement owns one identity and multiple localized content blocks. A
user who dismisses the notice in one language should not see the same
`id`/`revision` again after switching languages.

Locale resolution order:

1. exact app language, such as `zh-CN`.
2. language family fallback, such as `zh`.
3. configured project fallback for known variants, such as `zh-CN` for
   Traditional Chinese if no better content exists.
4. feed-level `defaultLocale`.
5. discard the announcement if no valid content block can be resolved.

The resolved content block must contain a non-empty `title` and `message`.
CTA labels are shown only when the CTA URL is valid and allowed.

## Multiple Active Notices

The product should not stack several expanded banners at the top of the UI.
Selectors should produce a sorted active list, then the UI should choose a
primary notice and summarize the rest.

Sort order:

1. severity: `critical` before `warning` before `info`.
2. `priority`: larger first.
3. `startsAt`: newer first.
4. `id`: stable lexical fallback.

Display behavior:

- A persistent announcement icon is available from the Options header. It
  should remain visible even when there are no active notices, with an empty
  state in the popover or sheet.
- The icon shows a badge only for unseen active notices. No badge means there
  is nothing new, not that the list is unavailable.
- Opening the icon shows the complete current product-announcement list from
  the cached feed, including active notices and dismissed notices behind a
  filter or tab.
- Opening the list marks visible active notices as seen. It must not dismiss
  them.
- Options Overview can additionally show the top active `critical` or
  `warning` notice as a risk banner. The banner should include a "view all"
  affordance that opens the same list.
- Popup can show the same compact icon or a compact entry point for active
  `critical` or `warning` notices, but it should not stack multiple banners.
- `info` notices remain available through the fixed announcement entry. They
  should not interrupt popup usage or appear as Overview risk banners.
- Dismissing the primary notice promotes the next active notice, if any.
- Bulk dismiss can apply to current active `warning` and `info` notices.
  `critical` notices should be dismissed one at a time.

## Local State

Persist product announcement state in extension local storage, separate from
site-announcement state.

```ts
interface ProductAnnouncementState {
  schemaVersion: 1
  lastFetchedAt?: number
  dismissed: Record<string, number>
  seenAt: Record<string, number>
  lastShownAt: Record<string, number>
  cachedFeed?: ProductAnnouncementFeed
}
```

State semantics:

- `dismissed[id] = revision` means the user closed that notice revision.
- if the remote `revision` is higher than the dismissed revision, the notice is
  eligible again.
- `seenAt` records when a notice was viewed or expanded.
- seen notices should lose unread badge emphasis, but they should stay visible
  in the fixed announcement list until they expire, are removed from the remote
  feed, or are explicitly dismissed.
- dismissed notices should disappear from banners and unread counts, but remain
  available from the fixed list's dismissed filter while they are still present
  in the cached feed.
- `lastShownAt` can throttle repeated exposure for severe notices if needed.
- `cachedFeed` allows the UI to keep showing the last valid feed when refresh
  fails.

Use a storage write lock if the feature can update state from both background
and UI entrypoints.

## Fetching And Refresh

The fetch path should be best-effort:

- background alarm refreshes every 12 hours.
- Options and Popup ask the background service for current notices; the service
  returns cached notices immediately and may refresh stale cache in the
  background.
- failed refreshes keep the previous valid cached feed.
- fetch failures should not show user-facing errors, block page rendering, or
  affect normal extension workflows.
- any request cancellation or timeout should exist only to prevent indefinitely
  hanging background work; it should not be used as a user-visible readiness
  gate.
- requests must not include saved account data, site URLs, tokens, prompts, or
  user-entered text.

The service should normalize the remote feed at the boundary. Downstream UI and
selectors should receive typed, sanitized notices rather than raw remote JSON.

## Security Boundaries

Remote content is data, not behavior.

- Accept only JSON from configured announcement URLs.
- Do not evaluate remote JavaScript.
- Do not render arbitrary HTML.
- Prefer plain text body content. If Markdown is added later, use a small,
  sanitized subset and no raw HTML.
- CTA URLs must pass an allow-list, such as project GitHub releases, project
  docs, or an owned product domain.
- CTA actions should be limited to safe navigation. Do not let remote data
  modify settings, trigger destructive actions, or invoke privileged runtime
  operations.
- Unsupported schemas, invalid dates, invalid version ranges, invalid locale
  content, and malformed CTA links should fail closed.

## UI Surfaces

### Persistent Header Entry

The primary user entry is a fixed icon button in the Options header, near the
existing version and utility controls. This follows the same product shape as
New API's notification bell: a stable place to reopen notices, with a badge
only when unseen active notices exist.

In this repo, the Options header already has a right-side utility group with
theme, feedback, language, development, and search icon controls. The product
announcement button should live in that group. Popup can use a matching compact
entry in its header action group when active `critical` or `warning` notices
exist.

The button should use the existing `IconButton` style, tooltip behavior, and
header spacing. It should not look like a promotional widget.

### Announcement Popover Or Sheet

The fixed entry opens a compact popover or sheet containing the current product
announcement list. MVP tabs or filters:

- active notices.
- dismissed notices.

The list should show severity, localized title, short message preview,
publish/start date, CTA when allowed, and a per-notice dismiss action. Selecting
a notice opens details in the same popover/sheet or a small dialog. Opening the
list marks visible active notices as seen, not dismissed.

### Options Overview Risk Banner

The Overview page is the main risk-surfacing surface, not the permanent archive.
Place a compact risk banner near the top of the page only when a non-dismissed
`critical` or `warning` notice applies. The banner should use existing
alert/card primitives and local icon patterns.

The banner should include:

- severity tone.
- localized title and message.
- optional CTA.
- dismiss action.
- "view all" action.
- compact count for additional active notices.

### Popup

Popup should remain dense and task-oriented. Show a compact announcement icon
or notice entry for active `critical` or `warning` announcements. It can open a
small list directly if space allows, or navigate to the Options announcement
entry. It should not render a multi-notice feed inline.

### Future Notice Page

A dedicated route/page is not part of the MVP because the fixed header popover
or sheet is enough for current notices. Add a page later only if active or
historical notices become common enough that a popover becomes cramped.

## Runtime Structure

Preferred structure:

```text
src/services/productAnnouncements/
  constants.ts
  fetcher.ts
  messaging.ts
  selectors.ts
  service.ts
  storage.ts
  types.ts
  urlPolicy.ts
  versionRange.ts

src/features/ProductAnnouncements/
  ProductAnnouncementButton.tsx
  ProductAnnouncementBanner.tsx
  ProductAnnouncementPopover.tsx
  ProductAnnouncementList.tsx
  utils.ts
```

The background owns remote fetch, cache refresh, and typed runtime messaging.
UI entrypoints request the current sanitized presentation model through typed
messaging instead of fetching the remote feed directly.

## Telemetry Decision

Add privacy-safe product analytics for the feature because it is a user-visible
risk and recovery channel.

Allowed fields:

- controlled announcement `id`.
- `severity`.
- fetch status category.
- active notice count.
- action type: shown, expanded, dismissed, CTA clicked.
- surface: Options Overview or Popup.

Do not record remote message text, CTA URL, user account data, site URLs,
backend error bodies, or stack traces.

## Testing Strategy

Focused unit tests should cover:

- feed parser rejects unsupported schemas and malformed notices.
- locale resolution falls back in the expected order.
- version range matching includes and excludes correct app versions.
- expired and future notices are filtered out.
- dismissed `id`/`revision` notices stay hidden from banners and unread badge
  counts while remaining available in the fixed list's dismissed filter.
- higher remote revisions resurface after dismissal.
- multiple notices sort by severity, priority, date, and id.
- CTA URL allow-list drops unsafe URLs.
- fetch failure keeps the last valid cached feed.
- storage sanitization handles unreadable or incompatible state.

Component tests should cover:

- fixed header icon renders with and without active notices.
- unseen active notices produce a badge, while seen notices do not.
- opening the fixed list marks visible active notices as seen but not dismissed.
- the fixed list can show active and dismissed notices through its filters.
- Overview shows the primary critical or warning notice and additional count.
- dismissing the primary notice promotes the next active notice.
- critical notices are not bulk-dismissed.
- Popup shows only compact critical or warning notice entry points.

E2E decision:

- Do not add Playwright E2E for the first implementation unless routing from
  Popup to Options or extension-runtime integration cannot be covered with
  component and service tests. The primary risks are parsing, filtering,
  storage, and presentation state, which are better covered with Vitest.

## Rollout

1. Add typed domain models, parser, version matcher, URL policy, and selectors.
2. Add storage and background service with stale-cache refresh.
3. Add typed messaging for UI entrypoints.
4. Add the fixed Options header announcement entry and complete current-notice
   popover/sheet.
5. Add the Overview risk banner and compact Popup entry point.
6. Add a development-only preview override so maintainers can render sample
   notices without publishing remote JSON.
7. Add settings/search/deep-link updates only if a new user-visible settings
   control or page is introduced.
8. Add docs or release-note mention only after the feature has shipped and the
   remote feed path is live.
