import * as vscode from 'vscode';
import { ProjectTreeProvider } from './ProjectTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    // Instantiate our project tree provider
    const provider = new ProjectTreeProvider(context.extensionUri);

    // Register it to the webview view ID defined in package.json
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ProjectTreeProvider.viewType,
            provider
        )
    );
}

export function deactivate() {}
