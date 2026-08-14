# Put the monthly export here

Drop the QlikView "Sales by Customer Location" `.xlsx` in this folder, keeping
the filename exactly as QlikView produces it — the `YYYYMM` at the end is how
the build script picks the newest file and works out the period shown on the
dashboard:

```
source/Qlikview_Sales_by_Customer_Location_202608.xlsx
```

Then, from the `sales-map` folder, run:

```bash
python3 tools/build_data.py
```

That rewrites `data/sales.js` and `data/thailand.js`, and the dashboard heading
updates itself. Old months can stay here — the script always uses the highest
`YYYYMM`, so nothing needs deleting.

The sheet must keep its current columns:

| Column | Meaning |
|---|---|
| `Store_ID` | customer ID |
| `Store_Name` | customer name |
| `Lat`, `Lng` | coordinates, or `-` when the customer is not geocoded |
| `SalesGroup` | sales-team code (shown in the table, not used for colouring) |
| `SalesAmt` | sales amount |
| `SalesQty` | quantity |
