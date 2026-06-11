# Project Proposal: Siau Wei AI Chatbot VS Code Extension

## Project Title
Development of a Copilot-Powered VS Code AI Chatbot for Excel/CSV Question Answering

## 1. Project Overview

This project will create a custom AI chatbot window inside Visual Studio Code. The chatbot will help users ask natural language questions about Excel and CSV files stored in the project workspace.

Instead of searching spreadsheets manually or repeatedly asking the same person through email, users will open a clean ChatGPT-style window in VS Code and ask questions directly. The chatbot will use Copilot or the VS Code Language Model API as the reasoning layer, while Python tools will read, search, and analyze the spreadsheet data.

The first version will not be built as a Microsoft Teams bot and will not use FastAPI. It will run as a VS Code extension.

## 2. Problem Statement

Many teams rely on Excel or CSV trackers to store important project, order, or status information. Answering questions from these files often requires manual searching, filtering, and interpretation.

Current issues include:

- Repetitive questions through email or chat
- Manual searching through large files
- Slow response times when the file owner is busy
- Difficulty answering deeper questions that require grouping, counting, or comparison
- Inconsistent answers when people interpret trackers differently

## 3. Proposed Solution

The proposed solution is a VS Code extension with a custom chatbot window. Users will ask questions inside the custom window. The extension will use a six-agent workflow to understand the question, locate the right data, run spreadsheet analysis when needed, and return a short answer.

The system will use:

- VS Code Webview for the custom chat interface
- Copilot / VS Code Language Model API for reasoning and response generation
- Python tools for exact spreadsheet operations
- Pandas/OpenPyXL for Excel and CSV data processing
- Agent instruction files for consistent behavior

## 4. Main Objectives

The main objectives are to:

- Build a custom ChatGPT-style chatbot window inside VS Code
- Use Copilot/model access as the reasoning layer
- Allow users to ask questions about Excel and CSV files
- Support both simple lookup questions and deeper analytical questions
- Use Python tools for exact calculations such as counting, grouping, and filtering
- Return short, clear answers
- Include source information when available
- Make the project reusable for other PMs or teams

## 5. Proposed Workflow

### User Workflow

1. User opens the VS Code project.
2. User opens the custom Siau Wei AI Chatbot window.
3. User asks a question
4. The chatbot routes the question through the six-agent flow.
5. Python tools search or analyze the Excel/CSV files.
6. Copilot/model layer generates a short final answer.
7. The answer appears in the custom window.

### Backend/Tool Workflow

1. Excel/CSV files are placed in the `data/` folder.
2. Python tools inspect available files, sheets, columns, and sample rows.
3. The Router Agent decides whether the question is lookup, search, analysis, summary, or clarification.
4. The File Discovery Agent identifies the likely file and sheet.
5. The Data Search or Data Analysis Agent runs the appropriate tool.
6. The Answer + Validation Agent checks that the answer is supported by the tool output.

## 6. Six-Agent Design

| Agent | Purpose |
|---|---|
| Router Agent | Classifies the user question and chooses the path |
| Business Terms Agent | Maps business words to data terms and column meanings |
| File Discovery Agent | Finds the most relevant file and sheet |
| Data Search Agent | Finds matching rows, values, and columns |
| Data Analysis Agent | Handles calculations using Python/Pandas |
| Answer + Validation Agent | Writes the final answer and prevents unsupported claims |

## 7. System Architecture

```text
Custom VS Code chatbot window
        ↓
VS Code extension TypeScript code
        ↓
Agent Orchestrator
        ↓
Copilot / VS Code Language Model API
        ↓
Python tools for Excel/CSV search and analysis
        ↓
Answer returned to custom window
```

## 8. Technical Stack

| Component | Tool |
|---|---|
| Development environment | VS Code |
| Custom interface | VS Code Webview |
| Extension language | TypeScript |
| AI reasoning layer | Copilot / VS Code Language Model API |
| Spreadsheet processing | Python, Pandas, OpenPyXL |
| Data storage | Local workspace `data/` folder first; SharePoint/OneDrive later if needed |
| Agent instructions | Markdown files in `agents/` and `skills/` |

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI gives an unsupported answer | Use Answer + Validation Agent and source-aware tool output |
| Excel files are messy | Use inspection tools and business term mapping |
| Advanced questions require calculations | Use Python/Pandas analysis tools |
| User asks vague questions | Router Agent sends the question to clarification |
| Copilot/model access is unavailable | Show a clear setup error and allow local tool testing separately |
| Files change frequently | Re-run tools each question so data is read fresh |

## 10. Success Criteria

The project is successful if:

- Users can open a custom chat window inside VS Code
- Users can ask questions about Excel/CSV files
- The chatbot can answer simple lookup questions
- The chatbot can answer deeper analysis questions using Python tools
- Responses are short and useful
- The answer is grounded in source data
- The chatbot asks for clarification instead of guessing when needed

## 11. Expected Benefits

This chatbot will:

- Reduce repetitive manual searching
- Reduce back-and-forth email questions
- Make spreadsheet data easier to access
- Help PMs answer common questions faster
- Support deeper questions like counts, summaries, and comparisons
- Create a reusable VS Code-based data assistant foundation
