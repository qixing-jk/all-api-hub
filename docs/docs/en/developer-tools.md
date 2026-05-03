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

## Related Documentation

- [Share Snapshot](./share-snapshot.md)
- [FAQ](./faq.md)