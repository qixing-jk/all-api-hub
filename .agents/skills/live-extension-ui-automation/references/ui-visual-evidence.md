# UI Visual Evidence: Capture, Stabilization and Comparison

## Core principle

Visual regression evidence must be legible, reliable, and immediately reviewable by developers.
Raw full-page viewports shrink fine-grained UI details into illegible blur; micro-cropping strips spatial context; arbitrary sleeps and uncontrolled animations produce flaky, blank, or unstable captures.
Capture the **focused component with its immediate surrounding context**, stabilize DOM state and animations with explicit waits, and stitch Before and After into **side-by-side composite views** with clear status badges.

## Result presentation and comparison

### Side-by-side composite stitching

Do not leave Before and After as detached images that require reviewers to switch back and forth between files or tabs.
Stitch matching states side-by-side into a single composite image:
- **Left**: BEFORE (amber/red label or border)
- **Right**: AFTER (emerald/green label or border)

```
+-----------------------------------+-----------------------------------+
|  [BEFORE] Pre-change State        |  [AFTER] Implemented State        |
+-----------------------------------+-----------------------------------+
|  ... focused UI with context ...  |  ... focused UI with context ...  |
+-----------------------------------+-----------------------------------+
```

- **Built-in comparator**: Use `pnpm visual:compare --before <old.png> --after <new.png> --before-source "before" --after-source "after" [--diff]` to generate labelled `comparison.png`, exact pixel diffs, and structured metadata.
- **Direct compositing**: When capturing multiple states in custom automation scripts, compose images side-by-side using `pngjs` or Canvas, adding top/bottom banners to identify the variant.
- **Inline presentation**: Embed the stitched image directly in the review document (`![Comparison description](stitched-*.png)`), accompanied by clickable links to individual full-resolution source captures.

### Consolidated galleries for multi-surface changes

When a change affects multiple UI surfaces (e.g. icon unification, theme updates, or shared design primitives):
1. **Consolidated Markdown report**: Group comparisons by surface/feature in a single structured report with a table of contents, rather than isolated scattered snippets.
2. **Standalone HTML gallery**: Provide a self-contained offline HTML artifact (with inline base64 or relative images, filter tabs, and responsive side-by-side cards) so reviewers can inspect all visual changes in one fluid view.

## Element targeting and surrounding context

Select the capture boundary that maximizes readability and preserves spatial context:

| Target scope | Suitability | Why |
| :--- | :--- | :--- |
| **Full-page viewport** (`page.screenshot()`) | ❌ Unsuitable for component changes | In 1280×800 or 1920×1080 captures, small UI elements (icons, badges, row buttons) shrink to ~8px unreadable dots when scaled down in PRs or review tables. |
| **Micro-cropped element** (`icon.screenshot()`) | ❌ Unsuitable for layout assessment | Capturing only a 16×16 icon or single button removes all spatial context: vertical alignment, text proximity, card margins, and visual balance cannot be judged. |
| **Focused container with context** (`container.screenshot()`) | ✅ Recommended | Captures the immediate semantic parent (e.g., table row `tr`, card `.card`, action group, dialog section, or toolbar). Preserves 100% natural pixel scale while providing enough context to assess layout harmony. |
| **Modal / Dialog** (`dialog.screenshot()`) | ✅ Recommended for modal flows | Capture the dialog container (`[role="dialog"]`) rather than the entire dimmed browser window. |

```javascript
// Good: Capture the table row or card with its surrounding context
const row = page.locator('tr:has-text("DeepSeek")').first()
await row.waitFor({ state: "visible", timeout: 8000 })
await row.screenshot({ path: "evidence/account-row.png", animations: "disabled" })

// Good: Capture dialog contents
const dialog = page.locator('[role="dialog"]').first()
await dialog.waitFor({ state: "visible", timeout: 8000 })
await dialog.screenshot({ path: "evidence/edit-dialog.png", animations: "disabled" })
```

## Repository UI surfaces and capture patterns

All API Hub contains five distinct UI surfaces. Apply the appropriate capture strategy to each:

