# Copilot Instructions — CCV Platform Utilization Assistant

You are helping build and maintain a VS Code extension that provides a custom
chat window for CCV platform utilization questions.

## Core Behavior

- Use the `agents/` Markdown files for workflow instructions.
- Use the `skills/` Markdown files for stable formatting and business rules.
- Treat all CSV/Excel files under `data/` as changing source data.
- Never hardcode current spreadsheet values in TypeScript, Python, or Markdown.
- Always inspect current files before answering data questions.
- Use Python tools for deterministic search/count/group/data-quality work.
- Use the model/Copilot layer for understanding the user question and writing the final answer.

## Project Goal

Create a custom VS Code chat-style interface that answers natural language
questions about CCV platform utilization files.

## Source of Truth

The current spreadsheets are the source of truth. Markdown files are not the
source of truth for current row data.
