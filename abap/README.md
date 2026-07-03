# ZSD_SALES_ORDER_REPORT

Sales Order report for **SAP ERP (SAP ECC 6.0)** written in classical ABAP.
It extracts Sales Order **Header / Item**, **Header status** and **Header long
text** and presents them in an interactive ALV grid.

## Data sources

| Table  | Description                                        | Used for |
|--------|----------------------------------------------------|----------|
| `VBAK` | Sales Document: Header Data                         | Header (order type, sales org, sold-to, net value…) |
| `VBAP` | Sales Document: Item Data                           | Item (material, qty, unit, plant, item net value…) |
| `VBUK` | Sales Document: Header Status                       | Overall processing / delivery / billing / rejection status |
| `STXH` | SAPscript Text File Header                          | Existence index for the header long text |

The header **long text** itself is stored as SAPscript text, so `STXH` only
serves as the fast existence index. The actual text lines are read through the
standard function module **`READ_TEXT`** with:

- **Text object** `VBBK` (sales document header text)
- **Text ID** `0001` (header note)
- **Text name** = the sales document number (`VBELN`)
- **Language** = logon language (`SY-LANGU`)

## Selection screen

| Field       | Description        |
|-------------|--------------------|
| `S_VBELN`   | Sales Document     |
| `S_AUART`   | Order Type         |
| `S_VKORG`   | Sales Organization |
| `S_KUNNR`   | Sold-to Party      |
| `S_ERDAT`   | Created On         |
| `P_TEXT`    | Read Header Long Text (checkbox, default on) |

## Logic

1. Read `VBAK` by the selection criteria.
2. Read `VBAP`, `VBUK` and `STXH` with `FOR ALL ENTRIES` on the selected headers.
3. For each header, read the long text once via `READ_TEXT` (only when an
   `STXH` index entry exists, to avoid unnecessary FM calls).
4. Expand to one output row per item (headers without items still yield one row).
5. Display the merged result with `REUSE_ALV_GRID_DISPLAY`.

## Notes / adapting

- The header text ID `0001` / object `VBBK` are the SAP standard for the sales
  order header note. Adjust `TDID` / `TDOBJECT` if your configuration uses a
  different text type.
- On very high-volume systems consider replacing the header-loop item read with
  a sorted/hashed access or restricting `VBAP` fields in the `SELECT`.
- Import into the system via the ABAP editor (SE38) creating report
  `ZSD_SALES_ORDER_REPORT`.
