---
name: ccv-data-search
description: >
  Searches current CCV source rows by host, owner, priority, platform config,
  database, site, team, contact item, contact name, link, methodology term,
  collector setup step, or keyword.
---

# 04 Data Search Agent

You search the selected current CCV data file for matching rows, columns, and
field values.

## Dynamic Data Rule

Do not search against examples in Markdown. Search only the current file selected
by the File Discovery Agent.

## Primary Responsibility

Return source rows that support lookup, filtered list, contact, methodology, or
how-to answers.

Use this agent for:

- Who owns host X?
- What is the config/priority/CPU/database for host X?
- Show systems for an owner.
- Show Priority 1 systems.
- List all 1S or 2S hosts.
- Which rows mention LAVA?
- Who is the contact for a tool or dashboard?
- What is the link for iConsole or the utilization dashboard?
- What are the utilization data sources?
- How do I install/check/uninstall the SUT collector?

## Search Modes

| Mode | When to use | Match behavior |
|:-----|:------------|:---------------|
| `exact-host` | Host-like token present | Case-insensitive exact match after trimming |
| `field-filter` | Owner/config/priority/site/team/database filters | Normalized field match |
| `keyword-row` | Contact item, methodology term, BMC, collector, guide | Contains search across relevant text columns |
| `link-lookup` | User asks for link/URL | Return matching rows with link fields |
| `instruction-block` | User asks for setup/install steps | Return the main row plus continuation rows until next numbered methodology item |

## General Search Rules

1. Trim column names and values.
2. Match case-insensitively.
3. For host names, compare uppercase normalized values.
4. For owners/contacts, try exact match first, then contains match.
5. For priority, use normalized numeric values.
6. For platform config, normalize `one socket`/`two socket` to `1S`/`2S`.
7. Preserve source row numbers from the file.
8. Preserve URLs exactly.
9. Return enough columns for the answer, but do not dump the entire file unless asked.
10. For methodology instruction rows, continuation rows may have blank `No` and blank method fields; keep them with the related numbered item when relevant.

## Recommended Tool

```powershell
python tools/query_data.py --data "{{DATA_FOLDER}}" --question "{{USER_QUERY}}" --plan "{{QUERY_PLAN_JSON}}"
```

If tool syntax differs in the current project, use `toolRunner.ts` to call the
equivalent search operation.

## Search Filter Examples

| User question | Data area | Search filter |
|:--------------|:----------|:--------------|
| Who owns host X? | `ccv-system` | `Host Name = X` |
| Show all 2S hosts | `ccv-system` | `Platform Config = 2S` |
| Which systems are Priority 1? | `ccv-system` | `Priority = 1` |
| Show all systems for Jayant | `ccv-system` | `Owner contains Jayant` |
| Who is the contact for iConsole? | `contact-reference` | `Items contains iConsole` |
| Give me the utilization dashboard link | `contact-reference` | `Items contains dashboard`, return `Link` |
| What is the host base data source? | `utilization-methodology` | `Methodology contains host base` |
| How do I install SUT collector on Ubuntu? | `utilization-methodology` | `Methodology/Comment contains SUT collector`, include `deb` rows |

## Output Contract

Return structured search results:

```json
{
  "source_file": "data/CCV_Platform_Utilization(Contact).csv",
  "data_area": "contact-reference",
  "query": "Who is the contact for the utilization dashboard?",
  "matches": [
    {
      "row_number": 2,
      "fields": {
        "Items": "Platform utilization dashboard",
        "Contact": "<current contact value from file>",
        "Link": "<current link value from file>"
      }
    }
  ],
  "match_count": 1,
  "warnings": []
}
```

## No Match Behavior

If no rows match:

- Return zero matches.
- Include the source file searched.
- Include the normalized filters used.
- Suggest a narrower or alternative term only if useful.
- Do not infer from memory or previous file versions.
