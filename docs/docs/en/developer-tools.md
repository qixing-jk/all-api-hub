# Developer & Advanced Tools

> Built-in utility tools for advanced users and developers, used for debugging, visual customization, or in-depth troubleshooting.

## Mesh Gradient Debugging Tool

The **Mesh Gradient Debugging Tool** is a built-in visual debugging tool primarily used for previewing and customizing the dynamic background effects used in the [Share Snapshot](./share-snapshot.md) feature.

### Core Features

- **Real-time Preview**: View background generation results instantly under different combinations of Seed, Palette, and Layout.
- **Palette Browser**: View all built-in color palettes and their hex codes.
- **Layout Switching**: Browse all supported mesh deformation layouts.
- **Overlay Simulation**: Toggle the data overlay to simulate real snapshot generation.

### How to Access

Since this tool is mainly for development and testing, it's not included in the regular menus. You can access it as follows:

1. Open the **"Settings"** page of the extension.
2. In the browser address bar, append `#mesh-gradient-lab` to `options.html`.
   - For example: `chrome-extension://<id>/options.html#mesh-gradient-lab`
3. The page will automatically switch to the debugging view.

---

## Debugging & Logs

If you encounter unexplained issues during use, you can use the browser's built-in developer tools for troubleshooting.

### 1. View Background Page `Service Worker` Logs
- Go to the browser's extension management page (`chrome://extensions`).
- Enable **"Developer mode"**.
- Click **"View: Service Worker"** in the All API Hub card.
- Here you can see low-level logs for background requests, auto-refresh, and WebDAV sync.

### 2. View Options Page/Popup Logs
- Right-click on the plugin popup or settings page and select **"Inspect"**.
- Switch to the **"Console"** tab to view UI-layer logs.

---

## Verifying the Uninstall Survey Locally

The uninstall feedback survey page lives in `docs/docs/.vuepress/public/uninstall.html` and is published verbatim by the documentation site. By default, a locally built extension registers no uninstall page address, so uninstalling it locally opens nothing; use the steps below to enable it temporarily for local verification.

### 1. Preview the Survey Page Locally

The survey page is fully static and opens without any injected configuration:

```bash
# Open the file directly
start docs/docs/.vuepress/public/uninstall.html   # Windows
open docs/docs/.vuepress/public/uninstall.html    # macOS

# Or through the documentation site's dev server (same path as production)
pnpm --dir docs docs:dev
# Then visit http://localhost:8080/uninstall.html
```

You can append parameters by hand to simulate a real uninstall:

```text
uninstall.html?uid=analytics-test&v=4.0.0&d=42&lang=zh-CN
```

`d` is the number of days between installation and uninstall. Without PostHog configuration the page sends no network request and only prints what it would send to the browser console (`[uninstall-survey] not sent`), so a local preview produces no analytics.

### 2. Run a Real Uninstall Flow in a Local Build

Development and test builds skip registration by default. In development mode, open the **Dev panel** (the floating ball icon at the bottom right of the options page) and use the "Uninstall survey" section:

- **Survey target**: shows the current target address and switches between the local documentation site (`http://localhost:8080/uninstall.html`) and the deployed page. The choice is remembered. Switching takes effect only after you register again.
- **Compose URL preview**: composes and shows the address without registering it; the parameters can be copied.
- **Register uninstall URL**: registers the current target address with the browser immediately; then **remove** the extension on `chrome://extensions` and the browser should open that page. Registration is an explicit action and is not affected by the default dev/test skip.
- **Open survey page**: opens the survey page directly as a preview; the `uid` parameter is removed automatically, so the preview is not counted as a real uninstall.
- **Clear uninstall URL**: clears the registered address.

Note that the browser opens this page only after an **uninstall**; disabling the extension does not trigger it. The background Service Worker console logs `Uninstall survey URL registered` with the parameters listed separately (the logger redacts the query string of URLs).

For scripted automated testing, environment variables can also register the address automatically on every background startup:

```bash
VITE_PUBLIC_UNINSTALL_SURVEY_DEV=1 \
VITE_PUBLIC_UNINSTALL_SURVEY_URL=http://localhost:8080/uninstall.html \
pnpm dev
```

- `VITE_PUBLIC_UNINSTALL_SURVEY_DEV=1` is the key switch: without it, dev/test builds always skip automatic registration.
- `VITE_PUBLIC_UNINSTALL_SURVEY_URL` points the address at a local page or your own test page so it never reaches the production survey page. When omitted, the production address is used.

---

## Related Documentation

- [Share Snapshot](./share-snapshot.md)
- [Privacy Policy](./privacy.md)
- [FAQ](./faq.md)