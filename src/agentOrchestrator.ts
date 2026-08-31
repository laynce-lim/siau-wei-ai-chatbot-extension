import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CopilotClient } from './copilotClient';
import { ToolRunner, ToolResult } from './toolRunner';
import { DataProvider, createDataProvider, getConfiguredDataSource } from './dataProvider';
import {
  DataSourceConfig,
  DiscoveredSubfolder,
  browserUrlFor,
  discoverSubfolders,
  getActiveSource,
  listSources,
  setActiveSource
} from './sources';

type PlanMode = 'query' | 'trend' | 'join' | 'chart' | 'clarify';

interface QueryFilter {
  column: string;
  op: string;
  value?: unknown;
}

interface QueryPlan {
  table?: string | null;
  filters?: QueryFilter[];
  group_by?: string | string[] | null;
  metric?: { op?: string | null; column?: string | null } | null;
  sort?: { by?: string | null; direction?: string | null } | null;
  limit?: number | null;
  columns?: string[] | null;
}

interface AgentPlan {
  mode: PlanMode;
  reason?: string;
  plan?: QueryPlan;
  trend?: {
    dateColumn?: string | null;
    valueColumn?: string | null;
    groupBy?: string | null;
    freq?: string | null;
  };
  join?: { left?: string | null; right?: string | null; key?: string | null };
  chart?: {
    chartType?: string | null;
    groupBy?: string | null;
    valueColumn?: string | null;
    dateColumn?: string | null;
    freq?: string | null;
  };
  clarifyQuestion?: string;
}

interface Turn {
  question: string;
  answer: string;
}

export interface AnswerOptions {
  onStep?: (text: string) => void;
  onFragment?: (fragment: string) => void;
  token?: vscode.CancellationToken;
}

export interface OrchestratorResponse {
  answer: string;
  chartPath?: string;
  debug: unknown;
}

const HISTORY_TURNS = 4;
const PROFILE_TTL_MS = 5 * 60 * 1000;

export class AgentOrchestrator {
  private readonly extensionRoot: string;
  private readonly workspaceRoot?: string;
  private readonly copilot: CopilotClient;
  private readonly tools: ToolRunner;
  private history: Turn[] = [];
  private profileCache?: { folder: string; at: number; json: unknown };
  private _activeSubfolder: string = '';

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

  get activeSource(): DataSourceConfig {
    return getActiveSource(this.context);
  }

  get activeSubfolder(): string {
    return this._activeSubfolder;
  }

  listSources(): DataSourceConfig[] {
    return listSources();
  }

  /** Switching source invalidates the cached profile, which is per folder. */
  async selectSource(name: string): Promise<string> {
    await setActiveSource(this.context, name);
    this._activeSubfolder = '';
    this.profileCache = undefined;
    this.history = [];
    return this.describeDataSource();
  }

  async selectSubfolder(subfolder: string): Promise<string> {
    this._activeSubfolder = subfolder;
    this.profileCache = undefined;
    this.history = [];
    return this.describeDataSource();
  }

  browserUrl(): string | undefined {
    return browserUrlFor(this.activeSource, this._activeSubfolder);
  }

  getDataFolderUri(): vscode.Uri {
    const baseUri = this.dataProvider.getDataFolderUri();
    if (this._activeSubfolder) {
      return vscode.Uri.file(path.join(baseUri.fsPath, ...this._activeSubfolder.split('/')));
    }
    return baseUri;
  }

  /** Signs in and syncs when in SharePoint mode; validates the folder in local mode. */
  async prepareDataFolder(options?: { force?: boolean }): Promise<vscode.Uri> {
    const baseUri = await this.dataProvider.prepareDataFolder(options);
    if (this._activeSubfolder) {
      return vscode.Uri.file(path.join(baseUri.fsPath, ...this._activeSubfolder.split('/')));
    }
    return baseUri;
  }

