import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as path from 'path';
import { DataProvider } from './dataProvider';
import { DataSourceConfig, browserUrlFor } from './sources';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = ['https://graph.microsoft.com/Sites.Read.All', 'offline_access'];
const DATA_EXTENSIONS = ['.csv', '.xlsx', '.xlsm', '.xlsb', '.xls'];
const MAX_FOLDER_DEPTH = 6;

interface SharePointSettings {
  siteUrl: string;
  driveName: string;
  folderPath: string;
  tenantId: string;
  clientId: string;
}

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

interface GraphList<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

interface CachedFile {
  eTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
}

type Manifest = Record<string, CachedFile>;

interface ManifestFile {
  syncedAt?: string;
  files: Manifest;
}

const SYNC_TTL_MS = 10 * 60 * 1000;

export class SharePointDataProvider implements DataProvider {
  public readonly kind = 'sharepoint' as const;
  private links = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    public readonly source: DataSourceConfig
  ) {}

  linkForFile(fileName: string): string | undefined {
    const target = fileName.toLowerCase();

    for (const [relativePath, url] of this.links) {
      if (relativePath.toLowerCase().endsWith(target)) {
        return url;
      }
    }

    return browserUrlFor(this.source);
  }

  getDataFolderUri(): vscode.Uri {
    return vscode.Uri.file(this.cacheFolder());
  }

  async prepareDataFolder(options?: { force?: boolean }): Promise<vscode.Uri> {
    const settings = readSettings(this.source);

    if (!settings.siteUrl) {
      throw new Error(
        `Source "${this.source.name}" has no siteUrl. ` +
          'Example: https://company.sharepoint.com/sites/TeamSite'
      );
    }

    const cacheFolder = this.cacheFolder();
    const stored = await this.readManifest();

    // Avoid re-downloading on every question in a conversation.
    if (!options?.force && stored.syncedAt && Object.keys(stored.files).length) {
      const age = Date.now() - Date.parse(stored.syncedAt);
      if (Number.isFinite(age) && age >= 0 && age < SYNC_TTL_MS) {
        return vscode.Uri.file(cacheFolder);
      }
    }

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Syncing SharePoint data...',
        cancellable: false
      },
      async (progress) => {
        const token = await this.getAccessToken(settings);

        progress.report({ message: 'Resolving site...' });
        const siteId = await resolveSiteId(token, settings.siteUrl);

        progress.report({ message: 'Resolving document library...' });
        const driveId = await resolveDriveId(token, siteId, settings.driveName);

        await fs.mkdir(cacheFolder, { recursive: true });

        const manifest = stored.files;
        const nextManifest: Manifest = {};

        progress.report({ message: 'Downloading files...' });
        await this.syncFolder({
          token,
          driveId,
          listUrl: buildChildrenUrl(driveId, settings.folderPath),
          relativePath: '',
          cacheFolder,
          manifest,
          nextManifest,
          depth: 0,
          progress
        });

        await this.removeStaleFiles(cacheFolder, nextManifest);
        await this.writeManifest(nextManifest);

        if (Object.keys(nextManifest).length === 0) {
          throw new Error(
            `No CSV or Excel files were found in SharePoint library "${settings.driveName}"` +
              (settings.folderPath ? ` under folder "${settings.folderPath}".` : '.')
          );
        }

        return vscode.Uri.file(cacheFolder);
      }
    );
  }

  async describe(): Promise<string> {
    const stored = await this.readManifest();
    const count = Object.keys(stored.files).length;

    if (!stored.syncedAt) {
      return `${this.source.name} — SharePoint, not synced yet`;
    }

    return `${this.source.name} — SharePoint, ${count} file${
      count === 1 ? '' : 's'
    }, synced ${describeAge(stored.syncedAt)}`;
  }

  private async getAccessToken(settings: SharePointSettings): Promise<string> {
    const scopes = [...GRAPH_SCOPES];

    // Non-secret routing hints supported by the built-in VS Code Microsoft provider.
    if (settings.tenantId) {
      scopes.push(`VSCODE_TENANT:${settings.tenantId}`);
    }
    if (settings.clientId) {
      scopes.push(`VSCODE_CLIENT_ID:${settings.clientId}`);
    }

    let session: vscode.AuthenticationSession | undefined;

    try {
      session = await vscode.authentication.getSession('microsoft', scopes, { createIfNone: true });
    } catch (error) {
      throw new Error(explainSignInFailure(error, settings));
    }

    if (!session?.accessToken) {
      throw new Error('Microsoft sign-in was cancelled or failed.');
    }

    return session.accessToken;
  }

  private cacheFolder(): string {
    const settings = readSettings(this.source);
    const key = crypto
      .createHash('sha256')
      .update(
        [
          settings.siteUrl.toLowerCase(),
          settings.driveName.toLowerCase(),
          settings.folderPath.toLowerCase()
        ].join('|')
      )
      .digest('hex')
      .slice(0, 16);

    return path.join(this.context.globalStorageUri.fsPath, 'sharepoint-cache', key, 'data');
  }

  private manifestPath(): string {
    // Kept beside the data folder so Python tools never see it.
    return path.join(path.dirname(this.cacheFolder()), 'sync-manifest.json');
  }

  private async readManifest(): Promise<ManifestFile> {
    try {
      const raw = await fs.readFile(this.manifestPath(), 'utf8');
      const parsed = JSON.parse(raw) as ManifestFile | Manifest;

      if (parsed && typeof parsed === 'object' && 'files' in parsed) {
        const typed = parsed as ManifestFile;
        return { syncedAt: typed.syncedAt, files: typed.files ?? {} };
      }

      // Manifests written before sync timestamps were recorded.
      return { files: (parsed as Manifest) ?? {} };
    } catch {
      return { files: {} };
    }
  }

  private async writeManifest(files: Manifest): Promise<void> {
    const target = this.manifestPath();
    const payload: ManifestFile = { syncedAt: new Date().toISOString(), files };
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
  }

  private async syncFolder(options: {
    token: string;
    driveId: string;
    listUrl: string;
    relativePath: string;
    cacheFolder: string;
    manifest: Manifest;
    nextManifest: Manifest;
    depth: number;
    progress: vscode.Progress<{ message?: string }>;
  }): Promise<void> {
    const { token, driveId, cacheFolder, manifest, nextManifest, progress } = options;

    if (options.depth > MAX_FOLDER_DEPTH) {
      return;
    }

    let url: string | undefined = options.listUrl;

    while (url) {
      const page: GraphList<DriveItem> = await graphGet<GraphList<DriveItem>>(url, token);

      for (const item of page.value ?? []) {
        if (item.folder) {
          await this.syncFolder({
            ...options,
            listUrl: `${GRAPH_ROOT}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
              item.id
            )}/children?$top=200&$select=id,name,size,eTag,webUrl,lastModifiedDateTime,folder,file,@microsoft.graph.downloadUrl`,
            relativePath: joinRelative(options.relativePath, item.name),
            depth: options.depth + 1
          });
          continue;
        }

        if (!item.file || !isDataFile(item.name)) {
          continue;
        }

        const relativePath = joinRelative(options.relativePath, item.name);
        const targetPath = safeJoin(cacheFolder, relativePath);
        const cached = manifest[relativePath];

        nextManifest[relativePath] = {
          eTag: item.eTag,
          size: item.size,
          lastModifiedDateTime: item.lastModifiedDateTime,
          webUrl: item.webUrl
        };

        if (item.webUrl) {
          this.links.set(relativePath, item.webUrl);
        }

        const unchanged =
          cached &&
          cached.eTag === item.eTag &&
          cached.size === item.size &&
          cached.lastModifiedDateTime === item.lastModifiedDateTime &&
          (await fileExists(targetPath));

        if (unchanged) {
          continue;
        }

        progress.report({ message: `Downloading ${relativePath}...` });
        await downloadDriveItem(token, driveId, item, targetPath);
      }

      url = page['@odata.nextLink'];
    }
  }

  private async removeStaleFiles(cacheFolder: string, manifest: Manifest): Promise<void> {
    const keep = new Set(
      Object.keys(manifest).map((relativePath) => safeJoin(cacheFolder, relativePath))
    );

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }

        if (isDataFile(entry.name) && !keep.has(full)) {
          await fs.rm(full, { force: true });
        }
      }
    };

    await walk(cacheFolder);
  }
}

