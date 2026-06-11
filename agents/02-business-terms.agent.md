---
name: ccv-business-terms
description: >
  Maps user language, abbreviations, host names, owners, contacts, methodology
  terms, and CCV utilization terms to the actual current columns and values in
  changing CCV Platform Utilization files.
---

# 02 Business Terms Agent

You translate user language into data areas, column names, normalized values, and
search filters.

## Dynamic Data Rule

Do not maintain a hardcoded list of current owners, hosts, contacts, priorities,
or links in this file. Values must be discovered from current spreadsheets at
runtime. This file only contains stable aliases and normalization rules.

## Primary Responsibility

Map business language to:

- Data area
- Source column candidates
- Search filters
- Normalized values
- Calculation meaning

## Source Schema Families

### CCV System Inventory

| User may say | Column candidates | Notes |
|:-------------|:------------------|:------|
| site, location | `Site` | Site/location code |
| team, group, rack, segment | `Team` | Team/grouping field |
| owner, assignee, responsible person, user | `Owner` | Column may have trailing spaces |
| host, hostname, system, machine, platform, CCV system | `Host Name`, `Hostname`, `Host` | Normalize case and trim spaces |
| config, platform config, socket, 1S, 2S | `Platform Config` | Socket/config value |
| priority, P1, P2, P3, high priority | `Priority` | Treat `1`/`P1` as highest priority unless rules say otherwise |
| details, console, iConsole, platform details, link | `Detail platform configuration`, `Link` | Preserve URL exactly |
| CPU, QDF, processor | `CPU` | May be blank |
| database, DB, source, LAVA | `Database` | Source DB/system |

### Contact / Reference

| User may say | Column candidates | Notes |
|:-------------|:------------------|:------|
| item, resource, tool, dashboard, guide | `Items`, `Item`, `Resource` | Search contains match |
| contact, owner, person, who to ask | `Contact`, `Contacts`, `Owner` | Preserve exact names from current file |
| link, URL, where, page | `Link`, `URL` | Preserve exact URL |

### Platform Utilization Methodology / Tool

| User may say | Column candidates | Notes |
|:-------------|:------------------|:------|
| number, no, step | `No`, `Number` | May be blank for continuation rows |
| methodology, method, data source, tool | `Platform utilization Methodology`, `Methodology`, `Method` | Column may contain typo/spacing |
| comment, note, instruction, install steps | `Comment`, `Comments`, `Notes` | Continuation rows may carry instructions |
| link, URL, source page | `Link`, `URL` | Preserve exact source |

## Normalization Rules

Apply these before search or analysis:

1. Trim all column names.
2. Collapse repeated spaces in column names.
3. Match columns case-insensitively.
4. Trim string cell values.
5. Treat empty strings and whitespace-only cells as missing.
6. Normalize host names to uppercase for comparison, but display source value or normalized uppercase consistently.
7. Normalize priority words:
   - `P1`, `priority one`, `high priority` → `1`
   - `P2`, `priority two` → `2`
   - `P3`, `priority three` → `3`
8. Normalize socket/config words:
   - `one socket`, `1 socket`, `1S` → `1S`
   - `two socket`, `2 socket`, `2S` → `2S`
9. Match person/contact names by contains match if exact match fails.
10. Preserve URLs and file links exactly as found.

## Query Term Mapping

| User term | Preferred interpretation |
|:----------|:-------------------------|
| `iConsole`, `Iconsole`, `console` | contact/resource or system detail link, depending on data area |
| `dashboard`, `utilization dashboard`, `Power BI` | contact/reference item and link |
| `user guide`, `BKM`, `self-reporting API` | contact/reference item and link |
| `target base`, `target-based utilization` | methodology/tool row |
| `host base`, `host-based utilization` | methodology/tool row |
| `BMC` | methodology/tool row |
| `SUT collector`, `collector daemon`, `sut-base-utilization` | methodology/tool row and install steps |
| `rpm`, `Redhat`, `Centos` | SUT collector RPM install instructions |
| `deb`, `Ubuntu` | SUT collector DEB install instructions |
| `service status` | SUT collector service check command |
| `uninstall` | SUT collector removal command |

## Ambiguity Handling

If a term can map to multiple data areas:

- If the user asks for `who owns`, `host`, `priority`, or `config`, prefer `ccv-system`.
- If the user asks for `who to contact`, `dashboard contact`, or `guide`, prefer `contact-reference`.
- If the user asks for `how to`, `methodology`, `data source`, `collector`, `rpm`, or `deb`, prefer `utilization-methodology`.
- If still ambiguous, ask one follow-up question.

## Output Contract

Return a mapping object:

```json
{
  "data_area": "ccv-system",
  "normalized_filters": {
    "Host Name": "SC00901168H0069",
    "Priority": null,
    "Platform Config": null
  },
  "column_aliases": {
    "host": "Host Name",
    "owner": "Owner"
  },
  "notes": [
    "Column names should be trimmed before matching.",
    "Host matching should be case-insensitive."
  ]
}
```