  async describeDataSource(): Promise<string> {
    try {
      const baseDesc = await this.dataProvider.describe();
      if (this._activeSubfolder) {
        return `${this.activeSource.name} / ${this._activeSubfolder.replace(/\//g, ' / ')} — ${baseDesc}`;
      }
      return baseDesc;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  async discoverSubfoldersForSource(source?: DataSourceConfig): Promise<DiscoveredSubfolder[]> {
    try {
      const provider = createDataProvider(this.context, this.extensionRoot, source ?? this.activeSource);
      const uri = await provider.prepareDataFolder();
      return discoverSubfolders(uri.fsPath);
    } catch {
      return [];
    }
  }

  /** Forces a re-sync and drops cached profiling so the next answer sees new data. */
  async refreshData(): Promise<string> {
    this.profileCache = undefined;
    await this.prepareDataFolder({ force: true });
    return this.describeDataSource();
  }

  /** Charts are written outside the data folder so tools never re-read them as data. */
  get chartFolder(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'charts');
  }

  async answer(question: string, options: AnswerOptions = {}): Promise<OrchestratorResponse> {
    const { onStep, onFragment, token } = options;
    const step = (text: string) => onStep?.(text);
    const dataSource = getConfiguredDataSource();

    step('Preparing data...');
    const dataFolder = await this.prepareDataFolder();
    const dataArg = ['--data', dataFolder.fsPath];

    const [
      router,
      terms,
      discovery,
      searchAgent,
      analysisAgent,
      answerValidation,
      trendAgent,
      joinAgent,
      chartAgent,
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
      this.readText('agents/07-trend-analysis.agent.md'),
      this.readText('agents/08-cross-file-join.agent.md'),
      this.readText('agents/09-chart-generation.agent.md'),
      this.readText('skills/answer-format.md'),
      this.readText('skills/business-rules.md'),
      this.readText('skills/excel-question-types.md')
    ]);

    step('Reading the columns and values in your files...');
    const profile = await this.getProfile(dataFolder.fsPath, dataArg, token);

    throwIfCancelled(token);

    step('Working out how to answer...');
    const planPrompt = `
${router}

${terms}

You translate a business question into a machine-readable plan. You never answer
the question here.

Data profile. These are the real files, columns and values available right now:
${safeJson(profile)}

${formatHistory(this.history)}

User question:
${question}

Return ONLY valid JSON:
{
  "mode": "query|trend|join|chart|clarify",
  "reason": "one short sentence",
  "plan": {
    "table": null,
    "filters": [{"column": "exact column name", "op": "eq", "value": "..."}],
    "group_by": null,
    "metric": {"op": "count", "column": null},
    "sort": {"by": null, "direction": "desc"},
    "limit": 25,
    "columns": null
  },
  "trend": {"dateColumn": null, "valueColumn": null, "groupBy": null, "freq": null},
  "join": {"left": null, "right": null, "key": null},
  "chart": {"chartType": null, "groupBy": null, "valueColumn": null, "dateColumn": null, "freq": null},
  "clarifyQuestion": null
}

Rules:
- Use "query" for almost everything: lookups, filters, counts, rankings, comparisons, data quality.
- Use "trend" only for change over time, "join" only to link two files, "chart" only when a visual is asked for.
- Use "clarify" only when the profile genuinely cannot support the question. Prefer a best-effort query.
- Every "column" and "table" value MUST be copied exactly from the data profile above. Never invent one.
- Translate business language into real values. Interpret vague words using the profile:
  a word like "underutilized" becomes a numeric threshold on a real numeric column;
  a phrase like "no owner" becomes {"op": "is_blank"} on the owner column.
- Valid filter ops: eq, ne, contains, not_contains, starts_with, ends_with, in, not_in,
  gt, gte, lt, lte, between, is_blank, not_blank.
- "between" takes a two-item list value. "in"/"not_in" take a list value.
- Valid metric ops: count, sum, avg, min, max, distinct_count, none.
- Use "none" as the metric op and set "columns" when the user wants to see rows rather than a number.
- Set "group_by" when the user asks per/by/each/breakdown/which-has-most.
- Resolve follow-up questions using the conversation above.
`;

    const planText = await this.copilot.ask(planPrompt, token);
    let plan = parseJson<AgentPlan>(planText) ?? fallbackPlan(question);
    step(describePlan(plan));

    throwIfCancelled(token);

    let toolResult = await this.execute(plan, question, dataArg, token);
    let retryReason = needsRetry(plan.mode, toolResult.json);
    let revisedPlan: AgentPlan | undefined;

    if (retryReason) {
      step(`First attempt found nothing (${retryReason}). Trying a different approach...`);

      const retryPrompt = `
Your previous plan did not work.

Data profile:
${safeJson(profile)}

Previous plan:
${safeJson(plan)}

What the tool returned:
${safeJson(toolResult.json ?? toolResult.stdout)}

Problem: ${retryReason}

If "filter_diagnostics" is present, "rows_matching_alone" shows how many rows each
filter matches by itself. A zero there is the filter that is wrong.

User question:
${question}

Return ONLY a corrected JSON plan in the same shape as before. Make it broader:
loosen or drop the failing filter, use "contains" instead of "eq" for text, or
remove a filter the question did not really require.`;

      revisedPlan = parseJson<AgentPlan>(await this.copilot.ask(retryPrompt, token));

      if (revisedPlan) {
        const retryResult = await this.execute(revisedPlan, question, dataArg, token);
        if (!needsRetry(revisedPlan.mode, retryResult.json)) {
          plan = revisedPlan;
          toolResult = retryResult;
          retryReason = undefined;
        }
      }
    }

    const guidance = [
      { modes: ['trend'], text: trendAgent },
      { modes: ['join'], text: joinAgent },
      { modes: ['chart'], text: chartAgent },
      { modes: ['query'], text: `${searchAgent}\n\n${analysisAgent}` }
    ]
      .filter((entry) => entry.modes.includes(plan.mode))
      .map((entry) => entry.text)
      .join('\n\n');

    step('Writing the answer...');
    const sourceLinks = this.buildSourceLinks(profile);

    const finalPrompt = `
${answerValidation}

${answerFormat}

Business rules:
${businessRules}

Question types:
${questionTypes}

File discovery guidance:
${discovery}

Guidance for this kind of question:
${guidance}

${formatHistory(this.history)}

The plan that was executed:
${safeJson(plan)}

Tool result:
${safeJson(toolResult.json ?? {
  stdout: toolResult.stdout,
  stderr: toolResult.stderr,
  ok: toolResult.ok
})}

User question:
${question}

Links to the source files, if any:
${safeJson(sourceLinks)}

Write the final answer for the user. Follow these rules:
- Be short, direct and conversational.
- Lead with the answer, then the supporting number.
- Say which filters and columns were actually used when the question was vague,
  so the user can correct you.
- Name the source file. When a link for that file appears above, cite it as a
  markdown link like [file name](url). Never invent a link.
- If the result is empty or the plan failed, say plainly what was searched for,
  what exists in the data instead, and ask one focused follow-up question.
- Do not invent data.
- Never paste a chart file path into the answer; the chart is displayed automatically.
`;

    const answer = await this.copilot.ask(finalPrompt, token, onFragment);
    const chartPath = extractChartPath(toolResult.json);
    this.history.push({ question, answer });
    this.history = this.history.slice(-HISTORY_TURNS);

    return {
      answer,
      chartPath,
      debug: {
        extensionRoot: this.extensionRoot,
        workspaceRoot: this.workspaceRoot,
        dataSource,
        dataFolder: dataFolder.fsPath,
        plan,
        revisedPlan,
        unresolvedProblem: retryReason,
        chartPath,
        toolResult: toolResult.json ?? toolResult.stdout
      }
    };
  }

