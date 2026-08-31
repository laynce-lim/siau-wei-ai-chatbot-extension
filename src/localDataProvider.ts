import * as vscode from 'vscode';
import * as fsSync from 'fs';
import * as path from 'path';
import { DataProvider } from './dataProvider';
import { DataSourceConfig, browserUrlFor } from './sources';

export class LocalDataProvider implements DataProvider {
  public readonly kind = 'local' as const;

  constructor(
    private readonly extensionRoot: string,
    public readonly source: DataSourceConfig
  ) {}

  getDataFolderUri(): vscode.Uri {
    const configured = this.source.path?.trim() || 'data';

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
        `Folder not found for source "${this.source.name}": ${uri.fsPath}. ` +
          'Check the "path" for this entry in "siauWeiChat.sources".'
      );
    }

    return uri;
  }

  async describe(): Promise<string> {
    const count = this.countDataFiles();
    return `${this.source.name} — local folder, ${count === undefined ? 'unknown' : count} file${
      count === 1 ? '' : 's'
    }`;
  }

  linkForFile(fileName: string): string | undefined {
    const base = browserUrlFor(this.source);
    return base ? `${base.replace(/\/+$/, '')}/${encodeURIComponent(fileName)}` : undefined;
  }

  private countDataFiles(): number | undefined {
    const extensions = ['.csv', '.xlsx', '.xlsm', '.xlsb', '.xls'];

    try {
      return fsSync
        .readdirSync(this.getDataFolderUri().fsPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase()))
        .length;
    } catch {
      return undefined;
    }
  }
}
