---
name: ccv-answer-format
description: >
  Standard answer formatting rules for CCV platform utilization questions.
  Designed for short, source-backed answers in a custom VS Code chat window.
---

# CCV Answer Format Skill

Use this skill whenever returning the final user-facing answer.

## Core Style

- Answer directly first.
- Keep it short and business-readable.
- Include source file and row numbers when useful.
- Use compact tables for multiple rows.
- Clearly say when a value is blank or missing.
- Do not over-explain the agent workflow unless the user asks.

## Dynamic Data Note

The CCV files change constantly. Do not say or imply that counts, contacts,
owners, priorities, links, or host lists are stored in Markdown. Current values
must come from the current file/tool output.

## Preferred Response Shapes

### Direct lookup

```text
<Direct answer>.
Source: <file>, row <row_number>.
```

### Multi-row list

```markdown
I found <N> matching rows in <file>:

| Row | Host/Item | Owner/Contact | Key value |
|:----|:----------|:--------------|:----------|
| ... | ... | ... | ... |
```

### Count answer

```text
There are <N> <thing> in the current <file>.
```

If helpful, add a top breakdown table.

### Missing data answer

```text
I found <N> rows with missing <field>.
```

Show up to 10 examples unless the user asks for all rows.

### How-to answer

Use numbered steps only when the source file contains steps or ordered
instructions.

## Source Line

Use one of these:

```text
Source: CCV_Platform_Utilization(CCV_System).csv, rows 2-4.
Source: CCV_Platform_Utilization(Contact).csv, row 3.
Source: CCV_Platform_Utilization(Platform utilization Tool ).csv, rows 7-14.
```

## Confidence Language

Use cautious language when needed:

| Situation | Phrase |
|:----------|:-------|
| Exact row match | `I found an exact match.` |
| Contains/partial match | `I found matching rows that contain that term.` |
| Multiple possible matches | `I found multiple possible matches.` |
| Missing field | `That field is blank in the current file.` |
| No match | `I could not find that in the current file.` |
| Multiple files | `I used the file with the best schema match.` |

## Do Not Include

- Internal JSON unless debugging.
- Long tool logs.
- Unverified assumptions.
- Old baseline counts.
- Current row values copied into Markdown.