  clearHistory(): void {
    this.history = [];
  }

  /** Maps each profiled file to a browser link so answers can cite it. */
  private buildSourceLinks(profile: unknown): Record<string, string> {
    const provider = this.dataProvider;
    const links: Record<string, string> = {};

    if (!provider.linkForFile || !profile || typeof profile !== 'object') {
      return links;
    }

    const tables = (profile as { tables?: unknown }).tables;
    if (!Array.isArray(tables)) {
      return links;
    }

    for (const table of tables) {
      const file = (table as { file?: unknown })?.file;
      if (typeof file !== 'string') {
        continue;
      }

      const name = path.basename(file);
      const url = provider.linkForFile(name);
      if (url && !links[name]) {
        links[name] = url;
      }
    }

    return links;
  }

  private async execute(
    plan: AgentPlan,
    question: string,
    dataArg: string[],
    token?: vscode.CancellationToken
  ): Promise<ToolResult> {
    if (plan.mode === 'clarify') {
      return {
        ok: true,
        stdout: '',
        stderr: '',
        json: {
          note: 'The plan asked for clarification.',
          clarifyQuestion: plan.clarifyQuestion ?? null
        }
      };
    }

    if (plan.mode === 'trend') {
      const trend = plan.trend ?? {};
      return this.tools.runTool('trend_analysis.py', [
        ...dataArg,
        '--question',
        question,
        ...optionalArg('--date-column', trend.dateColumn),
        ...optionalArg('--value-column', trend.valueColumn),
        ...optionalArg('--group-by', trend.groupBy),
        ...optionalArg('--freq', trend.freq)
      ], token);
    }

    if (plan.mode === 'join') {
      const join = plan.join ?? {};
      return this.tools.runTool('join_data.py', [
        ...dataArg,
        '--question',
        question,
        ...optionalArg('--left', join.left),
        ...optionalArg('--right', join.right),
        ...optionalArg('--key', join.key)
      ], token);
    }

    if (plan.mode === 'chart') {
      const chart = plan.chart ?? {};
      return this.tools.runTool('make_chart.py', [
        ...dataArg,
        '--question',
        question,
        '--out',
        this.chartFolder,
        ...optionalArg('--chart-type', chart.chartType),
        ...optionalArg('--group-by', chart.groupBy),
        ...optionalArg('--value-column', chart.valueColumn),
        ...optionalArg('--date-column', chart.dateColumn),
        ...optionalArg('--freq', chart.freq)
      ], token);
    }

    return this.tools.runTool('query_data.py', [
      ...dataArg,
      '--question',
      question,
      '--plan',
      JSON.stringify(plan.plan ?? {})
    ], token);
  }

