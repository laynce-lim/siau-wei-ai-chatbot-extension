import * as vscode from 'vscode';

export class CopilotClient {
  async ask(
    prompt: string,
    token?: vscode.CancellationToken,
    onFragment?: (fragment: string) => void
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration('siauWeiChat');
    const vendor = config.get<string>('modelVendor') || 'copilot';
    const family = config.get<string>('modelFamily') || 'gpt-4o';

    let models = await vscode.lm.selectChatModels({ vendor, family });
    if (!models.length) {
      models = await vscode.lm.selectChatModels({ vendor });
    }
    if (!models.length) {
      models = await vscode.lm.selectChatModels({});
    }
    if (!models.length) {
      throw new Error('No VS Code language model is available. Make sure GitHub Copilot/model access is enabled in VS Code.');
    }

    const source = token ? undefined : new vscode.CancellationTokenSource();
    const activeToken = token ?? source!.token;

    try {
      const model = models[0];
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const response = await model.sendRequest(messages, {}, activeToken);

      let text = '';
      for await (const fragment of response.text) {
        if (activeToken.isCancellationRequested) {
          break;
        }
        text += fragment;
        onFragment?.(fragment);
      }
      return text.trim();
    } finally {
      source?.dispose();
    }
  }
}
