# Project Tree Generator VS Code Extension

An interactive VS Code extension that renders your workspace folder hierarchically inside the activity sidebar, allows you to dynamically filter files using glob-based rules or custom regular expressions, and exports clean text-based directory trees with a single click.

## Features

1. **Activity Bar Sidebar**: Contributes a custom icon directly to your VS Code left-hand sidebar navigation containing the layout interface.
2. **Interactive Directory Tree**: A clean visual explorer detailing directories and files. Click nodes to collapse and expand branches.
3. **Live Syncing**: Registers a `FileSystemWatcher` to detect directory updates, new files, and deletion events, automatically regenerating the visual layout.
4. **Copy to Clipboard**: Generates an ASCII tree structure utilizing standard trunk symbols (`├──` and `└──`) and copies it directly to your operating system clipboard.
5. **Ignore Rules**: 
   - Supports default ignoring of noise folders (e.g. `node_modules`, `.git`, `dist`, `.vscode`).
   - Automatically loads and applies pattern matching rules from `.gitignore` files at the root of your workspaces.
   - Toggles full file view when check-marking the "Show All Files" configuration.
6. **Regex Exclusions**: Add dynamic filter constraints on-the-fly (e.g. `\.test\.ts$|media` or `src/legacy`). Highlights invalid expressions in real-time.

---

## Folder Structure

```
tree-generator-extension/
├── .vscode/
│   ├── launch.json              # Launcher configuration for testing
│   └── tasks.json               # TypeScript watcher background runner
├── media/
│   ├── main.css                 # Webview layouts, CSS variables, and transitions
│   └── main.js                  # Frontend controllers and DOM generation
├── src/
│   ├── extension.ts             # Main entry point registering the provider
│   └── ProjectTreeProvider.ts   # Backend tree traverser, watcher, and clipboard integration
├── .gitignore                   # Extension ignore constraints
├── package.json                 # Extension settings, views, and configuration
├── tsconfig.json                # TypeScript settings
└── README.md                    # This documentation file
```

---

## How to Run & Test

1. Open the `tree-generator-extension` directory in VS Code.
2. Install the necessary development dependencies:
   ```bash
   npm install
   ```
3. Press `F5` or click **Run -> Start Debugging** in the menu bar.
4. A new **Extension Development Host** VS Code window will launch with the extension pre-installed.
5. Check your sidebar activity bar (look for the "Graph" icon) to test interactions.

---

## Architecture Details

- **VS Code Extension API Integration**: Implements `vscode.WebviewViewProvider` to feed an iframe-based interface with sandboxed scripts and styling.
- **Bi-directional Communication**: The webview uses `postMessage()` to dispatch configuration modifications and copy triggers to the host; the extension host replies with payload updates or regex compiling issues.
- **State Preservation**: The webview uses `acquireVsCodeApi().getState()` and `setState()` to preserve input values and folder collapse selections when switching tabs or toggling sidebar sections.
- **High-Performance Traversal**: Uses `vscode.workspace.fs.readDirectory` (remote-compatible) and ignores folders early (e.g. `node_modules`) to avoid processing heavy file structures unnecessarily.
