import * as vscode from 'vscode';
import { AgentOrchestrator } from './agentOrchestrator';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly orchestrator: AgentOrchestrator;
  private disposables: vscode.Disposable[] = [];
  private activeRequest?: vscode.CancellationTokenSource;

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'siauWeiAiChatbot',
      'Siau Wei AI Chatbot',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(context.globalStorageUri, 'charts')
        ]
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionUri = context.extensionUri;
    this.orchestrator = new AgentOrchestrator(context);

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('siauWeiChat')) {
          this.postSubfolders();
          this.orchestrator.describeDataSource().then((d) => this.postDataStatus(d));
        }
      })
    );

    this.panel.webview.onDidReceiveMessage(
      async (message: { command: string; text?: string }) => {
        switch (message.command) {
          case 'ask': {
            const question = String(message.text || '').trim();
            if (!question) {
              this.postAssistantMessage('Please enter a question first.');
              return;
            }

            this.postStatus('Thinking...');
            this.activeRequest?.cancel();
            const source = new vscode.CancellationTokenSource();
            this.activeRequest = source;

            try {
              const result = await this.orchestrator.answer(question, {
                token: source.token,
                onStep: (text) => this.panel.webview.postMessage({ command: 'step', text }),
                onFragment: (fragment) =>
                  this.panel.webview.postMessage({ command: 'answerChunk', text: fragment })
              });

              if (!source.token.isCancellationRequested) {
                this.postAssistantMessage(result.answer, result.debug, result.chartPath);
              }
            } catch (error: unknown) {
              const err = error instanceof Error ? error.message : String(error);
              if (!source.token.isCancellationRequested) {
                this.postAssistantMessage(`I ran into an error: ${err}`);
              }
            } finally {
              source.dispose();
              if (this.activeRequest === source) {
                this.activeRequest = undefined;
              }
              this.postStatus('Ready');
            }
            break;
          }
          case 'stop': {
            this.activeRequest?.cancel();
            this.panel.webview.postMessage({ command: 'stopped' });
            this.postStatus('Ready');
            break;
          }
          case 'refreshData': {
            this.postStatus('Refreshing data...');
            try {
              const description = await this.orchestrator.refreshData();
              this.postDataStatus(description);
              await this.postSubfolders();
            } catch (error: unknown) {
              const err = error instanceof Error ? error.message : String(error);
              this.postAssistantMessage(`Could not refresh the data: ${err}`);
            } finally {
              this.postStatus('Ready');
            }
            break;
          }
          case 'ready': {
            this.postDataStatus(await this.orchestrator.describeDataSource());
            await this.postSubfolders();
            break;
          }
          case 'selectSource': {
            const value = (message as { name?: string; value?: string }).value ?? (message as { name?: string }).name;
            if (value) {
              const parts = value.split('||');
              const sourceName = parts[0];
              const subfolder = parts[1] ?? '';

              this.postStatus('Switching source...');
              try {
                if (sourceName !== this.orchestrator.activeSource.name) {
                  await this.orchestrator.selectSource(sourceName);
                }
                const description = await this.orchestrator.selectSubfolder(subfolder);
                this.postDataStatus(description);
                await this.postSubfolders();
              } catch (error: unknown) {
                const err = error instanceof Error ? error.message : String(error);
                this.postAssistantMessage(`Could not switch data source: ${err}`);
              } finally {
                this.postStatus('Ready');
              }
            }
            break;
          }
          case 'newChat': {
            this.orchestrator.clearHistory();
            this.postStatus('Ready');
            break;
          }
          case 'openDataFolder': {
            const url = this.orchestrator.browserUrl();

            if (url) {
              await vscode.env.openExternal(vscode.Uri.parse(url));
              break;
            }

            try {
              const folder = await this.orchestrator.prepareDataFolder();
              await vscode.commands.executeCommand('revealFileInOS', folder);
            } catch (error: unknown) {
              const err = error instanceof Error ? error.message : String(error);
              this.postAssistantMessage(`Could not open the data folder: ${err}`);
            }
            break;
          }
          case 'pickSource': {
            await this.pickSource();
            break;
          }
        }
      },
      null,
      this.disposables
    );
  }

  public async pickSource(): Promise<void> {
    const sources = this.orchestrator.listSources();

    const items: Array<vscode.QuickPickItem & { sourceName: string; subfolder: string }> = [];

    for (const source of sources) {
      const subfolders = await this.orchestrator.discoverSubfoldersForSource(source);
      for (const sub of subfolders) {
        const isCurrent =
          source.name === this.orchestrator.activeSource.name &&
          sub.relativePath === this.orchestrator.activeSubfolder;

        const isRoot = sub.relativePath === '';
        const label = isCurrent
          ? `$(check) ${isRoot ? source.name : sub.displayName}`
          : isRoot
          ? source.name
          : `📁 ${sub.displayName}`;

        items.push({
          label,
          description: isRoot
            ? `${source.kind === 'sharepoint' ? 'SharePoint' : 'Local'} (${sub.fileCount} files)`
            : `${sub.fileCount} file${sub.fileCount === 1 ? '' : 's'}`,
          detail: source.description ?? source.path ?? source.folderPath ?? source.siteUrl,
          sourceName: source.name,
          subfolder: sub.relativePath
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage('No data sources or folders found.');
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Select the folder / source to ask questions about',
      matchOnDetail: true
    });

    if (!picked) {
      return;
    }

    this.postStatus('Switching source...');
    try {
      if (picked.sourceName !== this.orchestrator.activeSource.name) {
        await this.orchestrator.selectSource(picked.sourceName);
      }
      this.postDataStatus(await this.orchestrator.selectSubfolder(picked.subfolder));
      await this.postSubfolders();
    } finally {
      this.postStatus('Ready');
    }
  }

  private postAssistantMessage(text: string, debug?: unknown, chartPath?: string) {
    const chart = chartPath
      ? this.panel.webview.asWebviewUri(vscode.Uri.file(chartPath)).toString()
      : undefined;

    this.panel.webview.postMessage({ command: 'answer', text, debug, chart });
  }

  private postStatus(text: string) {
    this.panel.webview.postMessage({ command: 'status', text });
  }

  private postDataStatus(text: string) {
    this.panel.webview.postMessage({ command: 'dataStatus', text });
  }

  private async postSubfolders() {
    const sources = this.orchestrator.listSources();
    const activeSource = this.orchestrator.activeSource;
    const activeSubfolder = this.orchestrator.activeSubfolder;

    const groups = await Promise.all(
      sources.map(async (source) => {
        const subfolders = await this.orchestrator.discoverSubfoldersForSource(source);
        return {
          sourceName: source.name,
          options: subfolders.map((sub) => {
            const value = `${source.name}||${sub.relativePath}`;
            const isRoot = sub.relativePath === '';
            const label = isRoot
              ? `${source.name} (All ${sub.fileCount} file${sub.fileCount === 1 ? '' : 's'})`
              : `📁 ${sub.displayName} (${sub.fileCount} file${sub.fileCount === 1 ? '' : 's'})`;
            return { label, value, subfolder: sub.relativePath };
          })
        };
      })
    );

    const activeValue = `${activeSource.name}||${activeSubfolder}`;

    this.panel.webview.postMessage({
      command: 'sources',
      groups,
      active: activeValue
    });
  }

  public dispose() {
    ChatPanel.currentPanel = undefined;
    this.activeRequest?.cancel();
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Siau Wei AI Chatbot</title>
</head>
<body>
  <main class="app">
    <header class="header">
      <div>
        <h1>Siau Wei AI Chatbot</h1>
        <p>Ask questions about Excel or CSV files in this VS Code workspace.</p>
        <p id="dataStatus" class="data-status">Checking data source...</p>
      </div>
      <div class="header-actions">
        <div class="source-picker-wrapper">
          <label for="sourceSelect" class="source-label">Folder / Source:</label>
          <select id="sourceSelect" class="source-select">
            <option value="">Loading sources...</option>
          </select>
        </div>
        <button id="openDataFolder" class="secondary">Open source</button>
        <button id="refreshData" class="secondary">Refresh data</button>
        <button id="newChat" class="secondary">New chat</button>
      </div>
    </header>

    <section id="messages" class="messages">
      <div class="message assistant">
        <div class="avatar">AI</div>
        <div class="bubble">
          Hi! Ask me something like <strong>Which PM has the most delayed orders?</strong> or <strong>What is the status of order 12345?</strong>
        </div>
      </div>
    </section>

    <footer class="composer">
      <textarea id="question" rows="3" placeholder="Ask a question about the data..."></textarea>
      <div class="composer-actions">
        <span id="status">Ready</span>
        <button id="stop" class="secondary" disabled>Stop</button>
        <button id="send">Send</button>
      </div>
    </footer>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
