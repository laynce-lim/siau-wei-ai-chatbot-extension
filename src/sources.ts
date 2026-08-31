import * as vscode from 'vscode';

export type SourceKind = 'local' | 'sharepoint';

export interface DataSourceConfig {
  name: string;
  kind: SourceKind;
  /** Local folder path. Absolute, or relative to the open workspace. */
  path?: string;
  siteUrl?: string;
  driveName?: string;
  folderPath?: string;
  /** Optional browser link, used by "Open in SharePoint". */
  webUrl?: string;
  description?: string;
}

const ACTIVE_SOURCE_KEY = 'siauWeiChat.activeSource';

function config() {
  return vscode.workspace.getConfiguration('siauWeiChat');
}

function normalize(raw: unknown, index: number): DataSourceConfig | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const entry = raw as Record<string, unknown>;
  const text = (key: string) => {
    const value = entry[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const explicitKind = text('kind');
  const siteUrl = text('siteUrl');
  const folder = text('path');

  // A SharePoint site URL is the only thing that requires the Graph path.
  const kind: SourceKind =
    explicitKind === 'sharepoint' || (!explicitKind && siteUrl && !folder) ? 'sharepoint' : 'local';

  const name = text('name') ?? `Source ${index + 1}`;

  if (kind === 'sharepoint' && !siteUrl) {
    return undefined;
  }
  if (kind === 'local' && !folder) {
    return undefined;
  }

  return {
    name,
    kind,
    path: folder,
    siteUrl,
    driveName: text('driveName') ?? 'Documents',
    folderPath: text('folderPath') ?? '',
    webUrl: text('webUrl'),
    description: text('description')
  };
}

/**
 * Returns the configured source list, falling back to the older single-source
 * settings so existing configurations keep working.
 */
export function listSources(): DataSourceConfig[] {
  const raw = config().get<unknown[]>('sources');
  const sources = Array.isArray(raw)
    ? raw.map(normalize).filter((entry): entry is DataSourceConfig => Boolean(entry))
    : [];

  if (sources.length) {
    return sources;
  }

  return [legacySource()];
}

function legacySource(): DataSourceConfig {
  const kind = config().get<string>('dataSource') === 'sharepoint' ? 'sharepoint' : 'local';

  if (kind === 'sharepoint') {
    const siteUrl = (config().get<string>('sharePoint.siteUrl') || '').trim();
    const folderPath = (config().get<string>('sharePoint.folderPath') || '').trim();

    return {
      name: folderPath || siteUrl || 'SharePoint',
      kind: 'sharepoint',
      siteUrl,
      driveName: (config().get<string>('sharePoint.driveName') || 'Documents').trim(),
      folderPath
    };
  }

  const folder = (config().get<string>('dataFolder') || 'data').trim();
  return { name: folder, kind: 'local', path: folder };
}

export function getActiveSource(context: vscode.ExtensionContext): DataSourceConfig {
  const sources = listSources();
  const savedName = context.globalState.get<string>(ACTIVE_SOURCE_KEY);
  return sources.find((source) => source.name === savedName) ?? sources[0];
}

export async function setActiveSource(
  context: vscode.ExtensionContext,
  name: string
): Promise<void> {
  await context.globalState.update(ACTIVE_SOURCE_KEY, name);
}

/** Best-effort browser link for a source, used by the Open in SharePoint action. */
export function browserUrlFor(source: DataSourceConfig): string | undefined {
  if (source.webUrl) {
    return source.webUrl;
  }

  if (source.kind !== 'sharepoint' || !source.siteUrl) {
    return undefined;
  }

  const site = source.siteUrl.replace(/\/+$/, '');
  if (!source.folderPath) {
    return site;
  }

  const encoded = source.folderPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${site}/Shared%20Documents/${encoded}`;
}
