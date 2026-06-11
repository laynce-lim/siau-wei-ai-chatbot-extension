# CCV Platform Utilization Markdown Pack — User Guide

This Markdown pack is designed for the VS Code custom chatbot / Copilot-powered
agent project.

## What Changed

The CCV spreadsheets will constantly change, so the Markdown files now avoid
hardcoding current data. The agents describe **how to inspect, search, calculate,
and validate** the data, not what the current rows contain.

This means you should not have to update the Markdown files every time:

- A new host is added
- An owner changes
- A priority changes
- CPU/database fields are filled in
- Contacts change
- Links change
- Methodology rows are updated
- A file gets renamed or replaced

## Files Covered

The pack supports these CCV data areas:

| Data area | Example file | Purpose |
|:----------|:-------------|:--------|
| CCV system inventory | `CCV_Platform_Utilization(CCV_System).csv` | hosts, owners, site, team, platform config, priority, CPU, database |
| Contact/reference | `CCV_Platform_Utilization(Contact).csv` | contacts and links for tools/resources |
| Platform utilization methodology/tool | `CCV_Platform_Utilization(Platform utilization Tool ).csv` | data sources, BMC, SUT collector notes, install instructions, links |

## Where to Put These Files

Copy the folders into your VS Code extension project:

```text
siau-wei-ai-chatbot-extension/
  agents/
  skills/
  docs/
  .github/
```

Put the changing spreadsheets under:

```text
siau-wei-ai-chatbot-extension/data/
```

## Important Rule

Do not put live data values inside the agent Markdown files.

Good:

```text
Priority 1 means highest priority.
Always inspect current files before answering.
Search owner names by contains match.
```

Bad:

```text
There are 12 current hosts.
Jayant owns 5 systems.
The current dashboard contact is X.
```

Those values belong in the spreadsheet, not in Markdown.

## Example Questions

```text
Who owns SC00901168H0069?
How many 2S platforms are there?
Which owner has the most systems?
Show Priority 1 systems.
Which rows are missing CPU or Database?
Who is the contact for the utilization dashboard?
What is the iConsole link?
What are the platform utilization data sources?
How do I install the SUT collector on Ubuntu?
Summarize all CCV platform utilization files.
```

## Expected Agent Flow

```text
User question
  ↓
01 Router Agent
  ↓
02 Business Terms Agent
  ↓
03 File Discovery Agent
  ↓
04 Data Search Agent OR 05 Data Analysis Agent
  ↓
06 Answer + Validation Agent
  ↓
Short source-backed answer
```

## Recommended Tool Behavior

The Python tools should read the current files every time. They should:

- Trim column names.
- Normalize whitespace.
- Support CSV encodings like `utf-8-sig`, `cp1252`, and `latin1`.
- Match columns case-insensitively.
- Preserve source row numbers.
- Preserve URLs exactly.
- Return structured JSON to the extension.

## Maintenance

Update Markdown only when the **meaning or workflow** changes.

Examples where Markdown update is useful:

- A new data area is added.
- A new type of question needs routing.
- A new stable business rule is added.
- A new tool is added to the project.

Examples where Markdown update is not needed:

- New rows are added.
- Owner names change.
- Links change.
- Contacts change.
- Counts change.
- Priority values change in the data.
