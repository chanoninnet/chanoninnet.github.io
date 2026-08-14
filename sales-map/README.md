# Sales by Customer Location — offline dashboard

An offline map + bar chart dashboard built from the QlikView export
`Qlikview_Sales_by_Customer_Location_2026.xlsx` (period **Full year 2026**).

**Double-click `start-dashboard.bat`** (Windows) or run `./start-dashboard.sh`
(Mac/Linux) and the dashboard opens with the months already loaded. Opening
`index.html` directly works too — see *Why not just double-click index.html?*
below for what changes.

Either way it needs **no internet connection**: the basemap is a set of
simplified Thai province polygons bundled with the page and drawn to a canvas,
so there are no map tiles and no requests leave the machine.

## What it shows

**1. Map of sales amount by customer position**
One pin per geocoded customer, placed at its latitude/longitude.

- **Pin size** is proportional to sales *area*, not diameter — the radius follows
  `sqrt(amount)`, so a pin twice as wide really is four times the sales amount.
- **Pin colour** is the customer's region.
- Pan by dragging, zoom with the wheel or the `+` / `−` / `Fit` buttons. Hover a
  pin for its full detail; click one to pin the selection and highlight it in
  the table.
- Customers with a **negative** amount (a credit or return) are drawn as dashed
  outlines rather than filled circles, so they cannot be misread as volume.

**2. Sales amount by region**
Horizontal bars with the value and share labelled directly on each bar. Clicking
a bar filters the map and table. A **Top provinces** chart sits below it for the
finer grain.

## Regions

Sales are coloured by Thailand's official **four-region** grouping (National
Statistical Office): North, Northeast, Central and South. Each customer's region
is derived from its coordinates by point-in-polygon against the province
boundaries — the source export has no region column of its own (`SalesGroup`
holds 25 sales-team codes such as `FD1`, `B21`, `20`, which is far too many to
colour, and 129 of its rows are blank).

Four is also the ceiling the colour system allows here: on a bubble map any two
pins can end up side by side, so the palette has to stay distinguishable across
*every* pair rather than just neighbouring ones, and the categorical palette
clears that bar at four simultaneous hues. Colours are assigned by region in a
fixed north-to-south order, so a region keeps its colour no matter how the sales
ranking moves.

## Data caveat — read this before using the map

**146 of the 779 customers have no coordinates in the export** (`-` in the `Lat` /
`Lng` columns). Between them they account for **฿979.2M — 42.2% of total sales**,
including the single largest customer at ฿128.7M.

They therefore cannot appear on the map at all. Rather than hide the gap, the
dashboard states it in a KPI tile, gives it its own neutral-grey row in the bar
chart, and includes those customers in the table with a "no coordinates" tag.
**The map shows well under two-thirds of the money.** Geocoding those 146
customers in the source system is what would make it whole.

Four customers carry a negative sales amount (−฿24.12 to −฿9,250).

## Files

```
start-dashboard.bat     double-click to serve + open the dashboard (Windows)
start-dashboard.sh      the same for Mac / Linux
index.html              markup
app.css                 theme tokens (light + dark) and layout
app.js                  canvas map, charts, filters, table, Excel loading
xlsx.js                 minimal in-browser .xlsx reader (no libraries)
ingest.js               sheet -> customers + regions, the browser twin of the script
folder.js               finds the exports in the fixed source/ folder
source/                 >>> put the QlikView .xlsx export here <<<
data/thailand.js        simplified province polygons  (~142 KB)
data/sales.js           779 customers, region-assigned (~116 KB)
tools/build_data.py     regenerates both data files from the .xlsx
tools/thailand.geojson  full-resolution province boundaries (build input)
```

`data/` is generated — never edit those two files by hand; re-run the script
instead.

## Loading data: two ways

**The quick way — the `source` folder and the Re-Load Data button.**

The dashboard reads one fixed folder, `source/`, and one fixed filename shape:

```
sales-map/source/Qlikview_Sales_by_Customer_Location_2026.xlsx      -> Full year 2026
sales-map/source/Qlikview_Sales_by_Customer_Location_202608.xlsx    -> August 2026
```

**The page loads these by itself when it opens** — the button is only there to
re-read the folder after dropping a new month in, and to cover the cases in the
table below where the browser will not allow reading on its own.

Each file becomes an entry in the **Period** dropdown. Loading a month that is
already present replaces it, so re-loading after a corrected export just updates
it. Excel `~$` lock files, files with any other name, and files with no year or
month are skipped — the last of those is reported so a typo does not pass
unnoticed.

### Month column

Add a **month column** to the export and one file becomes one period per month
automatically — the **Period** dropdown then lists every month in it, and
*All periods* gives the year.

The column may be called `Month`, `Period`, `YearMonth`, `YYYYMM`, `เดือน` or
`งวด`, and may sit anywhere in the sheet. Its values can be a real date,
`202601`, `2026-01`, `01/2026`, a bare `1`–`12`, or a month name in English or
Thai (`Jan`, `January`, `ม.ค.`, `มกราคม`). Thai Buddhist years are converted, so
`256901` reads as January 2026.

Without a month column the whole file is one period, named by the filename —
the current `..._2026.xlsx` export holds one row per customer with a whole-year
total, so it is a single *Full year 2026*.

If a whole-year period and that same year's months are both loaded, *All
periods* counts only the months, so the year is not added on top of itself.

