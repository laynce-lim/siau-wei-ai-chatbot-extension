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
  constructor(private readonly projectRoot: string) {}

  async runTool(toolName: string, args: string[] = []): Promise<ToolResult> {
    const toolPath = path.join(this.projectRoot, 'tools', toolName);

    if (!fs.existsSync(toolPath)) {
      return {
        ok: false,
        stdout: '',
        stderr: `Tool not found: ${toolPath}`
      };
    }

    const pythonExe = this.getPythonExecutable();

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

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        resolve({
          ok: false,
          stdout,
          stderr: error.message
        });
      });

      child.on('close', (code) => {
        const parsed = tryParseJson(stdout);

        resolve({
          ok: code === 0,
          stdout,
          stderr,
          json: parsed
        });
      });
    });
  }

  private getPythonExecutable(): string {
    const localVenvPython = path.join(
      this.projectRoot,
      '.venv',
      'Scripts',
      'python.exe'
    );

    if (fs.existsSync(localVenvPython)) {
      return localVenvPython;
    }

    return 'python';
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