function readSettings(source: DataSourceConfig): SharePointSettings {
  const config = vscode.workspace.getConfiguration('siauWeiChat');

  return {
    siteUrl: (source.siteUrl || '').trim(),
    driveName: (source.driveName || 'Documents').trim(),
    folderPath: (source.folderPath || '').trim(),
    // Auth identifiers stay global; they are per tenant, not per folder.
    tenantId: (config.get<string>('sharePoint.tenantId') || '').trim(),
    clientId: (config.get<string>('sharePoint.clientId') || '').trim()
  };
}

async function graphGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Microsoft Graph request failed (${response.status} ${response.statusText}). ${trimError(body)}`
    );
  }

  return (await response.json()) as T;
}

async function resolveSiteId(token: string, siteUrl: string): Promise<string> {
  let parsed: URL;

  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error(`"siauWeiChat.sharePoint.siteUrl" is not a valid URL: ${siteUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('"siauWeiChat.sharePoint.siteUrl" must use https.');
  }

  const sitePath = parsed.pathname.replace(/\/+$/, '');
  const endpoint =
    sitePath && sitePath !== '/'
      ? `${GRAPH_ROOT}/sites/${parsed.hostname}:${sitePath}`
      : `${GRAPH_ROOT}/sites/${parsed.hostname}`;

  const site = await graphGet<{ id: string }>(`${endpoint}?$select=id`, token);

  if (!site.id) {
    throw new Error(`Could not resolve SharePoint site: ${siteUrl}`);
  }

  return site.id;
}

