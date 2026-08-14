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
index.html            markup
app.css               theme tokens (light + dark) and layout
app.js                canvas map, charts, filters, table
data/thailand.js      simplified province polygons  (~142 KB)
data/sales.js         522 customers, region-assigned (~79 KB)
tools/build_data.py   regenerates both data files from the .xlsx
```

## Rebuilding the data

After a new monthly export, drop it in and re-run:

```bash
pip install openpyxl
python3 tools/build_data.py path/to/Qlikview_Sales_by_Customer_Location_YYYYMM.xlsx path/to/thailand.geojson
```

The script re-reads the sheet, re-assigns every customer to a province and
region, re-simplifies the boundaries, and rewrites `data/thailand.js` and
`data/sales.js`. It prints a per-region summary so the totals can be checked
against QlikView. Update the `period` string in the script and the heading in
`index.html` for the new month.

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