### Start it this way

**Double-click `start-dashboard.bat`** (Windows) or run `./start-dashboard.sh`
(Mac/Linux). It serves the folder on `localhost` and opens the dashboard, and
that is the only mode where **everything loads with nothing to click at all** —
the page reads `source/` by itself on every open. Keep the console window open
while using it; closing it stops the server. Any Python 3 install works; nothing
else is needed.

### Why not just double-click index.html?

You can, and the dashboard works — but loading the Excel files gets harder,
because of a browser security rule rather than anything in this code:

| Opened via | Loads on open, no click? |
|---|---|
| `start-dashboard.bat` / `.sh`, or GitHub Pages | **Yes, always.** `source/` is read every time the page opens. |
| `file://` — Chrome or Edge | **Yes, after the file has been chosen once.** **Choose File…** picks the workbook and the browser remembers it, so **Re-Load Data** re-reads the same file with no dialog and the page loads it on open. |
| `file://` — Firefox or Safari | No. The file is picked each time; once loaded the data is remembered and comes back on open. |

A `file://` page is forbidden from reading any path it was not explicitly
handed, so choosing the file once is unavoidable there. It is a **file** picker
rather than a folder picker on purpose: Chrome refuses folder access for
anything it treats as sensitive — Desktop, Documents, Downloads, drive roots —
with *"Can't open this folder because it contains system files"*, but a file
the user points at directly is always allowed.

On a server that does not list directory contents (GitHub Pages), the page
cannot see what is in the folder, so it asks for the last 24 months by name.
Older months belong in a build (below) rather than in the folder.

Files can also still be dragged onto the page or picked by hand, and on
`file://` the loaded months are remembered between visits. **Clear loaded**
discards them and returns to what the page was built with. Months loaded this
way live in your browser only — to send a month to a colleague, build it in.

The reader is built from browser APIs (`DecompressionStream` + `DOMParser`), so
it still needs no libraries and no third-party code. Province assignment uses
the simplified boundaries the page draws (~450 m), so a customer within a few
hundred metres of a provincial border can fall on the other side of it compared
with the script; everything else matches exactly.

**The permanent way — the build script.** Use this for months that should ship
with the dashboard for everyone.

## Refreshing with the script — where the Excel file goes

Put the new QlikView export in **`source/`**, keeping the filename QlikView
gives it, then run the script with no arguments:

```bash
pip install openpyxl                 # once
cd sales-map
python3 tools/build_data.py
```

```
sales-map/source/
├── Qlikview_Sales_by_Customer_Location_2026.xlsx     ← a whole year, or
├── Qlikview_Sales_by_Customer_Location_202608.xlsx   ← one file per month
└── Qlikview_Sales_by_Customer_Location_202609.xlsx
```

That is the whole procedure. **Keep every month in `source/`** — the script
builds all of them, and each becomes an option in the dashboard's **Period**
filter. Nothing in the code or the HTML needs editing for a new month: the
period list, the heading, the page title and the chart subtitle all follow the
files on disk.

The period at the end of each filename is what identifies it — `2026` for a
whole year, `202608` for a single month — so the filename matters. Two files
claiming the same period, or a filename with neither, stop the build with an
explanatory message rather than producing a silently wrong dashboard.

Every run prints a per-month, per-region summary so totals can be reconciled
against QlikView:

```
Full year 2026  (Qlikview_Sales_by_Customer_Location_2026.xlsx)
  customers mapped   : 633
  customers unmapped : 146
  total sales        : 2,319,797,873.84
    North       109 customers       85,225,051.34
    ...
```

The sheet must keep its current columns (`Store_ID`, `Store_Name`, `Lat`, `Lng`,
`SalesGroup`, `SalesAmt`, `SalesQty`) — see `source/README.md`.

To build from files kept somewhere else, pass them explicitly:

```bash
python3 tools/build_data.py /path/to/*.xlsx
```

## Filtering by period

The **Period** dropdown sits first in the filter row and drives everything on the
page at once — map pins, KPI tiles, both charts and the table.

- It lists every month the page knows about — those built into `data/sales.js`
  plus any loaded through **Load Excel…** — newest first, and opens on the
  newest. Loading a month that already exists replaces it.
- Once there are two or more months it also offers **All periods**, which sums
  each customer across every month (matched by `Store_ID`). A customer's name,
  province and coordinates then come from the most recent month it appears in,
  and its map tooltip gains a "Months: 2 of 3" line showing how many months it
  traded in.
- Pin sizes are scaled *within* the selected period, so the largest customer of
  the selected month always reads as the largest pin. Pin areas are therefore
  comparable inside one period, not across two.
- Region chips, the search box and the table sort are independent of the period
  and survive a period change; the map selection is cleared and the view refits.

With a single month loaded the dropdown simply shows that month and there is no
**All periods** entry.

Province boundaries come from the public
[`apisit/thailand.json`](https://github.com/apisit/thailand.json) dataset,
Douglas-Peucker simplified to roughly 0.004° (~450 m) to keep the page light.
Eight coastal customers fall just outside the simplified shoreline and are
snapped to the nearest province.

## Accessibility

Region identity is never carried by colour alone: there is a legend, direct
value labels on every bar, per-mark tooltips, and a full customer table that
repeats the region in text. Light and dark themes are separately stepped
palettes — the toggle sits in the top right and the page also follows the OS
setting.
