import * as vscode from 'vscode';
import { AgentOrchestrator } from './agentOrchestrator';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly orchestrator: AgentOrchestrator;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
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
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.orchestrator = new AgentOrchestrator();

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
            try {
              const result = await this.orchestrator.answer(question);
              this.postAssistantMessage(result.answer, result.debug);
            } catch (error: unknown) {
              const err = error instanceof Error ? error.message : String(error);
              this.postAssistantMessage(`I ran into an error: ${err}`);
            } finally {
              this.postStatus('Ready');
            }
            break;
          }
          case 'openDataFolder': {
            await vscode.commands.executeCommand('revealFileInOS', this.orchestrator.getDataFolderUri());
            break;
          }
        }
      },
      null,
      this.disposables
    );
  }

  private postAssistantMessage(text: string, debug?: unknown) {
    this.panel.webview.postMessage({ command: 'answer', text, debug });
  }

  private postStatus(text: string) {
    this.panel.webview.postMessage({ command: 'status', text });
  }

  public dispose() {
    ChatPanel.currentPanel = undefined;
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
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
      </div>
      <button id="openDataFolder" class="secondary">Open data folder</button>
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