  /** Profiling reads every file, so reuse it across follow-up questions. */
  private async getProfile(
    folder: string,
    dataArg: string[],
    token?: vscode.CancellationToken
  ): Promise<unknown> {
    const sendValues = vscode.workspace
      .getConfiguration('siauWeiChat')
      .get<boolean>('privacy.sendValues') !== false;

    const cacheKey = `${folder}|${sendValues}`;
    const fresh =
      this.profileCache &&
      this.profileCache.folder === cacheKey &&
      Date.now() - this.profileCache.at < PROFILE_TTL_MS;

    if (fresh) {
      return this.profileCache!.json;
    }

    const args = sendValues ? dataArg : [...dataArg, '--no-values', 'true'];
    const result = await this.tools.runTool('profile_data.py', args, token);
    const json = result.json ?? { ok: false, stderr: result.stderr };
    this.profileCache = { folder: cacheKey, at: Date.now(), json };
    return json;
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

function optionalArg(flag: string, value: string | null | undefined): string[] {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  return cleaned && cleaned.toLowerCase() !== 'null' ? [flag, cleaned] : [];
}

function extractChartPath(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') {
    return undefined;
  }

  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return undefined;
  }

  for (const entry of results) {
    const chartPath = (entry as { chart_path?: unknown })?.chart_path;
    if (typeof chartPath === 'string' && chartPath) {
      return chartPath;
    }
  }

  return undefined;
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

function fallbackPlan(question: string): AgentPlan {
  const q = question.toLowerCase();
  const matches = (words: string[]) => words.some((word) => q.includes(word));

  if (matches(['chart', 'graph', 'plot', 'visualize', 'visualise', 'pie', 'bar chart'])) {
    return { mode: 'chart', reason: 'Question asks for a visual.' };
  }

  if (matches(['over time', 'trend', 'growth', 'monthly', 'weekly', 'quarterly', 'spike', 'since'])) {
    return { mode: 'trend', reason: 'Question asks how values change over time.' };
  }

  if (matches(['link', 'match', 'combine', 'join', 'not in', 'missing from', 'both files'])) {
    return { mode: 'join', reason: 'Question spans two files.' };
  }

  // An empty query plan still returns rows, which beats answering nothing.
  return { mode: 'query', reason: 'Falling back to an unfiltered query.', plan: { limit: 25 } };
}

function describePlan(plan: AgentPlan): string {
  switch (plan.mode) {
    case 'trend':
      return 'Analysing the trend over time...';
    case 'join':
      return 'Linking records across your files...';
    case 'chart':
      return 'Building the chart...';
    case 'clarify':
      return 'Checking whether the data can answer this...';
    default: {
      const filters = plan.plan?.filters?.length ?? 0;
      const groupBy = plan.plan?.group_by;
      const grouped = Array.isArray(groupBy) ? groupBy.join(', ') : groupBy;

      if (grouped) {
        return `Grouping by ${grouped}...`;
      }
      return filters ? `Querying with ${filters} filter${filters === 1 ? '' : 's'}...` : 'Querying the data...';
    }
  }
}

function needsRetry(mode: PlanMode, json: unknown): string | undefined {
  if (mode === 'clarify') {
    return undefined;
  }

  if (!json || typeof json !== 'object') {
    return 'the tool returned no usable output';
  }

  const payload = json as Record<string, unknown>;

  if (payload.ok === false) {
    return String(payload.error ?? 'the tool reported an error');
  }

  if (payload.row_count_after_filters === 0) {
    return 'no rows matched the filters';
  }

  if (Array.isArray(payload.results) && payload.results.length === 0) {
    return 'the tool produced no results';
  }

  return undefined;
}

function formatHistory(history: Turn[]): string {
  if (!history.length) {
    return '';
  }

  const lines = history
    .map((turn) => `User: ${turn.question}\nAssistant: ${truncate(turn.answer, 400)}`)
    .join('\n\n');

  return `Earlier in this conversation (use it to resolve follow-up questions):\n${lines}\n`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function throwIfCancelled(token?: vscode.CancellationToken): void {
  if (token?.isCancellationRequested) {
    throw new Error('Cancelled.');
  }
}