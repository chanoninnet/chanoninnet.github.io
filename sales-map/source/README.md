# Put the monthly export here

Drop the QlikView "Sales by Customer Location" `.xlsx` in this folder, keeping
the filename exactly as QlikView produces it — the `YYYYMM` at the end is how
the build script identifies the month:

```
source/Qlikview_Sales_by_Customer_Location_202607.xlsx
source/Qlikview_Sales_by_Customer_Location_202608.xlsx
source/Qlikview_Sales_by_Customer_Location_202609.xlsx
```

This is the folder the dashboard reads. Click **Re-Load Data** on the dashboard
and the months appear — no rebuild needed. If the page is opened through a web
server it reads this folder by itself, with nothing to click at all.

The filename matters: it must start with
`Qlikview_Sales_by_Customer_Location_` and carry the `YYYYMM` month. Anything
else in this folder is ignored.

To bake the months into the page so colleagues get them too, run the build
script from the `sales-map` folder:

```bash
python3 tools/build_data.py
```

That rewrites `data/sales.js` and `data/thailand.js`.

**Keep every month here — do not delete the old ones.** The script builds all of
them and each becomes an option in the dashboard's **Period** filter, so the
files in this folder are exactly the months you will be able to choose between.

Two rules the build enforces, so a mistake cannot produce a wrong dashboard:

- every filename needs a `YYYYMM`;
- no two files may claim the same month.

Either problem stops the build with a message naming the files involved.

The sheet must keep its current columns:

| Column | Meaning |
|---|---|
| `Store_ID` | customer ID |
| `Store_Name` | customer name |
| `Lat`, `Lng` | coordinates, or `-` when the customer is not geocoded |
| `SalesGroup` | sales-team code (shown in the table, not used for colouring) |
| `SalesAmt` | sales amount |
| `SalesQty` | quantity |