| Surface | Entrypoint / Environment | Recommended Viewport | Optimal Capture Target | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Options Page** | `options.html` | 1920×1080 | Table row `tr`, card, action group, toolbar | Use wide viewport to prevent tab bar collapsing into "More..." overflow menu. Use deep URL hash/query (e.g. `?tab=accountManagement#basic`) for sub-tabs. |
| **Popup** | `popup.html` | 380×600 (fixed) | Popup root or section card (`.account-card`) | Fixed dimensions. Capture the full popup window or focused section card. |
| **Sidepanel** | `sidepanel.html` | 380×700 / 320×700 | Panel card or drawer content | Test both light & dark themes (`--view light:380x700 --view dark:320x700`). |
| **Modals & Drawers** | Radix Portal (`[role="dialog"]`) | Matches active surface | Dialog container (`[role="dialog"]`) | Escapes page container into `document.body`. Capture the modal box, not the dimmed background. |
| **Injected Content** | Content scripts (Turnstile assist, floating bar) | Host page viewport | Injected container / Shadow host | Scoped inside host page or Shadow DOM. Wait for injection before capturing. |
```

## Waiting and DOM stabilization (Anti-flake rules)

### 1. Explicit state waiting over static sleeps

Never use fixed sleeps (`waitForTimeout(500)`). Extension runtime states load asynchronously:
- Plasmo storage reads and IndexedDB initialization take variable time across environments.
- React components using `createLazyTabComponent` or lazy chunks take round-trips to compile/load.
- Always wait for the specific DOM element or content to become visible:
  ```javascript
  const target = page.locator('[data-testid="target-element"]').first()
  await target.waitFor({ state: "visible", timeout: 8000 })
  ```

### 2. Freeze motion and transitions

Framer Motion animations (`data-page-motion-item`, tab slide indicators, modal fade/scale transitions) cause Playwright's `locator.screenshot()` to throw `Error: Element is not stable` or capture blurred intermediate frames.
- Disable animations at page setup:
  ```javascript
  await page.emulateMedia({ reducedMotion: "reduce" })
  ```
- Always pass `animations: "disabled"` to `screenshot()`:
  ```javascript
  await locator.screenshot({ path: "...", animations: "disabled" })
  ```

### 3. Deep navigation and tab activation

- **Direct navigation**: For options-page sub-tabs, navigate directly via URL query/hash when supported (e.g. `options.html?tab=accountManagement#basic`).
- **Tab clicks**: When clicking tabs interactively, wait for the corresponding tab panel to mount and become active:
  ```javascript
  await page.locator('[role="tab"][data-value="accountManagement"]').click()
  const panel = page.locator('[role="tabpanel"][data-state="active"]')
  await panel.waitFor({ state: "visible", timeout: 8000 })
  ```
- **Responsive tab overflow**: At viewports narrower than 1440px (e.g. 1280px), responsive tab navigation collapses remaining tabs into an overflow "More..." / "更多" dropdown menu. Use wide viewports (e.g. `1920x1080`) for automated full-page captures to ensure all tabs remain directly visible and accessible without dropdown nesting.

### 4. Portal and Radix UI awareness

Radix UI primitives (Dialog, Popover, DropdownMenu, Tooltip, Select) render via React Portals into `document.body` (`div[data-radix-popper-content-wrapper]` or `[role="dialog"]`), escaping the application root container (`[data-testid="options-app"]`).
- Never query portal content as a child of the page container.
- Query directly from `page`:
  ```javascript
  // Trigger open
  await page.locator('[data-testid="open-menu-btn"]').click()
  // Locate portal at root
  const menu = page.locator('[role="menu"], [data-radix-popper-content-wrapper]').first()
  await menu.waitFor({ state: "visible", timeout: 5000 })
  await menu.screenshot({ path: "evidence/menu.png", animations: "disabled" })
  ```

### 5. Resilient locators and localization

Extension UI supports multiple locales (`zh-CN`, `en`, `ja`).
- Do not rely on hardcoded translated strings (e.g. `has-text("前往账号管理")` fails if the translation is `打开账号管理页面` or if the profile runs in English).
- Prefer stable semantic locators:
  - `data-testid` attributes
  - Semantic ARIA roles (`role="tab"`, `role="button"`) with invariant values
  - If text locators are unavoidable, inspect `locales/` first or use partial regex matching.
