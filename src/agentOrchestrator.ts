import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CopilotClient } from './copilotClient';
import { ToolRunner } from './toolRunner';
import { DataProvider, createDataProvider, getConfiguredDataSource } from './dataProvider';

interface RouteDecision {
  route: 'lookup' | 'search' | 'analysis' | 'summary' | 'clarify';
  reason: string;
  suggestedTool: 'search_data.py' | 'analyze_data.py' | 'inspect_workbook.py' | 'none';
}

export interface OrchestratorResponse {
  answer: string;
  debug: unknown;
}

export class AgentOrchestrator {
  private readonly extensionRoot: string;
  private readonly workspaceRoot?: string;
  private readonly copilot: CopilotClient;
  private readonly tools: ToolRunner;

  constructor(private readonly context: vscode.ExtensionContext) {
    // __dirname is usually:
    // extension-root/out
    // so one level up is the installed extension/project root.
    this.extensionRoot = path.resolve(__dirname, '..');

    // This is the folder the user currently has open in VS Code.
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    this.copilot = new CopilotClient();

    // Tools live with the extension, not necessarily the open workspace.
    this.tools = new ToolRunner(this.extensionRoot);
  }

  /** Rebuilt per call so switching "siauWeiChat.dataSource" takes effect immediately. */
  private get dataProvider(): DataProvider {
    return createDataProvider(this.context, this.extensionRoot);
  }

  getDataFolderUri(): vscode.Uri {
    return this.dataProvider.getDataFolderUri();
  }

  /** Signs in and syncs when in SharePoint mode; validates the folder in local mode. */
  async prepareDataFolder(): Promise<vscode.Uri> {
    return this.dataProvider.prepareDataFolder();
  }

  async answer(question: string): Promise<OrchestratorResponse> {
    const dataSource = getConfiguredDataSource();
    const dataFolder = await this.prepareDataFolder();
    const dataArg = ['--data', dataFolder.fsPath];

    const [
      router,
      terms,
      discovery,
      searchAgent,
      analysisAgent,
      answerValidation,
      answerFormat,
      businessRules,
      questionTypes
    ] = await Promise.all([
      this.readText('agents/01-router.agent.md'),
      this.readText('agents/02-business-terms.agent.md'),
      this.readText('agents/03-file-discovery.agent.md'),
      this.readText('agents/04-data-search.agent.md'),
      this.readText('agents/05-data-analysis.agent.md'),
      this.readText('agents/06-answer-validation.agent.md'),
      this.readText('skills/answer-format.md'),
      this.readText('skills/business-rules.md'),
      this.readText('skills/excel-question-types.md')
    ]);

    const fileList = await this.tools.runTool('list_files.py', dataArg);
    const schema = await this.tools.runTool('inspect_workbook.py', dataArg);

    const routePrompt = `
${router}

${terms}

Known data files and schemas:
${safeJson(fileList.json ?? fileList.stdout)}
${safeJson(schema.json ?? schema.stdout)}

User question:
${question}

Return ONLY valid JSON with this shape:
{"route":"lookup|search|analysis|summary|clarify","reason":"short reason","suggestedTool":"search_data.py|analyze_data.py|inspect_workbook.py|none"}
`;

    const routeText = await this.copilot.ask(routePrompt);
    const route = parseJson<RouteDecision>(routeText) ?? fallbackRoute(question);

    let toolResult;

    if (route.suggestedTool === 'analyze_data.py' || route.route === 'analysis') {
      toolResult = await this.tools.runTool('analyze_data.py', [
        ...dataArg,
        '--question',
        question
      ]);
    } else if (route.suggestedTool === 'inspect_workbook.py' || route.route === 'summary') {
      toolResult = schema;
    } else if (route.route === 'clarify') {
      toolResult = {
        ok: true,
        stdout: '',
        stderr: '',
        json: { note: 'User question needs clarification.' }
      };
    } else {
      toolResult = await this.tools.runTool('search_data.py', [
        ...dataArg,
        '--question',
        question
      ]);
    }

    const finalPrompt = `
${answerValidation}

${answerFormat}

Business rules:
${businessRules}

Question types:
${questionTypes}

Relevant discovery guidance:
${discovery}

Relevant search guidance:
${searchAgent}

Relevant analysis guidance:
${analysisAgent}

Route decision:
${safeJson(route)}

Tool result:
${safeJson(toolResult.json ?? {
  stdout: toolResult.stdout,
  stderr: toolResult.stderr,
  ok: toolResult.ok
})}

User question:
${question}

Write the final answer for the user. Follow these rules:
- Be short and clear.
- If the data supports the answer, include the key number/value.
- Mention source file/sheet/row when available.
- If the data does not support the answer, say what is missing and ask one follow-up question.
- Do not invent data.
`;

    const answer = await this.copilot.ask(finalPrompt);

    return {
      answer,
      debug: {
        extensionRoot: this.extensionRoot,
        workspaceRoot: this.workspaceRoot,
        dataSource,
        dataFolder: dataFolder.fsPath,
        route,
        fileList: fileList.json,
        schema: schema.json,
        toolResult: toolResult.json ?? toolResult.stdout
      }
    };
  }

  private async readText(relativePath: string): Promise<string> {
    // agents and skills come from the installed extension folder
    const full = path.join(this.extensionRoot, relativePath);
    return fs.readFile(full, 'utf8');
  }
}

function safeJson(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJson<T>(text: string): T | undefined {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function fallbackRoute(question: string): RouteDecision {
  const q = question.toLowerCase();

  const analysisWords = [
    'most',
    'least',
    'count',
    'compare',
    'average',
    'total',
    'trend',
    'group',
    'summarize',
    'summary',
    'how many',
    'missing',
    'blank',
    'empty'
  ];

  if (analysisWords.some((word) => q.includes(word))) {
    return {
      route: 'analysis',
      reason: 'Question appears to need aggregation or calculation.',
      suggestedTool: 'analyze_data.py'
    };
  }

  return {
    route: 'search',
    reason: 'Question appears to need row/value lookup.',
    suggestedTool: 'search_data.py'
  };
}