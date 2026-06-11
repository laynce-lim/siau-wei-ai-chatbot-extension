# CCV Platform Utilization Schema Guide

This file documents stable schema families for the CCV platform utilization
agent. It should not contain live row values.

## Dynamic Schema Policy

The source files change often. Treat this guide as schema guidance only. Current
values must always come from the current CSV/Excel files.

## Schema Families

### CCV System Inventory

Expected header signals:

```text
Site
Team
Owner
Host Name
Platform Config
Priority
Detail platform configuration
CPU
Database
```

Columns may include trailing spaces or slight capitalization differences.

### Contact / Reference

Expected header signals:

```text
Items
Contact
Link
```

### Platform Utilization Methodology / Tool

Expected header signals:

```text
No
Platform utilization Methodology
Comment
Link
```

Column text may contain spelling variations such as `utlization`.

## Normalization

- Trim headers and values.
- Convert non-breaking spaces to normal spaces.
- Collapse repeated whitespace.
- Match headers case-insensitively.
- Preserve source values for final display.
