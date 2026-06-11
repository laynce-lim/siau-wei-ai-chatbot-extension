# Siau Wei AI Chatbot Extension
The Siau Wei AI Chatbot Extension is a VS Code extension that lets users ask natural language questions about spreadsheet data without manually opening and searching Excel or CSV files.

The program works by combining a chat interface, agent instruction files, Copilot language model reasoning, and Python data tools.

---

## Table of Contents

* [Overview](#Overview)
* [Architecture](#architecture)
* [Project Structure](#project-structure)
* [How the Agents Work](#how-the-agents-work)
* [Data Folder](#data-folder)
* [Supported Data Files](#supported-data-files)
* [Prerequisites](#prerequisites)
* [Setup for Development](#setup-for-development)
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
* [Package Checklist](#package-checklist)

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
│  Collects the user question and displays the response    │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Agent Orchestrator  (src/agentOrchestrator.ts)          │
│  Loads agents, reads schemas, routes questions,          │
│  calls Python tools, and builds the final answer prompt  │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Agents  (agents/*.md)                                   │
│  router │ business terms │ file discovery │ search       │
│  analysis │ answer validation                            │
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
│  Classifies the question, reasons over tool output,      │
│  and produces the final natural language response        │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Python Tools  (tools/*.py)                              │
│  list_files │ inspect_workbook │ search_data             │
│  analyze_data │ validate_sources                         │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Spreadsheet Data                                        │
│  CSV files │ Excel workbooks │ exported SharePoint data  │
│  configured by siauWeiChat.dataFolder                    │
└──────────────────────────────────────────────────────────┘
```

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
├── README.md
│
├── src/
│   ├── extension.ts
│   ├── chatPanel.ts
│   ├── agentOrchestrator.ts
│   ├── copilotClient.ts
│   └── toolRunner.ts
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
│   └── 06-answer-validation.agent.md
│
├── skills/
│   ├── answer-format.md
│   ├── business-rules.md
│   └── excel-question-types.md
│
├── tools/
│   ├── list_files.py
│   ├── inspect_workbook.py
│   ├── search_data.py
│   ├── analyze_data.py
│   └── validate_sources.py
│
├── data/
│   └── sample CSV or Excel files used for local testing
│
└── media/
    └── webview UI assets
```

| Folder / File      | Purpose                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `package.json`     | Defines the VS Code extension, commands, settings, dependencies, and activation events.                   |
| `tsconfig.json`    | TypeScript compiler configuration.                                                                        |
| `requirements.txt` | Python package requirements for the spreadsheet tools.                                                    |
| `src/`             | TypeScript source code for the VS Code extension.                                                         |
| `out/`             | Compiled JavaScript output created after running `npm.cmd run compile`.                                   |
| `agents/`          | Markdown instruction files that control routing, discovery, searching, analysis, and validation behavior. |
| `skills/`          | Reusable rules for answer formatting, business logic, and spreadsheet question types.                     |
| `tools/`           | Python scripts that inspect, search, analyze, and validate spreadsheet data.                              |
| `data/`            | Local test data used during development. In normal use, data can come from the opened workspace.          |
| `media/`           | Static files used by the VS Code webview interface.                                                       |

---

## How the Agents Work

The extension uses six agent instruction files.

| Agent                     | Purpose                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Router Agent              | Decides whether the user is asking a lookup, search, summary, analysis, or clarification question |
| Business Terms Agent      | Understands business words, abbreviations, and spreadsheet terminology                            |
| File Discovery Agent      | Helps identify which file or sheet is relevant                                                    |
| Data Search Agent         | Handles direct row/value lookups                                                                  |
| Data Analysis Agent       | Handles counts, grouping, missing values, comparisons, and summaries                              |
| Answer + Validation Agent | Writes the final answer and checks that it is supported by the data                               |

The agents are Markdown instruction files. They do not contain live data. Live data should always come from the current files in the `data/` folder or configured data folder.

---

## Data Folder

The extension reads spreadsheet data from a configurable data folder.

By default, it looks for files in:

```
data/
```

For normal development, this means the extension will search files stored here:

```
siau-wei-ai-chatbot-extension/
└── data/
    └── sample CSV or Excel files
```

You can override the data location in VS Code settings:

```json
{
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

This is useful when the extension is used with another workspace, such as a SharePoint refresh project (Should be provided):

```
ccv-m365-mcp-sharepoint-refresh/
└── data/
    ├── raw_excel/
    └── csv_export/
        └── exported CSV files
```

In that setup, the SharePoint refresh project downloads or converts the latest spreadsheet files into `data/csv_export/`, and the chatbot reads from that folder.

The extension should not require agent, skill, or Markdown updates when spreadsheet data changes. To refresh the chatbot’s answers, replace or regenerate the CSV/Excel files in the configured data folder, then ask the chatbot again.

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
* Python installed and available from PowerShell
* Python packages needed by the spreadsheet tools:

  * pandas
  * openpyxl
  * python-dateutil

Install Python packages with:

```powershell
python -m pip install pandas openpyxl python-dateutil
```

For development:

* Node.js
* npm
* TypeScript dependencies from `npm.cmd install`
* Python virtual environment from `requirements.txt`

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

## Testing the Python Tools

Before testing the chatbot UI, verify that the Python tools can read and search the spreadsheet data.

The commands below assume your test data is stored in:

```
data/
```

List the available data files:

```powershell
python tools\list_files.py --data ".\data"
```

Inspect file and sheet schemas:

```powershell
python tools\inspect_workbook.py --data ".\data"
```

Test a direct lookup question:

```powershell
python tools\search_data.py --data ".\data" --question "Who owns SC00901168H0069?"
```

Test an analysis or aggregation question:

```powershell
python tools\analyze_data.py --data ".\data" --question "How many systems by owner?"
```

If these commands return valid JSON, the Python data tools are working correctly.

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
npx.cmd @vscode/vsce package --allow-missing-repository --out ".\siau-wei-ai-chatbot-extension-0.1.0.vsix"
```

This creates the installable extension file:

```
siau-wei-ai-chatbot-extension-0.1.0.vsix
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
code --install-extension ".\siau-wei-ai-chatbot-extension-0.1.0.vsix" --force
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
  "siauWeiChat.dataFolder": "data/csv_export"
}
```

Example questions:

```
Who owns SC00901168H0069?
How many systems are assigned to each owner?
Which systems are missing CPU or Database?
Show Priority 1 systems.
Summarize the current files.
```

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
  ChatPanel.createOrShow(context.extensionUri);
});
```

After making changes, recompile, repackage, reinstall the VSIX, and restart VS Code:

```powershell
npm.cmd run compile
npx.cmd @vscode/vsce package --allow-missing-repository --out ".\siau-wei-ai-chatbot-extension-0.1.0.vsix"
code --install-extension ".\siau-wei-ai-chatbot-extension-0.1.0.vsix" --force
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
code --install-extension ".\siau-wei-ai-chatbot-extension-0.1.0.vsix" --force
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
npx.cmd @vscode/vsce package --allow-missing-repository --out ".\siau-wei-ai-chatbot-extension-0.1.0.vsix"
```

### VSIX is too large

If the packaged VSIX is very large, check `.vscodeignore`.

The VSIX should exclude development-only folders:

```
.venv/**
node_modules/**
src/**
.vscode/**
*.vsix
**/__pycache__/**
**/*.pyc
```

The VSIX should include runtime folders:

```
out/
agents/
skills/
tools/
media/
```

### Data search works manually but not in the chatbot

Test the Python tool manually:

```powershell
python tools\search_data.py --data ".\data" --question "Who owns SC00901168H0069?"
```

If this works manually but fails in the chatbot, check `src/toolRunner.ts`.

The extension should call Python tools using argument arrays, not one long command string. This prevents errors when paths contain spaces, parentheses, or special characters.

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


## Package Checklist

Before sharing the VSIX, confirm these folders are included in the package:

```
out/
agents/
skills/
tools/
media/
package.json
requirements.txt
```

Confirm these folders are excluded:

```
.venv/
node_modules/
src/
.vscode/
```

To inspect the VSIX contents, run:

```powershell
npx.cmd @vscode/vsce ls --tree
```

