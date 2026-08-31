import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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

export interface DiscoveredSubfolder {
  relativePath: string; // "" for root, "COR_SP", "WW27_DMR", etc.
  displayName: string;  // "All Files", "COR_SP", "WW27_DMR"
  fileCount: number;
}

const DATA_EXTENSIONS = new Set(['.csv', '.xlsx', '.xlsm', '.xlsb', '.xls']);

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
export function browserUrlFor(source: DataSourceConfig, subfolder: string = ''): string | undefined {
  if (source.webUrl) {
    const base = source.webUrl.replace(/\/+$/, '');
    if (!subfolder) {
      return base;
    }
    const encodedSub = subfolder
      .split(/[\\/]+/)
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${base}/${encodedSub}`;
  }

  if (source.kind !== 'sharepoint' || !source.siteUrl) {
    return undefined;
  }

  const site = source.siteUrl.replace(/\/+$/, '');
  const combinedPath = [source.folderPath, subfolder].filter(Boolean).join('/');

  if (!combinedPath) {
    return site;
  }

  const encoded = combinedPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${site}/Shared%20Documents/${encoded}`;
}

export function discoverSubfolders(rootPath: string): DiscoveredSubfolder[] {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const fileCounts = new Map<string, number>();

  function walk(dirPath: string, relativeDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    let directFileCount = 0;

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        walk(fullPath, childRelative);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (DATA_EXTENSIONS.has(ext)) {
          directFileCount++;
        }
      }
    }

    if (directFileCount > 0 || relativeDir === '') {
      fileCounts.set(relativeDir, directFileCount);
    }
  }

  walk(rootPath, '');

  const subfolders: DiscoveredSubfolder[] = [];

  for (const [relPath] of fileCounts) {
    let totalFiles = 0;
    for (const [otherRel, count] of fileCounts) {
      if (
        otherRel === relPath ||
        (relPath !== '' && (otherRel === relPath || otherRel.startsWith(relPath + '/')))
      ) {
        totalFiles += count;
      }
    }

    if (totalFiles > 0) {
      const displayName = relPath === '' ? 'All Files' : relPath.replace(/\//g, ' / ');
      subfolders.push({
        relativePath: relPath,
        displayName,
        fileCount: totalFiles
      });
    }
  }

  subfolders.sort((a, b) => {
    if (a.relativePath === '') return -1;
    if (b.relativePath === '') return 1;
    return a.relativePath.localeCompare(b.relativePath);
  });

  return subfolders;
}
