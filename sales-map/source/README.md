# Put the monthly export here

Drop the QlikView "Sales by Customer Location" `.xlsx` in this folder, keeping
the filename exactly as QlikView produces it — the `YYYYMM` at the end is how
the build script identifies the month:

```
source/Qlikview_Sales_by_Customer_Location_202607.xlsx
source/Qlikview_Sales_by_Customer_Location_202608.xlsx
source/Qlikview_Sales_by_Customer_Location_202609.xlsx
```

Then either click **Re-Load Data** on the dashboard and point it at this folder
once — after that every click re-reads it, so a new month only needs the file
dropped in here — or, to bake the months into the page for everyone, run the
build script.

From the `sales-map` folder:

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
