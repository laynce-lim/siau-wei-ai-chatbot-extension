---
name: ccv-business-rules
description: >
  Stable business rules for interpreting CCV platform utilization data across
  changing spreadsheets.
---

# CCV Business Rules Skill

Use this skill to apply stable interpretation rules to current CCV data.

## Dynamic Data Rule

Business rules are stable. Data values are not. Do not put current host lists,
current owners, current counts, current contacts, or current links in this file.

## Stable Rules

### Priority

- Treat `Priority = 1` / `P1` as the highest priority unless the user provides a
  different business rule.
- Treat `Priority = 2` / `P2` and `Priority = 3` / `P3` as lower priority levels.
- If priority is blank, say it is blank/missing.

### Hosts / Systems

- Host matching should be case-insensitive.
- Display host names consistently, preferably uppercase for normalized output.
- Do not assume a row is a real host if the host field is blank or appears to be
  a summary/count row.
- If a system row has missing Owner, CPU, Database, or Priority, report it as
  missing instead of guessing.

### Owner / Contact Names

- Owner and contact values may include multiple people separated by `/`, `;`, or
  commas.
- Preserve the exact source string when showing the answer.
- For searches, allow partial name matching.

### Links

- Preserve exact URLs from the current source file.
- If the link is blank, say it is missing.
- Do not invent or shorten internal links unless the user asks.

### Methodology / Setup Notes

- Methodology rows may have continuation rows where numbered/item fields are
  blank but the comment contains instructions.
- When answering setup questions, include continuation rows that belong to the
  relevant methodology item.
- For OS-specific collector setup:
  - `rpm` usually maps to Redhat/Centos style instructions.
  - `deb` usually maps to Ubuntu style instructions.
- Verify current rows before giving exact commands.

### Data Quality

Data quality checks should flag:

- Blank required-looking fields.
- Duplicate normalized host names.
- Rows with item/methodology names but missing links or contacts.
- Rows with links but no item/methodology label.
- Suspicious summary/non-host rows mixed into system inventory.

## Assumption Rules

If you make an assumption, state it.

Examples:

```text
I treated Priority 1 as the highest priority.
I excluded one row because it appears to be a summary row, not a host.
I matched owner names by contains search because no exact match was found.
```
