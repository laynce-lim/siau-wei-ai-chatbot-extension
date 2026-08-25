import * as vscode from 'vscode';
import { LocalDataProvider } from './localDataProvider';
import { SharePointDataProvider } from './sharePointDataProvider';

export type DataSourceKind = 'local' | 'sharepoint';

export interface DataProvider {
  readonly kind: DataSourceKind;

  /**
   * Folder the Python tools should read, without doing any network work.
   */
  getDataFolderUri(): vscode.Uri;

  /**
   * Makes sure the folder exists and is up to date, then returns it.
   */
  prepareDataFolder(): Promise<vscode.Uri>;
}

export function getConfiguredDataSource(): DataSourceKind {
  const value = vscode.workspace
    .getConfiguration('siauWeiChat')
    .get<string>('dataSource');

  return value === 'sharepoint' ? 'sharepoint' : 'local';
}

export function createDataProvider(
  context: vscode.ExtensionContext,
  extensionRoot: string
): DataProvider {
  if (getConfiguredDataSource() === 'sharepoint') {
    return new SharePointDataProvider(context);
  }

  return new LocalDataProvider(extensionRoot);
}