async function resolveDriveId(
  token: string,
  siteId: string,
  driveName: string
): Promise<string> {
  const drives = await graphGet<GraphList<{ id: string; name: string }>>(
    `${GRAPH_ROOT}/sites/${encodeURIComponent(siteId)}/drives?$select=id,name`,
    token
  );

  const wanted = driveName.toLowerCase();
  const match = (drives.value ?? []).find((drive) => drive.name?.toLowerCase() === wanted);

  if (match) {
    return match.id;
  }

  const defaultDrive = await graphGet<{ id: string }>(
    `${GRAPH_ROOT}/sites/${encodeURIComponent(siteId)}/drive?$select=id`,
    token
  );

  if (!defaultDrive.id) {
    const available = (drives.value ?? []).map((drive) => drive.name).join(', ');
    throw new Error(
      `Document library "${driveName}" was not found. Available libraries: ${available || 'none'}`
    );
  }

  return defaultDrive.id;
}

function buildChildrenUrl(driveId: string, folderPath: string): string {
  const select =
    '$top=200&$select=id,name,size,eTag,webUrl,lastModifiedDateTime,folder,file,@microsoft.graph.downloadUrl';
  const base = `${GRAPH_ROOT}/drives/${encodeURIComponent(driveId)}/root`;
  const cleaned = normalizeRemotePath(folderPath);

  return cleaned
    ? `${base}:/${cleaned}:/children?${select}`
    : `${base}/children?${select}`;
}

function normalizeRemotePath(folderPath: string): string {
  return folderPath
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function downloadDriveItem(
  token: string,
  driveId: string,
  item: DriveItem,
  targetPath: string
): Promise<void> {
  const downloadUrl = item['@microsoft.graph.downloadUrl'];

  const response = downloadUrl
    ? await fetch(downloadUrl)
    : await fetch(
        `${GRAPH_ROOT}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
          item.id
        )}/content`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

  if (!response.ok) {
    throw new Error(
      `Failed to download "${item.name}" (${response.status} ${response.statusText}).`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
}

function isDataFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return DATA_EXTENSIONS.includes(ext);
}

function joinRelative(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Blocks path traversal from remote file names. */
function safeJoin(root: string, relativePath: string): string {
  const segments = relativePath
    .split('/')
    .map((segment) => segment.replace(/[\\/:*?"<>|]/g, '_').trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

  const resolved = path.resolve(root, ...segments);
  const rootResolved = path.resolve(root);

  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Rejected unsafe SharePoint file path: ${relativePath}`);
  }

  return resolved;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function trimError(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

/**
 * Entra returns these as opaque codes, so translate the ones that block this
 * extension into the action the user actually has to take.
 */
function explainSignInFailure(error: unknown, settings: SharePointSettings): string {
  const message = error instanceof Error ? error.message : String(error);
  const usingOwnApp = Boolean(settings.clientId);

  if (message.includes('AADSTS65002')) {
    return (
      'Microsoft blocked the sign-in because VS Code\'s built-in application is not ' +
      'pre-authorized to request SharePoint permissions (AADSTS65002). This cannot be ' +
      'fixed in the extension. Register your own Entra application, grant it the ' +
      'delegated Microsoft Graph permission "Sites.Read.All" with admin consent, add ' +
      'the redirect URI https://vscode.dev/redirect as a mobile/desktop platform, then ' +
      'set "siauWeiChat.sharePoint.clientId" and "siauWeiChat.sharePoint.tenantId".'
    );
  }

  if (message.includes('AADSTS65001') || message.includes('AADSTS90094')) {
    return (
      'Sign-in needs administrator consent for the SharePoint permission ' +
      `(${usingOwnApp ? 'your application' : 'the application'} has not been granted ` +
      'Sites.Read.All). Ask an administrator to grant admin consent for that permission.'
    );
  }

  if (message.includes('AADSTS700016') || message.includes('AADSTS90002')) {
    return (
      'The configured application or tenant was not found. Check ' +
      '"siauWeiChat.sharePoint.clientId" and "siauWeiChat.sharePoint.tenantId".'
    );
  }

  if (message.includes('AADSTS50011')) {
    return (
      'The redirect URI is not registered. Add https://vscode.dev/redirect to your ' +
      'Entra application under Authentication, as a Mobile and desktop platform.'
    );
  }

  return `Microsoft sign-in failed: ${message}`;
}

function describeAge(isoDate: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(isoDate)) / 60000);

  if (!Number.isFinite(minutes) || minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
