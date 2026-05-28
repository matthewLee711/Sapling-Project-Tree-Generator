import * as vscode from 'vscode';
import * as path from 'path';

interface ITreeNode {
    name: string;
    relativePath: string;
    absolutePath: string;
    isDirectory: boolean;
    children?: ITreeNode[];
}

interface TreeConfig {
    hideFiles: boolean;
    hideDotDirs: boolean;
    excludeRegex: string;
}

export class ProjectTreeProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sapling-project-tree-view';
    private _view?: vscode.WebviewView;
    private _watcher?: vscode.FileSystemWatcher;
    private _config: TreeConfig = {
        hideFiles: false,
        hideDotDirs: true,
        excludeRegex: ''
    };
    private _debounceTimeout?: NodeJS.Timeout;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        this._startWatcher();
                        this.sendTreeData();
                        break;
                    case 'configChanged':
                        this._config = message.config;
                        this.sendTreeData();
                        break;
                    case 'copyRequest':
                        await this._handleCopyRequest();
                        break;
                }
            },
            null,
            this._disposables
        );

        // Rebuild on active workspace changes
        this._disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this._startWatcher();
                this.sendTreeData();
            })
        );
    }

    private _startWatcher() {
        if (this._watcher) {
            this._watcher.dispose();
        }

        // Watch all files and directories in workspace
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        const changeHandler = () => this._triggerUpdate();
        this._watcher.onDidCreate(changeHandler);
        this._watcher.onDidDelete(changeHandler);
        this._watcher.onDidChange(changeHandler);
    }

    private _triggerUpdate() {
        if (this._debounceTimeout) {
            clearTimeout(this._debounceTimeout);
        }
        this._debounceTimeout = setTimeout(() => {
            this.sendTreeData();
        }, 300);
    }

    public async sendTreeData() {
        if (!this._view) {
            return;
        }

        try {
            // Validate regex beforehand if specified
            let compiledRegex: RegExp | null = null;
            if (this._config.excludeRegex) {
                try {
                    compiledRegex = new RegExp(this._config.excludeRegex);
                    this._view.webview.postMessage({ type: 'regexValid' });
                } catch (e: any) {
                    this._view.webview.postMessage({ 
                        type: 'regexError', 
                        message: e.message || 'Invalid Regular Expression' 
                    });
                }
            } else {
                this._view.webview.postMessage({ type: 'regexValid' });
            }

            const tree = await this._buildWorkspaceTree(compiledRegex);
            this._view.webview.postMessage({
                type: 'updateTree',
                tree: tree
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to generate project tree: ${err.message}`);
        }
    }

    private async _buildWorkspaceTree(customRegex: RegExp | null): Promise<ITreeNode[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return [];
        }

        const roots: ITreeNode[] = [];
        for (const folder of folders) {
            const rootNode = await this._traverseDirectory(folder.uri, folder.name, '', customRegex);
            if (rootNode) {
                roots.push(rootNode);
            }
        }
        return roots;
    }

    private async _traverseDirectory(
        dirUri: vscode.Uri,
        name: string,
        relativePath: string,
        customRegex: RegExp | null
    ): Promise<ITreeNode | null> {
        // Check custom regex matches on the folder/file relative path
        if (customRegex && relativePath && customRegex.test(relativePath)) {
            return null;
        }

        const node: ITreeNode = {
            name: name,
            relativePath: relativePath,
            absolutePath: dirUri.fsPath,
            isDirectory: true,
            children: []
        };

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            
            // Sort: Directories first, then files, both alphabetically
            entries.sort((a, b) => {
                if (a[1] !== b[1]) {
                    return b[1] === vscode.FileType.Directory ? 1 : -1;
                }
                return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
            });

            for (const [entryName, entryType] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, entryName);
                const childRelativePath = relativePath ? `${relativePath}/${entryName}` : entryName;

                if (entryType === vscode.FileType.Directory) {
                    // Skip dot-prefixed directories if "Hide Dot Folders" toggle is active
                    if (this._config.hideDotDirs && entryName.startsWith('.')) {
                        continue;
                    }

                    const childNode = await this._traverseDirectory(childUri, entryName, childRelativePath, customRegex);
                    if (childNode) {
                        node.children?.push(childNode);
                    }
                } else if (entryType === vscode.FileType.File) {
                    // Skip files if "Hide Files" toggle is active (should only show directories)
                    if (this._config.hideFiles) {
                        continue;
                    }

                    if (customRegex && customRegex.test(childRelativePath)) {
                        continue;
                    }

                    node.children?.push({
                        name: entryName,
                        relativePath: childRelativePath,
                        absolutePath: childUri.fsPath,
                        isDirectory: false
                    });
                }
            }
        } catch (e) {
            // Permission issues or folder missing, return node with empty/limited children
        }

        return node;
    }

    private async _handleCopyRequest() {
        try {
            let compiledRegex: RegExp | null = null;
            if (this._config.excludeRegex) {
                try {
                    compiledRegex = new RegExp(this._config.excludeRegex);
                } catch (e) {}
            }

            const roots = await this._buildWorkspaceTree(compiledRegex);
            if (roots.length === 0) {
                vscode.window.showWarningMessage('The generated tree is empty. Nothing to copy.');
                return;
            }

            let textTree = '';
            for (let i = 0; i < roots.length; i++) {
                textTree += this._generateAsciiTree(roots[i], '', true, true);
                if (i < roots.length - 1) {
                    textTree += '\n'; // separate multiple workspace roots
                }
            }

            await vscode.env.clipboard.writeText(textTree);
            vscode.window.showInformationMessage('Project tree copied to clipboard!');
            
            // Notify frontend so it can render a success state
            this._view?.webview.postMessage({ type: 'copySuccess' });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to copy tree: ${err.message}`);
        }
    }

    private _generateAsciiTree(node: ITreeNode, prefix: string, isLast: boolean, isRoot: boolean): string {
        let result = '';
        if (isRoot) {
            result += `${node.name}/\n`;
        } else {
            result += `${prefix}${isLast ? '└── ' : '├── '}${node.name}${node.isDirectory ? '/' : ''}\n`;
        }

        if (node.children && node.children.length > 0) {
            const nextPrefix = isRoot ? '' : (prefix + (isLast ? '    ' : '│   '));
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const lastChild = i === node.children.length - 1;
                result += this._generateAsciiTree(child, nextPrefix, lastChild, false);
            }
        }
        return result;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Resolve assets paths
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        // Use a nonce to restrict scripts to only ours
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Project Tree Generator</title>
</head>
<body>
    <div class="container">
        <header class="header">
            <h3>Tree Settings</h3>
        </header>

        <section class="controls">
            <div class="checkbox-row">
                <div class="checkbox-group">
                    <label class="switch">
                        <input type="checkbox" id="hide-files-toggle">
                        <span class="slider"></span>
                    </label>
                    <span class="control-label">Hide Files</span>
                </div>
                <div class="checkbox-group">
                    <label class="switch">
                        <input type="checkbox" id="hide-dot-dirs-toggle">
                        <span class="slider"></span>
                    </label>
                    <span class="control-label">Hide Dot Folders</span>
                </div>
            </div>

            <div class="control-group">
                <label for="exclude-regex" class="field-label">Exclude Regex Filter</label>
                <div class="input-container">
                    <input type="text" id="exclude-regex" placeholder="e.g. \\.test\\.ts$|temp" spellcheck="false">
                    <span id="regex-error-indicator" class="error-indicator" title="Invalid regular expression">⚠️</span>
                </div>
                <div id="regex-error-msg" class="error-message"></div>
            </div>

            <button id="copy-btn" class="btn btn-primary">
                <span class="icon">📋</span> Copy Tree to Clipboard
            </button>
        </section>

        <hr class="divider">

        <section class="tree-section">
            <div class="tree-header">
                <h4>Live Tree Preview</h4>
                <button id="collapse-all-btn" class="btn btn-secondary btn-small" title="Collapse All">Collapse All</button>
            </div>
            <div id="tree-container" class="tree-container">
                <div class="loading">Loading workspace files...</div>
            </div>
        </section>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        if (this._watcher) {
            this._watcher.dispose();
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
