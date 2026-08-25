---
name: ccv-excel-question-types
description: >
  Maps natural language CCV questions to search, analysis, summary, contact,
  methodology, and data-quality workflows.
---

# CCV Excel Question Types Skill

Use this skill to decide whether a question needs row search, deterministic
analysis, contact lookup, methodology lookup, or clarification.

## Dynamic Data Rule

Question types are stable, but the answers are not. Always run against the
current spreadsheet contents.

## Question Type Matrix

| User asks | Type | Data area | Tool |
|:----------|:-----|:----------|:-----|
| Who owns host X? | lookup | `ccv-system` | `query_data.py` |
| What is the config/priority/CPU/database for host X? | lookup | `ccv-system` | `query_data.py` |
| Show all systems for owner X | filtered search | `ccv-system` | `query_data.py` |
| Show all Priority 1 systems | filtered search | `ccv-system` | `query_data.py` |
| How many systems are 1S vs 2S? | grouped analysis | `ccv-system` | `query_data.py` |
| Which owner has the most systems? | ranking analysis | `ccv-system` | `query_data.py` |
| Which rows are missing CPU/database/contact/link? | data quality | selected data area | `query_data.py` |
| Who is the contact for the utilization dashboard? | contact lookup | `contact-reference` | `query_data.py` |
| What is the iConsole link? | contact/link lookup | `contact-reference` or `ccv-system` | `query_data.py` |
| What are the platform utilization data sources? | methodology lookup | `utilization-methodology` | `query_data.py` |
| How do I install the SUT collector? | how-to | `utilization-methodology` | `query_data.py` |
| Summarize all CCV files | cross-file summary | `cross-file` | `inspect_workbook.py` + `query_data.py` |

## Lookup Questions

Lookup questions need exact or contains row matching. Include row number and
source file.

Examples:

```text
Who owns SC00901168H0069?
What priority is host X?
What is the link for the utilization dashboard?
```

## Analysis Questions

Analysis questions need deterministic calculations, not only language-model
reasoning.

Examples:

```text
How many platforms are 2S?
Which owner has the most systems?
How many rows are missing Database?
Are there duplicate hosts?
```

## Contact Questions

Contact questions usually search the contact/reference file.

Examples:

```text
Who do I contact for iConsole?
Who owns the utilization dashboard?
Where is the self-reporting API user guide?
```

## Methodology / How-To Questions

Methodology questions usually search the platform utilization tool file.

Examples:

```text
What are the utilization data sources?
What is host base utilization?
How do I install the SUT collector on Ubuntu?
How do I check the collector service status?
```

## Clarification Questions

Ask one follow-up when the user says something like:

```text
What is the status?
Who owns it?
Send me the link.
```

and there is no clear prior entity or file context.
