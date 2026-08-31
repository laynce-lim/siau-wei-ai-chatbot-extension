import * as vscode from 'vscode';
import * as path from 'path';
import { ChatPanel } from './chatPanel';
import { ToolRunner } from './toolRunner';
import { createDataProvider, getConfiguredDataSource } from './dataProvider';

interface EnvironmentReport {
  ok?: boolean;
  python_version?: string;
  executable?: string;
  platform?: string;
  packages?: Record<string, { installed?: boolean; version?: string; error?: string; note?: string }>;
  missing?: string[];
  install_command?: string;
}

export function activate(context: vscode.ExtensionContext) {
  const extensionRoot = path.resolve(__dirname, '..');

  context.subscriptions.push(
    vscode.commands.registerCommand('siauWeiChat.openChat', () => {
      ChatPanel.createOrShow(context);
    }),

    vscode.commands.registerCommand('siauWeiChat.syncData', async () => {
      const provider = createDataProvider(context, extensionRoot);

      try {
        const folder = await provider.prepareDataFolder({ force: true });
        vscode.window.showInformationMessage(
          `Siau Wei AI Chatbot (${getConfiguredDataSource()}) data ready: ${folder.fsPath}`
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Siau Wei AI Chatbot data sync failed: ${message}`);
      }
    }),

    vscode.commands.registerCommand('siauWeiChat.checkSetup', () =>
      checkSetup(context, extensionRoot)
    ),

    vscode.commands.registerCommand('siauWeiChat.selectSource', async () => {
      ChatPanel.createOrShow(context);
      await ChatPanel.currentPanel?.pickSource();
    })
  );
}

async function checkSetup(context: vscode.ExtensionContext, extensionRoot: string): Promise<void> {
  const output = vscode.window.createOutputChannel('Siau Wei AI Chatbot');
  output.show(true);
  output.appendLine('Siau Wei AI Chatbot setup check');
  output.appendLine('='.repeat(40));

  const tools = new ToolRunner(extensionRoot);
  tools.resetPythonCache();

  const interpreter = await tools.getPythonExecutable();
  output.appendLine(`Extension folder : ${extensionRoot}`);
  output.appendLine(`Python resolved  : ${interpreter}`);

  const result = await tools.runTool('check_env.py');
  const report = (result.json ?? {}) as EnvironmentReport;

  if (!result.ok || !report.packages) {
    output.appendLine('');
    output.appendLine('Could not run the Python check.');
    output.appendLine(result.stderr || result.stdout || 'No output.');
    output.appendLine('');
    output.appendLine('Set "siauWeiChat.pythonPath" to a Python 3 executable and try again.');
    vscode.window.showErrorMessage('Siau Wei AI Chatbot: Python could not be run. See the output panel.');
    return;
  }

  output.appendLine(`Python version   : ${report.python_version}`);
  output.appendLine(`Platform         : ${report.platform}`);
  output.appendLine('');
  output.appendLine('Packages:');

  for (const [name, info] of Object.entries(report.packages)) {
    const status = info.installed ? `OK    ${info.version}` : 'MISSING';
    output.appendLine(`  ${name.padEnd(12)} ${status}${info.note ? `  (${info.note})` : ''}`);
  }

  output.appendLine('');
  output.appendLine(`Data source      : ${getConfiguredDataSource()}`);

  const provider = createDataProvider(context, extensionRoot);
  try {
    output.appendLine(`Data status      : ${await provider.describe()}`);
    const folder = await provider.prepareDataFolder();
    const files = await tools.runTool('list_files.py', ['--data', folder.fsPath]);
    const count = countDataFiles(files.json);
    output.appendLine(`Data files found : ${count === undefined ? 'unknown' : count}`);

    if (count === 0) {
      output.appendLine('  No CSV or Excel files were found in that folder.');
    }
  } catch (error: unknown) {
    output.appendLine(`Data status      : ${error instanceof Error ? error.message : String(error)}`);
  }

  output.appendLine('');

  if (report.missing?.length) {
    output.appendLine(`Missing packages: ${report.missing.join(', ')}`);
    output.appendLine(`Fix with: ${report.install_command}`);

    const choice = await vscode.window.showErrorMessage(
      `Siau Wei AI Chatbot is missing Python packages: ${report.missing.join(', ')}`,
      'Copy install command'
    );

    if (choice && report.install_command) {
      await vscode.env.clipboard.writeText(report.install_command);
      vscode.window.showInformationMessage('Install command copied to the clipboard.');
    }
    return;
  }

  output.appendLine('Setup looks good.');
  vscode.window.showInformationMessage('Siau Wei AI Chatbot: setup looks good.');
}

function countDataFiles(json: unknown): number | undefined {
  if (!json || typeof json !== 'object') {
    return undefined;
  }

  const files = (json as { files?: unknown }).files;
  return Array.isArray(files) ? files.length : undefined;
}

export function deactivate() {}
