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
            break;
          }
          case 'newChat': {
            this.orchestrator.clearHistory();
            this.postStatus('Ready');
            break;
          }
          case 'openDataFolder': {
            try {
              const folder = await this.orchestrator.prepareDataFolder();
              await vscode.commands.executeCommand('revealFileInOS', folder);
            } catch (error: unknown) {
              const err = error instanceof Error ? error.message : String(error);
              this.postAssistantMessage(`Could not open the data folder: ${err}`);
            }
            break;
          }
        }
      },
      null,
      this.disposables
    );
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
      <button id="openDataFolder" class="secondary">Open data folder</button>
      <button id="refreshData" class="secondary">Refresh data</button>
      <button id="newChat" class="secondary">New chat</button>
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
