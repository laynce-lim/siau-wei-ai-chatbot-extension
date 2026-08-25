import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ToolResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  json?: unknown;
}

export class ToolRunner {
  private cachedPython?: string;

  constructor(private readonly projectRoot: string) {}

  async runTool(
    toolName: string,
    args: string[] = [],
    token?: vscode.CancellationToken
  ): Promise<ToolResult> {
    const toolPath = path.join(this.projectRoot, 'tools', toolName);

    if (!fs.existsSync(toolPath)) {
      return {
        ok: false,
        stdout: '',
        stderr: `Tool not found: ${toolPath}`
      };
    }

    const pythonExe = await this.getPythonExecutable();

    return new Promise((resolve) => {
      const child = childProcess.spawn(
        pythonExe,
        [toolPath, ...args],
        {
          cwd: this.projectRoot,
          shell: false,
          windowsHide: true
        }
      );

      let stdout = '';
      let stderr = '';
      let settled = false;

      const cancelSubscription = token?.onCancellationRequested(() => {
        child.kill();
        finish({ ok: false, stdout, stderr: 'Cancelled.' });
      });

      function finish(result: ToolResult) {
        if (settled) {
          return;
        }
        settled = true;
        cancelSubscription?.dispose();
        resolve(result);
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        finish({
          ok: false,
          stdout,
          stderr:
            `${error.message}. Tried Python executable: ${pythonExe}. ` +
            'Set "siauWeiChat.pythonPath" to a Python that has pandas installed.'
        });
      });

      child.on('close', (code) => {
        finish({
          ok: code === 0,
          stdout,
          stderr,
          json: tryParseJson(stdout)
        });
      });
    });
  }

  /**
   * The packaged extension ships without a virtualenv, so search the open
   * workspace and the Python extension before falling back to bare "python".
   */
  async getPythonExecutable(): Promise<string> {
    if (this.cachedPython) {
      return this.cachedPython;
    }

    const configured = vscode.workspace
      .getConfiguration('siauWeiChat')
      .get<string>('pythonPath')
      ?.trim();

    if (configured) {
      this.cachedPython = configured;
      return configured;
    }

    const roots = [
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      this.projectRoot
    ];

    for (const root of roots) {
      for (const relative of [['.venv', 'Scripts', 'python.exe'], ['.venv', 'bin', 'python']]) {
        const candidate = path.join(root, ...relative);
        if (fs.existsSync(candidate)) {
          this.cachedPython = candidate;
          return candidate;
        }
      }
    }

    this.cachedPython = (await getPythonExtensionInterpreter()) || 'python';
    return this.cachedPython;
  }

  resetPythonCache(): void {
    this.cachedPython = undefined;
  }
}

async function getPythonExtensionInterpreter(): Promise<string | undefined> {
  try {
    const extension = vscode.extensions.getExtension('ms-python.python');
    if (!extension) {
      return undefined;
    }

    const api = extension.isActive ? extension.exports : await extension.activate();
    const resource = vscode.workspace.workspaceFolders?.[0]?.uri;

    const active = api?.environments?.getActiveEnvironmentPath?.(resource);
    if (active?.path) {
      const resolved = await api.environments.resolveEnvironment(active);
      return resolved?.executable?.uri?.fsPath ?? active.path;
    }

    const legacy = api?.settings?.getExecutionDetails?.(resource)?.execCommand;
    return Array.isArray(legacy) ? legacy[0] : undefined;
  } catch {
    return undefined;
  }
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return undefined;
      }
    }

    return undefined;
  }
}