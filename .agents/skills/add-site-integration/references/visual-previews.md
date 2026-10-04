# CDP and UI image previews

Use for site-specific UI validation and developer handoff. Save real screenshots from the tested build and display them directly so the developer can assess the result without opening a browser or reading a trace.

## Capture useful states

Select a small set of screenshots that answers the task's visual questions:

| Workflow | Representative views |
| --- | --- |
| Account site | Saved account/balance or plan state; key dialog or inventory; aff/invite feedback when implemented |
| Managed site | Connection settings; native resource list; editor/detail after the tested write |
| Check-in | Detected method and today's state; manual/automatic result including reward/status |

Capture the actual current-worktree extension after data settles and the corresponding assertions pass. Also capture a relevant failure or blocked state when encountered. Prefer a focused panel/dialog screenshot when it shows the whole interaction; include a viewport screenshot when layout context matters. Keep enough context to identify the tested feature. Do not fabricate successful UI or change product data merely to improve a screenshot.

Local developer screenshots are **unmasked by default** and stay outside Git, following [evidence storage](evidence-and-validation.md#retain-evidence-while-discovering-it). Do not apply automatic redaction to these previews. Capture intentionally; keep existing CI/real-site automatic screenshot and trace settings unchanged.

## Persist capture in the runner

Include capture at the meaningful checkpoints of the maintained site-specific CDP runner, with an explicit local evidence directory. Use stable state filenames and include run/build identity in the evidence index. For example, after asserting the intended dialog state:

```javascript
await dialog.screenshot({
  path: path.join(evidenceDir, "02-key-dialog.png"),
  animations: "disabled",
})
```

Create and verify the local evidence directory before execution. Record the view, target account/deployment, commit/build/extension ID, capture time, viewport and associated assertion result. Avoid overwriting a previous run's images when their evidence is still relevant. Screenshot capture failures must be visible; retain the test result and explain the missing preview.

## Show the developer the result

Inspect saved images with the available local-image tool (`view_image` in Codex) and return representative images through the tool's image output or inline Markdown images with absolute local paths. Include a short caption describing the observed state and a clickable artifact/index link; a path-only list is not a visual preview. Display during progress when useful and include the decisive preview in the final handoff when the client supports local images.

If the client cannot render local images, provide clickable PNG links and state that display limitation. If live access was unavailable, say which screenshot could not be obtained; a fixture or mocked screenshot must be labelled as such. Pictures complement behavior assertions and live readback; they do not establish authentication correctness, write preservation or cleanup alone.
