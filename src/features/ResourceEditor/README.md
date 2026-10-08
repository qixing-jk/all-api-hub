# Shared resource editor

The directory's `index.ts` explicitly exports the supported rendering and opening-feedback interfaces: `NativeResourceEditorBody`, `NativeResourceEditorLoadingSkeleton` and `useNativeResourceEditorLoadingVisibility`.

- `components/`: editor sections and native field controls.
- `model/`: field policies, contracts, editable projections and validation.
- `options/`: option loading and selection-token state.
- `opening/`: editor-opening state and loading feedback.

Consumers of the public rendering interfaces use the directory entrypoint. Internal modules and consumers of a specific policy import that module directly. The barrel does not export internal helpers and is not used inside this directory. Tests mirror the owning directories under `tests/features/ResourceEditor/`.
