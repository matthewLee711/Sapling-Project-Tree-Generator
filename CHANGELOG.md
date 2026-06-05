# Changelog

All notable changes to the **Project Tree Generator** extension will be documented in this file.

## [1.0.6] - 2026-06-05

### Added
- **Right-click context menu**: Right-click any file or directory in the tree to access exclusion options:
  - **Exclude (OR)** (`Ctrl+E`): Appends the name with `|` (pipe) to the regex — matches this name *or* previous patterns.
  - **Exclude (AND)** (`Ctrl+T`): Appends a lookahead group `(?=.*name)` — matches paths containing this name *and* previous patterns.
- Smart edge-case handling: when the regex input is empty, no leading `|` or unnecessary wrapping is added.
- File/directory names are automatically regex-escaped (e.g. `.gitignore` → `\.gitignore`).
- **Saved regex presets**: Click the 💾 button to save the current regex as a reusable chip below the input.
  - Click a chip to **append** its regex to the current filter.
  - Hover over a chip to reveal a `×` delete button.
  - Saved presets persist across webview reloads.

---

## [1.0.5] - 2026-05-29

### Added
- **"Collapse All / Open All" toggle**: The "Collapse All" button now switches to "Open All" after collapsing all directories. Pressing "Open All" expands every directory and toggles the button back.
- Toggle state persists across webview reloads via `vscode.setState()`.
- Manually expanding or collapsing an individual directory resets the button back to "Collapse All".

---

## [1.0.4] - 2026-05-28

### Added
- Added **"Hide Dot Folders"** toggle in the configuration panel.
- Added iteration-level pruning to skip dot-prefixed folders (e.g. `.git`, `.terraform`, `.vscode`, `.github`) for optimized performance and cleaner trees.
- Styled configuration toggles to display side-by-side (inline) in the webview to conserve sidebar real estate.

### Changed
- Changed default state to show all workspace files rather than applying standard gitignore overrides on startup.
- Set **"Hide Dot Folders"** state to default to `true` on extension startup.

---

## [1.0.0] - 2026-05-27

### Added
- **Activity Bar Integration**: Custom graph-style icon added to the VS Code sidebar activity pane.
- **Interactive Tree View**: Live directory browser inside the sidebar with expand/collapse folder animations.
- **Live Syncing**: Instanced `FileSystemWatcher` to sync file creations, deletions, and renames in real-time.
- **Copy to Clipboard**: One-click ASCII drawing generator using unicode line indicators (`├──` and `└──`).
- **Regex Exclusions**: Real-time regex pattern testing to filter out files and directories with instant error indicators.
- **State Preservation**: Cached local layout parameters (checkbox toggles, regex search inputs, folder folding states) across workspace focus events.
