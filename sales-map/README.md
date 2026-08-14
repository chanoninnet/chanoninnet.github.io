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
app.js                  canvas map, charts, filters, table
source/                 >>> put the monthly .xlsx export here <<<
data/thailand.js        simplified province polygons  (~142 KB)
data/sales.js           522 customers, region-assigned (~79 KB)
tools/build_data.py     regenerates both data files from the .xlsx
tools/thailand.geojson  full-resolution province boundaries (build input)
```

`data/` is generated — never edit those two files by hand; re-run the script
instead.

## Monthly refresh — where the Excel file goes

Put the new QlikView export in **`source/`**, keeping the filename QlikView
gives it, then run the script with no arguments:

```bash
pip install openpyxl                 # once
cd sales-map
python3 tools/build_data.py
```

```
sales-map/source/Qlikview_Sales_by_Customer_Location_202608.xlsx   ← drop it here
```

That is the whole procedure. The script picks the file with the highest `YYYYMM`
in `source/`, works the period out of that filename, re-reads the sheet,
re-assigns every customer to a province and region, and rewrites
`data/sales.js` and `data/thailand.js`. **Nothing in the code or the HTML needs
editing for a new month** — the heading, the page title and the chart subtitle
all follow the data.

Old exports can stay in `source/`; the script always takes the newest, so there
is nothing to clean up. It prints a per-region summary on every run so the
totals can be reconciled against QlikView:

```
export : Qlikview_Sales_by_Customer_Location_202607.xlsx  ->  July 2026
customers mapped : 443
customers unmapped: 79
total sales      : 330,695,503.82
  North        68 customers        9,198,044.00
  ...
```

The sheet must keep its current columns (`Store_ID`, `Store_Name`, `Lat`, `Lng`,
`SalesGroup`, `SalesAmt`, `SalesQty`) — see `source/README.md`.

To rebuild from a file kept somewhere else, pass it explicitly:

```bash
python3 tools/build_data.py /path/to/export.xlsx
```

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
