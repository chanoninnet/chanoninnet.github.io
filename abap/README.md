# ZSD_SALES_ORDER_REPORT

Sales Order report for **SAP ERP (SAP ECC 6.0)** written in classical ABAP.
It extracts Sales Order **Header / Item**, **Header status**, **Header & Item
long text**, the **Sold-to name** and **status descriptions**, and presents
them in an interactive ALV grid with **drill-down into VA03**.

## Data sources

| Table  | Description                                        | Used for |
|--------|----------------------------------------------------|----------|
| `VBAK` | Sales Document: Header Data                         | Header (order type, sales org, sold-to, net value…) |
| `VBAP` | Sales Document: Item Data                           | Item (material, qty, unit, plant, item net value…) |
| `VBUK` | Sales Document: Header Status                       | Overall processing / delivery / billing / rejection status |
| `STXH` | SAPscript Text File Header                          | Existence index for header **and** item long text |
| `KNA1` | Customer Master                                    | Sold-to name (`NAME1`, joined on `KUNNR`) |

## Long texts

Long texts are SAPscript texts, so `STXH` only serves as the fast existence
index; the actual text lines are read through **`READ_TEXT`**:

| Text                | Object | ID     | Name             |
|---------------------|--------|--------|------------------|
| Header note         | `VBBK` | `0001` | `VBELN`          |
| Header text Z020    | `VBBK` | `Z020` | `VBELN`          |
| Header text Z037    | `VBBK` | `Z037` | `VBELN`          |
| Header text Z086    | `VBBK` | `Z086` | `VBELN`          |
| Item                | `VBBP` | `0001` | `VBELN` + `POSNR`|

Language = logon language (`SY-LANGU`). Each header text ID has its own output
column; the column heading is the text-ID description read from **`TTXIT`**
(object `VBBK`, logon language), with a generic fallback if none is maintained.
The set of header text IDs is held in a `RANGES` table (`gr_tdid`), so the
`STXH` index and `TTXIT` descriptions are fetched in one read each.

## Status descriptions

The single-character overall status fields `GBSTK` / `LFSTK` / `FKSTK` /
`ABSTK` all use domain **`STATV`**. The report reads that domain's fixed-value
texts once via `DD_DOMVALUES_GET` and shows both the raw code **and** its
description (e.g. `A` → *Not yet processed*, `B` → *Partially processed*,
`C` → *Completely processed*).

## Drill-down

Double-clicking any ALV row (`&IC1`) sets SPA/GPA parameter `AUN` to the sales
document and calls transaction **`VA03`** (display sales order) skipping the
first screen, via the `i_callback_user_command` callback.

## Selection screen

| Field       | Description        |
|-------------|--------------------|
| `S_VBELN`   | Sales Document     |
| `S_AUART`   | Order Type         |
| `S_VKORG`   | Sales Organization |
| `S_KUNNR`   | Sold-to Party      |
| `S_ERDAT`   | Created On         |
| `P_TEXT`    | Read Header Long Text (checkbox, default on) |
| `P_ITEXT`   | Read Item Long Text (checkbox, default on) |

## Logic

1. Read `VBAK` by the selection criteria.
2. Read `VBAP`, `VBUK`, `KNA1` and the `STXH` indexes (`VBBK` header, `VBBP`
   item) with `FOR ALL ENTRIES`.
3. Load the `STATV` domain texts.
4. For each header, read the header long text once; for each item, read the
   item long text (only when an `STXH` index entry exists, to avoid needless
   `READ_TEXT` calls).
5. Expand to one output row per item (headers without items still yield one row).
6. Display with `REUSE_ALV_GRID_DISPLAY`; double-click drills into `VA03`.

## Notes / adapting

- The text IDs `0001` / objects `VBBK` (header) and `VBBP` (item) are the SAP
  standard for the sales order header/item notes. Adjust `TDID` / `TDOBJECT`
  if your configuration uses a different text type.
- `STXH-TDNAME` is `CHAR 70`; because old kernels require identical type and
  length in a `FOR ALL ENTRIES` comparison, a `TDNAME`-typed driver table is
  built before each `STXH` read.
- Import into the system via the ABAP editor (SE38) creating report
  `ZSD_SALES_ORDER_REPORT`.
