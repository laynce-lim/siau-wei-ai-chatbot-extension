import * as vscode from 'vscode';
import * as fsSync from 'fs';
import * as path from 'path';
import { DataProvider } from './dataProvider';

export class LocalDataProvider implements DataProvider {
  public readonly kind = 'local' as const;

  constructor(private readonly extensionRoot: string) {}

  getDataFolderUri(): vscode.Uri {
    const configured =
      vscode.workspace.getConfiguration('siauWeiChat').get<string>('dataFolder') || 'data';

    if (path.isAbsolute(configured)) {
      return vscode.Uri.file(configured);
    }

    // Prefer data from the folder the user currently has open in VS Code.
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspaceRoot) {
      const workspaceDataFolder = path.join(workspaceRoot, configured);

      if (fsSync.existsSync(workspaceDataFolder)) {
        return vscode.Uri.file(workspaceDataFolder);
      }
    }

    // Fallback to the installed extension data folder.
    return vscode.Uri.file(path.join(this.extensionRoot, configured));
  }

  async prepareDataFolder(): Promise<vscode.Uri> {
    const uri = this.getDataFolderUri();

    if (!fsSync.existsSync(uri.fsPath)) {
      throw new Error(
        `Local data folder not found: ${uri.fsPath}. ` +
          `Set "siauWeiChat.dataFolder", or set "siauWeiChat.dataSource" to "sharepoint".`
      );
    }

    return uri;
  }
}
