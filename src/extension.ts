import * as vscode from 'vscode';
import * as path from 'path';
import { ChatPanel } from './chatPanel';
import { createDataProvider, getConfiguredDataSource } from './dataProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('siauWeiChat.openChat', () => {
      ChatPanel.createOrShow(context);
    }),

    vscode.commands.registerCommand('siauWeiChat.syncData', async () => {
      const provider = createDataProvider(context, path.resolve(__dirname, '..'));

      try {
        const folder = await provider.prepareDataFolder();
        vscode.window.showInformationMessage(
          `Siau Wei AI Chatbot (${getConfiguredDataSource()}) data ready: ${folder.fsPath}`
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Siau Wei AI Chatbot data sync failed: ${message}`);
      }
    })
  );
}

export function deactivate() {}
