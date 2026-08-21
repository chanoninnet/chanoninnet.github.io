# Sales by Customer Location — offline dashboard

An offline map + bar chart dashboard built from the QlikView export
`Qlikview_Sales_by_Customer_Location_202607.xlsx` (period **July 2026**).

Open `index.html` — that is the whole thing. It runs from a plain `file://`
path with **no web server and no internet connection**: the basemap is a set of
simplified Thai province polygons bundled with the page and drawn to a canvas,
so there are no map tiles and no network requests at all.

## What it shows

**1. Map of sales amount by customer position**
One pin per geocoded customer, placed at its latitude/longitude.

- **Pin size** is proportional to sales *area*, not diameter — the radius follows
  `sqrt(amount)`, so a pin twice as wide really is four times the sales amount.
- **Pin colour** is the customer's region.
- Pan by dragging, zoom with the wheel or the `+` / `−` / `Fit` buttons. Hover a
  pin for its full detail; click one to pin the selection and highlight it in
  the table.
- The two customers with a **negative** amount (a credit or return) are drawn as
  dashed outlines rather than filled circles, so they cannot be misread as volume.

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
colour, and 70 of its rows are blank).

Four is also the ceiling the colour system allows here: on a bubble map any two
pins can end up side by side, so the palette has to stay distinguishable across
*every* pair rather than just neighbouring ones, and the categorical palette
clears that bar at four simultaneous hues. Colours are assigned by region in a
fixed north-to-south order, so a region keeps its colour no matter how the sales
ranking moves.

## Data caveat — read this before using the map

**79 of the 522 customers have no coordinates in the export** (`-` in the `Lat` /
`Lng` columns). Between them they account for **฿154.8M — 46.8% of total sales**,
including the single largest customer at ฿29.0M.

They therefore cannot appear on the map at all. Rather than hide the gap, the
dashboard states it in a KPI tile, gives it its own neutral-grey row in the bar
chart, and includes those customers in the table with a "no coordinates" tag.
**The map shows just over half of the money.** Geocoding those 79 customers in
the source system is what would make it whole.

Two customers carry a negative sales amount (−฿9,768 and −฿323.70).

## Files

```
index.html              markup
app.css                 theme tokens (light + dark) and layout
app.js                  canvas map, charts, filters, table, Excel loading
xlsx.js                 minimal in-browser .xlsx reader (no libraries)
csv.js                  .csv / .txt / .tsv reader, delimiter + encoding sniffing
ingest.js               sheet -> customers + regions, the browser twin of the script
source/                 >>> put the monthly .xlsx export here <<<
data/thailand.js        simplified province polygons  (~142 KB)
data/sales.js           522 customers, region-assigned (~79 KB)
tools/build_data.py     regenerates both data files from the .xlsx
tools/thailand.geojson  full-resolution province boundaries (build input)
```

`data/` is generated — never edit those two files by hand; re-run the script
instead.

## Loading a month: two ways

**The quick way — the Load Data button.** Click **Load Data…** in the top right
(or drag the file anywhere onto the page) and pick a QlikView export. The page
reads it, assigns regions, and switches to that month straight away. No Python,
no command line, no rebuild.

### File formats

**`.csv`, `.txt`, `.tsv` and `.xlsx` all work**, in the browser and in the build
script alike. Plain text is the simpler path — no ZIP, no XML — so prefer it if
QlikView can export either.

The reader works out the details itself:

- **Delimiter**: comma, tab, semicolon or pipe.
- **Encoding**: UTF-8, UTF-8 with BOM, UTF-16, or **Windows-874 / TIS-620**.
  That last one matters — Excel and QlikView often save Thai text as Windows-874
  rather than UTF-8, and reading it as UTF-8 would turn every Thai customer name
  into mojibake. A byte-order mark wins; otherwise a strict UTF-8 decode is
  tried and Windows-874 is the fallback when it fails.
- **Quoted fields**, including ones holding the delimiter or a line break.
- **Amounts written with thousands separators** (`1,234.56`).

The columns and the filename rule are the same whatever the format: the header
row must carry `Store_ID`, `Store_Name`, `Lat`, `Lng`, `SalesGroup`, `SalesAmt`,
`SalesQty`, and the filename must end in the `YYYYMM` month.

- Several files can be picked at once, and formats can be mixed.
- Loaded months are remembered in the browser and come back next time you open
  the page. **Clear loaded** removes them again.
- They live in *your browser only*. Sending the folder to a colleague sends the
  months built by the script, not the ones you loaded — for that, use the
  script way below.
- The reader is built from browser APIs (`DecompressionStream` + `DOMParser`),
  so it still needs no libraries and no network. On a browser too old to
  support it, the button explains that and the script route still works.
- Province assignment here uses the simplified boundaries the page draws
  (~450 m), so a customer within a few hundred metres of a provincial border
  can fall on the other side of it compared with the script. Everything else
  matches exactly.

**The permanent way — the build script.** Use this for months that should ship
with the dashboard for everyone.

## Monthly refresh with the script — where the Excel file goes

Put the new QlikView export in **`source/`**, keeping the filename QlikView
gives it, then run the script with no arguments:

```bash
pip install openpyxl                 # once
cd sales-map
python3 tools/build_data.py
```

```
sales-map/source/
├── Qlikview_Sales_by_Customer_Location_202607.xlsx
├── Qlikview_Sales_by_Customer_Location_202608.xlsx   ← drop each new month here
└── Qlikview_Sales_by_Customer_Location_202609.xlsx
```

That is the whole procedure. **Keep every month in `source/`** — the script
builds all of them, and each becomes an option in the dashboard's **Period**
filter. Nothing in the code or the HTML needs editing for a new month: the
period list, the heading, the page title and the chart subtitle all follow the
files on disk.

The `YYYYMM` in each filename is what identifies the month, so the filename
matters. Two files claiming the same month, or a filename with no `YYYYMM`, stop
the build with an explanatory message rather than producing a silently wrong
dashboard.

Every run prints a per-month, per-region summary so totals can be reconciled
against QlikView:

```
July 2026  (Qlikview_Sales_by_Customer_Location_202607.xlsx)
  customers mapped   : 443
  customers unmapped : 79
  total sales        : 330,695,503.82
    North        68 customers        9,198,044.00
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
