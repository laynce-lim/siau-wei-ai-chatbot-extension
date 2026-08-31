# Siau Wei AI Chatbot Extension
The Siau Wei AI Chatbot Extension is a VS Code extension that lets users ask natural language questions about spreadsheet data without manually opening and searching Excel or CSV files.

The program works by combining a chat interface, agent instruction files, Copilot language model reasoning, and Python data tools.

---

## Table of Contents

* [Overview](#Overview)
* [Architecture](#architecture)
* [Project Structure](#project-structure)
* [How the Agents Work](#how-the-agents-work)
* [Data Sources](#data-sources)
* [Settings Reference](#settings-reference)
* [Supported Data Files](#supported-data-files)
* [Prerequisites](#prerequisites)
* [Setup for Development](#setup-for-development)
* [Running the Tests](#running-the-tests)
* [Testing the Python Tools](#testing-the-python-tools)
* [Running in Debug Mode](#running-in-debug-mode)
* [Packaging the Extension](#packaging-the-extension)
* [Package Checklist](#package-checklist)
* [Installing the Extension Locally](#installing-the-extension-locally)
* [Normal User Workflow](#normal-user-workflow)
* [Using with a SharePoint Refresh Project](#using-with-a-sharepoint-refresh-project)
* [Troubleshooting](#troubleshooting)
* [Maintenance Notes](#maintenance-notes)
* [Recommended Final Separation](#recommended-final-separation)
* [Download and Install](#download-and-install)

---

## Overview

Siau Wei AI Chatbot Extension is a **structured AI chatbot framework** designed for asking natural language questions about Excel and CSV-based business data. It helps users search, summarize, and analyze spreadsheet information without manually opening files or filtering rows.

It answers natural language questions like:

* *"Who owns SC00901168H0069?"*
* *"How many systems are assigned to each owner?"*
* *"Which systems are missing CPU or Database?"*
* *"Show me all Priority 1 systems."*
* *"Summarize the platform utilization data."*

The extension is driven by specialized agent files (`agents/`), reusable skill instructions (`skills/`), Python spreadsheet tools (`tools/`), and a configurable data folder that stores the current Excel or CSV files.

The installed extension contains the chatbot logic, agents, skills, tools, and VS Code webview UI. The opened workspace contains the live spreadsheet data that the chatbot searches and analyzes.

---

## Architecture

```
User Natural Language Query
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  VS Code Webview Chat UI                                 │
│  Collects the question, streams the answer, shows charts │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Agent Orchestrator  (src/agentOrchestrator.ts)          │
│  Profiles the data, asks the model for a query plan,     │
│  executes it, retries once, then writes the answer       │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Data Provider  (src/dataProvider.ts)                    │
│  local folder  │  SharePoint sync via Microsoft Graph    │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Agents  (agents/*.md)                                   │
│  router │ business terms │ file discovery │ search       │
│  analysis │ validation │ trend │ join │ chart            │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Skills  (skills/*.md)                                   │
│  answer formatting │ business rules │ question types     │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Copilot / VS Code Language Model                        │
│  Translates the question into a query plan, then         │
│  explains the tool output in natural language            │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Python Tools  (tools/*.py)                              │
│  profile_data │ query_data │ trend_analysis              │
│  join_data │ make_chart                                  │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Spreadsheet Data                                        │
│  CSV files │ Excel workbooks │ synced SharePoint cache   │
│  chosen by siauWeiChat.dataSource                        │
└──────────────────────────────────────────────────────────┘
```

### How a question is answered

The model does the understanding and Python does the arithmetic:

1. `profile_data.py` reports every column: type, blank count, distinct count,
   numeric ranges, date ranges, and the actual values it contains.
2. The language model turns the question into a JSON **query plan** naming real
   columns, filters, grouping and a metric.
3. `query_data.py` executes that plan deterministically. It never evaluates
   expressions, so a malformed plan cannot run arbitrary code.
4. If nothing matched, the tool reports how many rows each filter matched *on its
   own*, and the model gets one chance to correct the plan.
5. The model writes the final answer from the tool output only.

The extension follows a **three-layer pattern**:

| Layer               | Purpose                                                                                                                                | Location                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Extension Layer** | Provides the VS Code command, chatbot UI, compiled TypeScript code, agents, skills, and Python tools.                                  | Installed extension folder                       |
| **Reasoning Layer** | Uses agent instructions, skill rules, Copilot / VS Code language model, and tool output to decide how to answer the user.              | `agents/`, `skills/`, `src/agentOrchestrator.ts` |
| **Data Layer**      | Stores the current Excel or CSV files that the chatbot searches and analyzes. This can be local test data or exported SharePoint data. | `data/` or configured `siauWeiChat.dataFolder`   |

The most important design rule is:

```
agents/ + skills/ + tools/ = installed extension folder
data/ = currently opened workspace folder
```

This keeps the chatbot reusable. The extension logic stays packaged inside the VSIX, while each workspace can provide its own spreadsheet data.

---

## Project Structure

The extension is organized into TypeScript source code, compiled output, agent instructions, skill rules, Python data tools, sample data, and webview assets.

```
siau-wei-ai-chatbot-extension/
├── package.json
├── tsconfig.json
├── requirements.txt
├── requirements-dev.txt
├── README.md
│
├── src/
│   ├── extension.ts
│   ├── chatPanel.ts
│   ├── agentOrchestrator.ts
│   ├── copilotClient.ts
│   ├── toolRunner.ts
│   ├── dataProvider.ts
│   ├── localDataProvider.ts
│   └── sharePointDataProvider.ts
│
├── out/
│   └── compiled JavaScript output
│
├── agents/
│   ├── 01-router.agent.md
│   ├── 02-business-terms.agent.md
│   ├── 03-file-discovery.agent.md
│   ├── 04-data-search.agent.md
│   ├── 05-data-analysis.agent.md
│   ├── 06-answer-validation.agent.md
│   ├── 07-trend-analysis.agent.md
│   ├── 08-cross-file-join.agent.md
│   └── 09-chart-generation.agent.md
│
├── skills/
│   ├── answer-format.md
│   ├── business-rules.md
│   └── excel-question-types.md
│
├── tools/
│   ├── common.py            shared helpers, caching, JSON safety
│   ├── profile_data.py      column profile used to build query plans
│   ├── query_data.py        executes a model-authored query plan
│   ├── trend_analysis.py    change over time
│   ├── join_data.py         links records across two files
│   ├── make_chart.py        renders a PNG chart
│   ├── list_files.py        standalone diagnostic
│   ├── inspect_workbook.py  standalone diagnostic
│   ├── validate_sources.py  standalone diagnostic
│   └── check_env.py         reports interpreter and package health
│
├── tests/
│   └── pytest suite for the Python tools
│
├── data/
│   └── sample CSV or Excel files used for local testing
│
└── media/
    └── webview UI assets
```

| Folder / File          | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `package.json`         | Defines the VS Code extension, commands, settings, dependencies, and activation events.                   |
| `tsconfig.json`        | TypeScript compiler configuration.                                                                        |
| `requirements.txt`     | Python package requirements for the spreadsheet tools.                                                    |
| `requirements-dev.txt` | Adds pytest for running the test suite.                                                                   |
| `src/`                 | TypeScript source code for the VS Code extension.                                                         |
| `out/`                 | Compiled JavaScript output created after running `npm.cmd run compile`.                                   |
| `agents/`              | Markdown instruction files that control routing, discovery, analysis, trends, joins, charts and validation. |
| `skills/`              | Reusable rules for answer formatting, business logic, and spreadsheet question types.                     |
| `tools/`               | Python scripts that profile, query, analyze and chart spreadsheet data.                                   |
| `tests/`               | Pytest suite covering the query executor, JSON safety, and column heuristics.                             |
| `data/`                | Local test data used during development. In normal use, data can come from the opened workspace.          |
| `media/`               | Static files used by the VS Code webview interface.                                                       |

Three tools are **not** called by the extension and exist only as manual
diagnostics: `list_files.py`, `inspect_workbook.py` and `validate_sources.py`.
The chatbot itself only runs `profile_data.py`, `query_data.py`,
`trend_analysis.py`, `join_data.py` and `make_chart.py`.

---

## How the Agents Work

The extension uses nine agent instruction files.

| Agent                     | Purpose                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Router Agent              | Classifies the question and supplies routing vocabulary for the query planner                     |
| Business Terms Agent      | Understands business words, abbreviations, and spreadsheet terminology                            |
| File Discovery Agent      | Helps identify which file or sheet is relevant                                                    |
| Data Search Agent         | Handles direct row/value lookups                                                                  |
| Data Analysis Agent       | Handles counts, grouping, missing values, comparisons, and summaries                              |
| Answer + Validation Agent | Writes the final answer and checks that it is supported by the data                               |
| Trend Analysis Agent      | Explains change over time, growth, peaks and troughs                                              |
| Cross-File Join Agent     | Links records across two files and reports matches and gaps                                       |
| Chart Generation Agent    | Describes a rendered bar, line or pie chart                                                       |

Only the agents relevant to the chosen route are added to the final prompt, so a
chart question does not pay for the trend and join instructions.

The agents are Markdown instruction files. They do not contain live data. Live data should always come from the current files in the `data/` folder or configured data folder.

---

## Data Sources

The extension can read spreadsheets from a **local folder** or sync them from
**SharePoint**. You can configure several named sources and switch between them
in the chat.

### Multiple named sources (recommended)

The easiest way to add a source is in the chat itself: click **Add folder**,
choose the OneDrive-synced folder in the Windows folder picker, give it a short
name, and start asking questions. The extension checks for CSV/Excel files,
saves the path in your VS Code User Settings, and selects it immediately.

The same guided picker is available from the Command Palette as
**Siau Wei AI Chatbot: Add OneDrive Folder**. It opens at your OneDrive location
when Windows provides one. No path copying or JSON editing is required.

To add or maintain sources manually, use `siauWeiChat.sources` in Settings JSON:

```json
"siauWeiChat.sources": [
  {
    "name": "VST Agent",
    "path": "C:\\Users\\you\\OneDrive - Contoso\\VST_Agent",
    "webUrl": "https://contoso.sharepoint.com/sites/team/Shared%20Documents/VST_Agent"
  },
  {
    "name": "Platform Utilization",
    "siteUrl": "https://contoso.sharepoint.com/sites/OtherSite",
    "driveName": "Documents",
    "folderPath": "Reports/2026"
  }
]
```

Entries are completely independent, so unrelated sites and folders can sit side
by side. An entry with a `path` is a local folder; an entry with a `siteUrl` is
synced from SharePoint. Set `kind` explicitly if you need to override that.

Use **Change source** in the chat header, or the command
`Siau Wei AI Chatbot: Select Data Source`, to pick which one questions apply to.
The choice is remembered, and each source keeps its own cache and file profile.

`webUrl` is optional. When present, the **Open source** button opens that link in
a browser and answers can cite files as clickable links.

### Reading SharePoint without Graph access

The simplest way to use SharePoint data is to let OneDrive sync it:

1. Open the folder in SharePoint in a browser.
2. Click **Add shortcut to OneDrive** (or **Sync**).
3. In File Explorer, right-click the synced folder and choose
   **Always keep on this device**, so the files are real rather than cloud
   placeholders.
4. Add the local path as a source, as in the first example above.

This requires no app registration and no administrator involvement, and OneDrive
keeps the files current. Because table reads are cached by file modification
time, changed files are re-read automatically.

### Single source (older settings)

If `siauWeiChat.sources` is empty, these settings are used instead:

```json
{
  "siauWeiChat.dataSource": "local",
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

`siauWeiChat.dataFolder` may be relative or absolute. A relative path is resolved
against the **opened workspace folder** first, and falls back to the installed
extension folder only if the workspace has no such folder.

### SharePoint mode

```json
{
  "siauWeiChat.dataSource": "sharepoint",
  "siauWeiChat.sharePoint.siteUrl": "https://company.sharepoint.com/sites/YourSite",
  "siauWeiChat.sharePoint.driveName": "Documents",
  "siauWeiChat.sharePoint.folderPath": "Platform Utilization"
}
```

In this mode the extension:

1. Signs you in with **delegated** Microsoft authentication through VS Code.
2. Reads only the files your account can already access, via Microsoft Graph.
3. Downloads CSV/Excel files into an extension-managed cache folder.
4. Points the existing Python tools at that cache.

Run `Siau Wei AI Chatbot: Sync Data Source` from the command palette to sign in
and sync on demand, or use the **Refresh data** button in the chat header. The
chat header shows how long ago the last sync happened. Unchanged files are
skipped on later syncs, and files deleted in SharePoint are removed locally.

Graph access needs an app registration in most tenants — see
[Sign-in fails with AADSTS65002](#sign-in-fails-with-aadsts65002). The OneDrive
approach above avoids that entirely.

No credentials, tokens, client secrets or passwords are stored in this
repository or in settings. `siauWeiChat.sharePoint.tenantId` and
`siauWeiChat.sharePoint.clientId` are identifiers, not secrets, and apply to
every SharePoint source.

To refresh answers in either mode, replace or regenerate the CSV/Excel files.
Agent, skill, and Markdown files never need editing when the data changes.

---

## Settings Reference

| Setting                              | Default       | Purpose                                                                     |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------- |
| `siauWeiChat.sources`                | `[]`          | Named local or SharePoint sources you can switch between in the chat.       |
| `siauWeiChat.dataSource`             | `local`       | `local` or `sharepoint`. Used only when `sources` is empty.                 |
| `siauWeiChat.dataFolder`             | `data`        | Folder for local mode. Relative to the workspace, or absolute.              |
| `siauWeiChat.pythonPath`             | *(empty)*     | Python executable to use. Auto-detected when empty.                         |
| `siauWeiChat.modelVendor`            | `copilot`     | Language model vendor requested from VS Code.                               |
| `siauWeiChat.modelFamily`            | `gpt-4o`      | Preferred model family. Falls back to any available model.                  |
| `siauWeiChat.privacy.sendValues`     | `true`        | Include example cell values in the profile sent to the model.               |
| `siauWeiChat.sharePoint.siteUrl`     | *(empty)*     | e.g. `https://company.sharepoint.com/sites/TeamSite`.                       |
| `siauWeiChat.sharePoint.driveName`   | `Documents`   | Document library name.                                                      |
| `siauWeiChat.sharePoint.folderPath`  | *(empty)*     | Folder inside the library. Empty means the whole library.                   |
| `siauWeiChat.sharePoint.tenantId`    | *(empty)*     | Optional Entra tenant ID. Not a secret.                                     |
| `siauWeiChat.sharePoint.clientId`    | *(empty)*     | Optional Entra application ID. Not a secret.                                |

### A note on privacy

To answer vague questions well, the extension sends a **data profile** to the
language model. By default that profile includes example cell values and the
full list of values for low-cardinality columns — this is what lets the model
translate "underutilized" or "2S boxes" into real filters.

If the data is sensitive, set:

```json
{ "siauWeiChat.privacy.sendValues": false }
```

Only column names, types and counts are then sent. Answer quality drops, because
the model has to guess what the values look like.

### Commands

| Command                                      | Purpose                                     |
| -------------------------------------------- | ------------------------------------------- |
| `Siau Wei AI Chatbot: Open Chat`             | Opens the chat panel.                       |
| `Siau Wei AI Chatbot: Select Data Source`    | Chooses which configured source to query.   |
| `Siau Wei AI Chatbot: Sync Data Source`      | Signs in and syncs, or validates local mode. |
| `Siau Wei AI Chatbot: Check Setup`           | Reports the Python interpreter, package versions and data status. |
| `Siau Wei AI Chatbot: Install Dependencies`  | Installs Python when needed, then creates the extension Python environment and installs its packages. |
| `Siau Wei AI Chatbot: Add OneDrive Folder`   | Opens a folder picker, saves a OneDrive-synced data folder, and selects it. |

Run **Check Setup** first if anything misbehaves. It prints the interpreter the
extension actually resolved, which package is missing, how many data files it
can see, and offers to run the dependency installer or copy the exact `pip`
command for that interpreter.

---

## Supported Data Files

The Python tools are intended to support:

```
.csv
.xlsx
.xlsm
.xls
```

For Excel workbooks, each sheet can be inspected and searched.

For CSV files, the file is treated as one sheet named `CSV`.

---

## Prerequisites

For normal use:

* VS Code
* GitHub Copilot / VS Code language model access
* `winget` is recommended. It is included with current Windows 10/11 systems.

Python and the required packages are installed by the extension. Run
**Siau Wei AI Chatbot: Install Dependencies** from the Command Palette. The
command:

1. Uses an existing Python when available.
2. Otherwise runs `winget` to install Python 3.12 for the current Windows user.
3. Creates a private environment at `%LOCALAPPDATA%\SiauWeiAIChatbot\python`.
4. Installs `pandas`, `openpyxl`, `python-dateutil`, and `matplotlib` there.
5. Configures the extension to use that environment automatically.

The installer is explicit rather than silent: Windows may show a package or
network approval prompt. It never requires a Python download before you choose
the command.

If `winget` is blocked by company policy, install Python 3.11 or later through
your approved software channel, then run **Install Dependencies** again. The
command will use the installed interpreter instead of trying `winget`.

The packaged extension does **not** bundle a Python environment. It looks for an
interpreter in this order:

1. `siauWeiChat.pythonPath`, if set
2. a `.venv` in the opened workspace folder
3. a `.venv` beside the extension
4. the interpreter selected by the Microsoft Python extension
5. `python` on `PATH`

If answers fail with a Python error, set `siauWeiChat.pythonPath` explicitly to
an interpreter that has the packages above.

For development:

* Node.js
* npm
* TypeScript dependencies from `npm.cmd install`
* Python virtual environment from `requirements.txt`
* `requirements-dev.txt` to run the tests

---

## Setup for Development

Use this section when modifying or testing the extension source code.

Open PowerShell and go to the extension project root:

```powershell
cd C:\Users\laynceli\Downloads\siau-wei-ai-chatbot-extension\siau-wei-ai-chatbot-extension
```

Install the Node.js dependencies:

```powershell
npm.cmd install
```

Create a Python virtual environment:

```powershell
python -m venv .venv
```

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the Python dependencies used by the spreadsheet tools:

```powershell
python -m pip install -r requirements.txt
```

Compile the TypeScript extension source code:

```powershell
npm.cmd run compile
```

After compilation, the generated JavaScript files will be created in the `out/` folder.

---

## Running the Tests

The Python tools are covered by a pytest suite. Install the dev requirements
once:

```powershell
python -m pip install -r requirements-dev.txt
```

Run the suite from the project root:

```powershell
python -m pytest tests -q
```

The tests cover the query plan executor (every filter operator, grouping,
metrics, projection and limits), the JSON sanitiser that keeps tool output
parseable by the extension, the mtime-based table cache, the column heuristics
for dates and grouping, and multi-sheet Excel handling. They use temporary
fixture data and never touch your real files.

The same suite runs in CI on Linux and Windows, together with the TypeScript
build, via [.github/workflows/ci.yml](.github/workflows/ci.yml).

### Checking the environment

To confirm an interpreter can run the tools:

```powershell
python tools\check_env.py
```

It reports the Python version, which packages are installed, and a ready-made
install command for anything missing. The **Check Setup** command runs the same
probe from inside VS Code.

---

## Testing the Python Tools

Before testing the chatbot UI, verify that the Python tools can read the
spreadsheet data.

Profile the columns. This is what the chatbot sends to the model, so it is the
fastest way to confirm the data is readable:

```powershell
python tools\profile_data.py --data ".\data"
```

Run a query plan directly. The plan is JSON, so use a file or a single-quoted
string to avoid PowerShell mangling the quotes:

```powershell
python tools\query_data.py --data ".\data" --question "count by owner" --plan '{"group_by":"Owner","metric":{"op":"count"}}'
```

Test a trend:

```powershell
python tools\trend_analysis.py --data ".\data" --question "how has this changed monthly"
```

Test a chart:

```powershell
python tools\make_chart.py --data ".\data" --question "chart systems by owner" --out ".\charts"
```

Standalone diagnostics that the chatbot itself no longer calls:

```powershell
python tools\list_files.py --data ".\data"
python tools\inspect_workbook.py --data ".\data"
```

If these commands return valid JSON, the Python data tools are working correctly.

> PowerShell 5.1 mangles quotes when passing JSON to native executables. The
> extension itself is unaffected because it spawns Python with an argument
> array rather than a command string.

If the Python tools work manually but the chatbot fails, check `toolRunner.ts`. The extension should call Python scripts using argument arrays, not one long command string, so paths with spaces or parentheses do not break.

---

## Running in Debug Mode

Use debug mode only when developing or troubleshooting the extension.

Open the extension project folder in VS Code.

Make sure the project root contains:

```
package.json
src/
agents/
skills/
tools/
data/
```

Press:

```
F5
```

This starts a new **Extension Development Host** window.

In the Extension Development Host window, open the command palette:

```
Ctrl + Shift + P
```

Run:

```
Siau Wei AI Chatbot: Open Chat
```

The chatbot panel should open inside VS Code.

During debug mode, the extension should use:

```
agents/ + skills/ + tools/ = extension project folder
data/ = current workspace data folder, if configured
```

If the chatbot reports that it cannot find `agents/01-router.agent.md`, check `agentOrchestrator.ts`. Agent and skill files should be read from the extension root, not from the data workspace.

Use this only when developing the extension.

Open the extension project folder in VS Code.

Press:

```
F5
```

This opens an Extension Development Host window.

In the new window:

```
Ctrl + Shift + P
Siau Wei AI Chatbot: Open Chat
```

If the Extension Development Host opens without the project folder, the extension should still use the installed/project extension folder for `agents/`, `skills/`, and `tools/`, while reading data from the open workspace if available.

---

## Packaging the Extension

Packaging creates a `.vsix` file that can be installed locally or shared with another user.

Before packaging, make sure the extension has already been compiled:

```powershell
npm.cmd run compile
```

This creates the compiled JavaScript output in:

```
out/
```

The installed extension needs the compiled output, agents, skills, tools, and webview assets. Before packaging, confirm that `.vscodeignore` exists in the project root.

Recommended `.vscodeignore`:

```
.venv/**
node_modules/**
src/**
.vscode/**
*.vsix
**/__pycache__/**
**/*.pyc
.git/**
.gitignore
```

These folders should be excluded because they are only needed for development:

```
.venv/
node_modules/
src/
.vscode/
```

Do not exclude these folders because the installed extension needs them at runtime:

```
out/
agents/
skills/
tools/
media/
```

Package the extension:

```powershell
npx.cmd @vscode/vsce package --out ".\siau-wei-ai-chatbot-extension-0.2.3.vsix"
```

This creates the installable extension file:

```
siau-wei-ai-chatbot-extension-0.2.3.vsix
```

To confirm the file was created, run:

```powershell
dir *.vsix
```

The `.vsix` file is the exported extension package. This is the file that can be installed in VS Code or shared with another user.

---

## Installing the Extension Locally

Use this section when installing the packaged `.vsix` extension into VS Code.

From the extension project root, install the VSIX:

```powershell
code --install-extension ".\siau-wei-ai-chatbot-extension-0.2.3.vsix" --force
```

After installation, fully restart VS Code.

Open a workspace folder that contains the spreadsheet data you want the chatbot to read. For example:

```
my-data-workspace/
└── data/
    └── csv_export/
        ├── System.csv
        ├── Contact.csv
        └── Platform_Utilization.csv
```

If the data is stored in `data/csv_export/`, add or confirm this VS Code setting:

```json
{
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

Then open the command palette:

```
Ctrl + Shift + P
```

Run:

```
Siau Wei AI Chatbot: Open Chat
```

The chatbot panel should open and use the configured data folder from the current workspace.

The installed extension should provide the chatbot UI, agents, skills, and Python tools. The opened workspace should provide the current spreadsheet data.

---

## Normal User Workflow

A normal user does not need to run the extension in debug mode or modify the source code.

The normal workflow is:

1. Install the packaged `.vsix` extension.
2. Open a workspace folder that contains the spreadsheet data.
3. Confirm the data folder setting points to the correct folder.
4. Run `Siau Wei AI Chatbot: Open Chat` from the VS Code command palette.
5. Ask questions in the chatbot panel.

Example workspace:

```
my-data-workspace/
└── data/
    └── csv_export/
        ├── System.csv
        ├── Contact.csv
        └── Platform_Utilization.csv
```

Example VS Code setting:

```json
{
  "siauWeiChat.dataSource": "local",
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

Example questions:

```
Who owns SC00901168H0069?
How many systems are assigned to each owner?
Which systems are missing CPU or Database?
Show Priority 1 systems.
Which systems are underutilized?
How has utilization changed month by month?
Which hosts have no matching contact record?
Show me a bar chart of systems by owner.
Summarize the current files.
```

Follow-up questions keep their context, so "what about 2S?" works after a
previous question. Use **New chat** in the panel header to clear that context.

The user only needs to refresh or replace the spreadsheet files when the data changes. The chatbot logic, agents, skills, and tools come from the installed extension.

---

## Using with a SharePoint Refresh Project

This extension can be used with a separate SharePoint refresh project that downloads Excel or CSV files and converts them into chatbot-readable CSV exports.

Example SharePoint refresh workspace:

```
ccv-m365-mcp-sharepoint-refresh/
└── data/
    ├── raw_excel/
    │   └── downloaded SharePoint Excel or CSV files
    └── csv_export/
        └── exported CSV files used by the chatbot
```

In that workspace, configure the chatbot data folder:

```json
{
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

The separation should work like this:

```
Installed Siau Wei AI Chatbot Extension
├── chatbot UI
├── agents/
├── skills/
├── tools/
└── compiled extension code

SharePoint Refresh Workspace
└── data/
    ├── raw_excel/
    └── csv_export/
```

The installed extension provides the chatbot logic, agents, skills, and Python tools. The SharePoint refresh project provides the changing spreadsheet data.

When the SharePoint data changes, refresh the files in `data/csv_export/`. The extension does not need to be repackaged unless the chatbot code, agents, skills, or tools change.

---

## Troubleshooting

### Command is not found

If `Siau Wei AI Chatbot: Open Chat` does not appear in the VS Code command palette, confirm that `package.json` contains the command activation event:

```json
"activationEvents": [
  "onCommand:siauWeiChat.openChat"
]
```

Also confirm that `package.json` contributes the command:

```json
"contributes": {
  "commands": [
    {
      "command": "siauWeiChat.openChat",
      "title": "Siau Wei AI Chatbot: Open Chat"
    }
  ]
}
```

Finally, confirm that `src/extension.ts` registers the same command:

```ts
vscode.commands.registerCommand('siauWeiChat.openChat', () => {
  ChatPanel.createOrShow(context);
});
```

After making changes, recompile, repackage, reinstall the VSIX, and restart VS Code:

```powershell
npm.cmd run compile
npx.cmd @vscode/vsce package --out ".\siau-wei-ai-chatbot-extension-0.2.3.vsix"
code --install-extension ".\siau-wei-ai-chatbot-extension-0.2.3.vsix" --force
```

### Cannot find `agents/01-router.agent.md`

This means the extension is looking for agent files in the wrong folder.

Correct behavior:

```
agents/ + skills/ + tools/ = installed extension folder
data/ = current workspace folder
```

If this error appears, check `src/agentOrchestrator.ts`.

Agent and skill files should be read from the extension root, not from the opened data workspace.

### Cannot find module `vscode`

This happens when the extension is run like a normal Node.js script.

Do not run:

```powershell
node out\extension.js
```

Instead, run the extension through one of these methods:

```
F5 Extension Development Host
```

or install the packaged VSIX:

```powershell
code --install-extension ".\siau-wei-ai-chatbot-extension-0.2.3.vsix" --force
```

### PowerShell blocks npm

If PowerShell blocks `npm`, use:

```powershell
npm.cmd run compile
```

instead of:

```powershell
npm run compile
```

You can also use `npx.cmd` instead of `npx`:

```powershell
npx.cmd @vscode/vsce package --out ".\siau-wei-ai-chatbot-extension-0.2.3.vsix"
```

### VSIX is too large

If the packaged VSIX is very large, check `.vscodeignore`.

The VSIX should exclude development-only and archive files:

```
.venv/**
node_modules/**
src/**
.vscode/**
*.vsix
**/__pycache__/**
**/*.pyc
tests/**
.pytest_cache/**
requirements-dev.txt
*.zip
```

The VSIX should include runtime folders:

```
out/
agents/
skills/
tools/
media/
```

A correct package is well under 1 MB. Large `.zip` archives left in the project
root were previously inflating it to over 100 MB.

### Data search works manually but not in the chatbot

Test the Python tool manually:

```powershell
python tools\profile_data.py --data ".\data"
```

If this works manually but fails in the chatbot, the chatbot is probably using a
different interpreter. The extension does not bundle a virtual environment, so
set it explicitly:

```json
{ "siauWeiChat.pythonPath": "C:\\path\\to\\.venv\\Scripts\\python.exe" }
```

Also check `src/toolRunner.ts`. The extension should call Python tools using
argument arrays, not one long command string. This prevents errors when paths
contain spaces, parentheses, or special characters.

### Python or pandas not found

Run `Siau Wei AI Chatbot: Check Setup` from the command palette. It names the
interpreter that was resolved and lists any missing packages, then offers to
copy the correct install command.

The same information is available from a terminal:

```powershell
& "C:\path\to\python.exe" tools\check_env.py
& "C:\path\to\python.exe" -m pip install -r requirements.txt
```

### Microsoft sign-in never appears

Sign-in only happens when data is actually needed, which means the first
question or the `Sync Data Source` command — not when the panel opens. If a
prompt is missed, check the **Accounts** icon at the bottom of the Activity Bar
for a pending request.

### Sign-in fails with AADSTS65002

```
AADSTS65002: Consent between first party application aebc6443-996d-45c2-90f0-388ff96faa56
and first party resource 00000003-0000-0000-c000-000000000000 must be configured
via preauthorization
```

`aebc6443...` is VS Code's own application and `00000003...` is Microsoft Graph.
Microsoft only pre-authorizes VS Code's application for a small set of Graph
scopes, and `Sites.Read.All` is not one of them. No extension setting works
around this, because the token request is rejected before tenant policy is
considered.

The fix is to use your own Entra application:

1. Azure Portal → Microsoft Entra ID → App registrations → **New registration**.
2. Under **Authentication**, add a **Mobile and desktop applications** platform
   with the redirect URI `https://vscode.dev/redirect`.
3. Under **API permissions**, add Microsoft Graph → **Delegated** →
   `Sites.Read.All`, then **Grant admin consent**. In a managed tenant this step
   normally needs an administrator.
4. Copy the Application (client) ID and Directory (tenant) ID into settings:

```json
{
  "siauWeiChat.sharePoint.clientId": "<application id>",
  "siauWeiChat.sharePoint.tenantId": "<directory id>"
}
```

Neither value is a secret. The extension passes them to VS Code's Microsoft
authentication provider using its `VSCODE_CLIENT_ID` and `VSCODE_TENANT` scopes.

Until admin consent is granted, use local mode: export the files to a folder and
set `"siauWeiChat.dataSource": "local"`.

### Other sign-in errors

| Code | Meaning |
|:-----|:--------|
| `AADSTS65001` / `AADSTS90094` | Admin consent has not been granted for `Sites.Read.All`. |
| `AADSTS700016` / `AADSTS90002` | The client ID or tenant ID is wrong. |
| `AADSTS50011` | `https://vscode.dev/redirect` is missing from the app registration. |

The extension translates these codes into the required action, so read the error
notification before digging into Azure.

---

## Maintenance Notes

Do not hardcode data values in Markdown files.

Do not hardcode:

```
row counts
host names
owners
contacts
priorities
CPU values
database values
sheet names
file names
```

The extension should inspect the current data files at runtime.

Markdown files should define behavior, rules, and formatting only.

---

## Recommended Final Separation

Installed extension contains:

```
out/
agents/
skills/
tools/
media/
package.json
```

Workspace contains:

```
data/
  csv_export/
```

This keeps the chatbot reusable while allowing the spreadsheet data to change independently.

---



## Download and Install

Windows users can install the extension using the packaged VSIX file.

### Option 1: Install the VSIX Extension

Download the latest VSIX package from the
[releases page](https://github.com/laynce-lim/siau-wei-ai-chatbot-extension/releases/latest),
or go straight to the current file:

[Download Siau Wei AI Chatbot Extension VSIX](https://github.com/laynce-lim/siau-wei-ai-chatbot-extension/releases/download/v0.2.3/siau-wei-ai-chatbot-extension-0.2.3.vsix)

Then install it in PowerShell, using the file name you downloaded:

```powershell
code --install-extension ".\siau-wei-ai-chatbot-extension-0.2.3.vsix" --force
```

After installation, restart VS Code.

### Complete fresh-system setup

1. Install the VSIX using the command above (or Extensions → `...` → **Install
  from VSIX**).
2. Reload VS Code when prompted.
3. Open the Command Palette with `Ctrl+Shift+P` and run
  **Siau Wei AI Chatbot: Install Dependencies**. A visible terminal installs
  Python if necessary, then creates the private environment and packages.
4. Wait for **Setup complete** in that terminal, then run
  **Siau Wei AI Chatbot: Check Setup**. It confirms the exact interpreter,
  packages, configured data source, and number of readable files.
5. Sync the required SharePoint folder with OneDrive: in SharePoint select
  **Add shortcut to OneDrive** (or **Sync**), then select **Always keep on this
  device** in File Explorer.
6. In the chat, click **Add folder**, choose that synced folder, and give it a
  short name. This saves the source automatically.
7. Run **Siau Wei AI Chatbot: Open Chat** and select the folder in the
  **Folder / Source** dropdown.

No Microsoft Graph login, Entra app registration, administrator ticket, or
separate project download is needed when data is synced through OneDrive.

Open a workspace folder that contains your spreadsheet data, then run:

```text
Ctrl + Shift + P
Siau Wei AI Chatbot: Open Chat
```

### Option 2: Download the Full Windows Project ZIP

Download the full project ZIP:

[Download Full Windows Project ZIP](https://github.com/laynce-lim/siau-wei-ai-chatbot-extension/archive/refs/tags/v0.2.3.zip)

After downloading:

1. Extract the ZIP file.
2. Open the extracted folder in VS Code.
3. Run setup if needed:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

4. Compile the extension:

```powershell
npm.cmd run compile
```

5. Package or debug the extension as needed.
