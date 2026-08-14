# Put the QlikView export here

Drop the QlikView "Sales by Customer Location" `.xlsx` in this folder, keeping
the filename exactly as QlikView produces it — the period at the end is how
the build script identifies it:

```
source/Qlikview_Sales_by_Customer_Location_2026.xlsx      <- a whole year
source/Qlikview_Sales_by_Customer_Location_202608.xlsx    <- or a single month
```

This is the folder the dashboard reads. Click **Re-Load Data** on the dashboard
and the data appears — no rebuild needed. If the page is opened through a web
server it reads this folder by itself, with nothing to click at all.

The filename matters: it must start with
`Qlikview_Sales_by_Customer_Location_` and end with the period: `2026` for a
whole year, `202608` for a month. Anything else in this folder is ignored.

A file with a **month column** is split into one period per month on its own.
Without one, the whole file is a single period named by the filename — the
current year export holds one row per customer with a whole-year total, so it is
one period. Either way the **Period** dropdown switches between what is loaded.

To bake the data into the page so colleagues get it too, run the build script
from the `sales-map` folder:

```bash
python3 tools/build_data.py
```

That rewrites `data/sales.js` and `data/thailand.js`.

**Keep every export here — do not delete the old ones.** The script builds all
of them and each becomes an option in the dashboard's **Period** filter, so the
files in this folder are exactly the periods you will be able to choose between.

Two rules the build enforces, so a mistake cannot produce a wrong dashboard:

- every filename needs a year or a month;
- no two files may claim the same period.

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
