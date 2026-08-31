import * as vscode from 'vscode';
import { LocalDataProvider } from './localDataProvider';
import { SharePointDataProvider } from './sharePointDataProvider';
import { DataSourceConfig, SourceKind, getActiveSource } from './sources';

export type DataSourceKind = SourceKind;

export interface DataProvider {
  readonly kind: DataSourceKind;
  readonly source: DataSourceConfig;

  /**
   * Folder the Python tools should read, without doing any network work.
   */
  getDataFolderUri(): vscode.Uri;

  /**
   * Makes sure the folder exists and is up to date, then returns it.
   */
  prepareDataFolder(options?: { force?: boolean }): Promise<vscode.Uri>;

  /**
   * Short line describing where data comes from and how fresh it is.
   */
  describe(): Promise<string>;

  /**
   * Link to a file for citation, when the source can provide one.
   */
  linkForFile?(fileName: string): string | undefined;
}

export function getConfiguredDataSource(): DataSourceKind {
  const value = vscode.workspace.getConfiguration('siauWeiChat').get<string>('dataSource');
  return value === 'sharepoint' ? 'sharepoint' : 'local';
}

export function createDataProvider(
  context: vscode.ExtensionContext,
  extensionRoot: string,
  source: DataSourceConfig = getActiveSource(context)
): DataProvider {
  return source.kind === 'sharepoint'
    ? new SharePointDataProvider(context, source)
    : new LocalDataProvider(extensionRoot, source);
}
