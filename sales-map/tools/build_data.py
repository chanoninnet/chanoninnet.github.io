#!/usr/bin/env python3
"""Build the offline dashboard datasets.

Reads the QlikView "Sales by Customer Location" export plus a Thailand province
GeoJSON, assigns every geocoded customer to a province (point-in-polygon) and to
one of Thailand's four official regions, then writes two browser-ready JS files.

They are emitted as .js (not .json) on purpose: the dashboard has to open from a
bare file:// path with no server, and fetch() of a local JSON file is blocked
there by the browser's origin rules.

Monthly refresh — drop the new export in sales-map/source/ and run:

    python3 tools/build_data.py

With no arguments it picks the newest YYYYMM export in source/ and reads the
boundaries bundled alongside this script, so nothing has to be edited by hand.
Both can still be overridden:

    python3 tools/build_data.py <sales.xlsx> [provinces.geojson]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
SOURCE_DIR = ROOT / "source"
DEFAULT_GEOJSON = Path(__file__).resolve().parent / "thailand.geojson"

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


def period_from_name(name):
    """The reporting period a filename declares.

    Two shapes are accepted, because a QlikView export may hold one month or a
    whole year:

        ..._202607.xlsx -> ('2026-07', 'July 2026')
        ..._2026.xlsx   -> ('2026',    'Full year 2026')
    """
    month = re.search(r"(20\d{2})(0[1-9]|1[0-2])(?!\d)", name)
    if month:
        return (month.group(1) + "-" + month.group(2),
                MONTHS[int(month.group(2)) - 1] + " " + month.group(1))

    year = re.search(r"(20\d{2})(?!\d)", name)
    if year:
        return year.group(1), "Full year " + year.group(1)

    return "", ""


def collect_exports(paths=None):
    """Every monthly export to build, oldest first, as (period, label, path).

    With no explicit paths this scans source/, so adding a month is just a
    matter of dropping the file in — every month found is kept and becomes one
    option in the dashboard's period filter.
    """
    if paths is None:
        paths = [p for p in sorted(SOURCE_DIR.glob("*.xlsx"))
                 if not p.name.startswith("~$")]     # skip Excel lock files
        if not paths:
            sys.exit(
                "No .xlsx found in " + str(SOURCE_DIR) + "\n"
                "Put the monthly QlikView export there, for example\n"
                "  source/Qlikview_Sales_by_Customer_Location_202608.xlsx"
            )

    found, undated = {}, []
    for path in paths:
        period, label = period_from_name(path.name)
        if not period:
            undated.append(path.name)
            continue
        if period in found:
            sys.exit(
                "Two exports claim the same period " + period + ":\n"
                "  " + found[period][1].name + "\n  " + path.name + "\n"
                "Keep one file per month in source/."
            )
        found[period] = (label, path)

    if undated:
        sys.exit(
            "No period in these filenames:\n  " + "\n  ".join(undated) + "\n"
            "Keep the QlikView filename, ending in the year or the month:\n"
            "  Qlikview_Sales_by_Customer_Location_2026.xlsx\n"
            "  Qlikview_Sales_by_Customer_Location_202608.xlsx"
        )

    return [(period, found[period][0], found[period][1])
            for period in sorted(found)]

# Thailand's official four-region grouping (National Statistical Office). The
# four-region scheme is what the dashboard colours by: a bubble map is an
# "all pairs" chart form, where any two marks can end up side by side, and the
# categorical palette only stays colour-blind-safe up to four simultaneous hues.
REGIONS = {
    "North": [
        "Chiang Mai", "Chiang Rai", "Lampang", "Lamphun", "Mae Hong Son", "Nan",
        "Phayao", "Phrae", "Uttaradit", "Tak", "Sukhothai", "Phitsanulok",
        "Phichit", "Kamphaeng Phet", "Nakhon Sawan", "Phetchabun", "Uthai Thani",
    ],
    "Northeast": [
        "Amnat Charoen", "Bueng Kan", "Buri Ram", "Chaiyaphum", "Kalasin",
        "Khon Kaen", "Loei", "Maha Sarakham", "Mukdahan", "Nakhon Phanom",
        "Nakhon Ratchasima", "Nong Bua Lam Phu", "Nong Khai", "Roi Et",
        "Sakon Nakhon", "Si Sa Ket", "Surin", "Ubon Ratchathani", "Udon Thani",
        "Yasothon",
    ],
    "Central": [
        "Ang Thong", "Bangkok Metropolis", "Chachoengsao", "Chai Nat",
        "Chanthaburi", "Chon Buri", "Kanchanaburi", "Lop Buri", "Nakhon Nayok",
        "Nakhon Pathom", "Nonthaburi", "Pathum Thani", "Phetchaburi",
        "Phra Nakhon Si Ayutthaya", "Prachin Buri", "Prachuap Khiri Khan",
        "Ratchaburi", "Rayong", "Sa Kaeo", "Samut Prakan", "Samut Sakhon",
        "Samut Songkhram", "Saraburi", "Sing Buri", "Suphan Buri", "Trat",
    ],
    "South": [
        "Chumphon", "Krabi", "Nakhon Si Thammarat", "Narathiwat", "Phangnga",
        "Phatthalung", "Pattani", "Phuket", "Ranong", "Satun", "Songkhla",
        "Surat Thani", "Trang", "Yala",
    ],
}
PROVINCE_REGION = {p: r for r, ps in REGIONS.items() for p in ps}

# North to south, so a region always keeps the same colour slot no matter how
# the sales ranking shuffles.
REGION_ORDER = ["North", "Northeast", "Central", "South"]

# Thai display names, for a dashboard that will be read in Thailand.
REGION_TH = {
    "North": "ภาคเหนือ",
    "Northeast": "ภาคตะวันออกเฉียงเหนือ",
    "Central": "ภาคกลาง",
    "South": "ภาคใต้",
    "Unmapped": "ไม่มีพิกัด",
}

PROVINCE_TH = {
    "Amnat Charoen": "อำนาจเจริญ", "Ang Thong": "อ่างทอง",
    "Bangkok Metropolis": "กรุงเทพมหานคร", "Bueng Kan": "บึงกาฬ",
    "Buri Ram": "บุรีรัมย์", "Chachoengsao": "ฉะเชิงเทรา", "Chai Nat": "ชัยนาท",
    "Chaiyaphum": "ชัยภูมิ", "Chanthaburi": "จันทบุรี", "Chiang Mai": "เชียงใหม่",
    "Chiang Rai": "เชียงราย", "Chon Buri": "ชลบุรี", "Chumphon": "ชุมพร",
    "Kalasin": "กาฬสินธุ์", "Kamphaeng Phet": "กำแพงเพชร",
    "Kanchanaburi": "กาญจนบุรี", "Khon Kaen": "ขอนแก่น", "Krabi": "กระบี่",
    "Lampang": "ลำปาง", "Lamphun": "ลำพูน", "Loei": "เลย", "Lop Buri": "ลพบุรี",
    "Mae Hong Son": "แม่ฮ่องสอน", "Maha Sarakham": "มหาสารคาม",
    "Mukdahan": "มุกดาหาร", "Nakhon Nayok": "นครนายก", "Nakhon Pathom": "นครปฐม",
    "Nakhon Phanom": "นครพนม", "Nakhon Ratchasima": "นครราชสีมา",
    "Nakhon Sawan": "นครสวรรค์", "Nakhon Si Thammarat": "นครศรีธรรมราช",
    "Nan": "น่าน", "Narathiwat": "นราธิวาส", "Nong Bua Lam Phu": "หนองบัวลำภู",
    "Nong Khai": "หนองคาย", "Nonthaburi": "นนทบุรี", "Pathum Thani": "ปทุมธานี",
    "Pattani": "ปัตตานี", "Phangnga": "พังงา", "Phatthalung": "พัทลุง",
    "Phayao": "พะเยา", "Phetchabun": "เพชรบูรณ์", "Phetchaburi": "เพชรบุรี",
    "Phichit": "พิจิตร", "Phitsanulok": "พิษณุโลก",
    "Phra Nakhon Si Ayutthaya": "พระนครศรีอยุธยา", "Phrae": "แพร่",
    "Phuket": "ภูเก็ต", "Prachin Buri": "ปราจีนบุรี",
    "Prachuap Khiri Khan": "ประจวบคีรีขันธ์", "Ranong": "ระนอง",
    "Ratchaburi": "ราชบุรี", "Rayong": "ระยอง", "Roi Et": "ร้อยเอ็ด",
    "Sa Kaeo": "สระแก้ว", "Sakon Nakhon": "สกลนคร", "Samut Prakan": "สมุทรปราการ",
    "Samut Sakhon": "สมุทรสาคร", "Samut Songkhram": "สมุทรสงคราม",
    "Saraburi": "สระบุรี", "Satun": "สตูล", "Si Sa Ket": "ศรีสะเกษ",
    "Sing Buri": "สิงห์บุรี", "Songkhla": "สงขลา", "Sukhothai": "สุโขทัย",
    "Suphan Buri": "สุพรรณบุรี", "Surat Thani": "สุราษฎร์ธานี", "Surin": "สุรินทร์",
    "Tak": "ตาก", "Trang": "ตรัง", "Trat": "ตราด",
    "Ubon Ratchathani": "อุบลราชธานี", "Udon Thani": "อุดรธานี",
    "Uthai Thani": "อุทัยธานี", "Uttaradit": "อุตรดิตถ์", "Yala": "ยะลา",
    "Yasothon": "ยโสธร",
}


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------
def rings_of(geom):
    """Yield every ring of a Polygon/MultiPolygon as a flat list."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def ring_area(ring):
    """Unsigned shoelace area in square degrees — only used for comparisons."""
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) / 2


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_polygon(x, y, polygon):
    """polygon = [outer_ring, hole, hole, ...]"""
    if not point_in_ring(x, y, polygon[0]):
        return False
    return not any(point_in_ring(x, y, hole) for hole in polygon[1:])


def simplify(points, tol):
    """Douglas-Peucker, iterative so deep rings cannot blow the stack."""
    if len(points) < 3:
        return points[:]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        far, far_d = -1, tol
        for i in range(first + 1, last):
            px, py = points[i]
            if denom == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
                d = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if d > far_d:
                far, far_d = i, d
        if far != -1:
            keep[far] = True
            stack.append((first, far))
            stack.append((far, last))
    return [p for p, k in zip(points, keep) if k]


def clean_name(value):
    """Trim the trailing padding QlikView leaves on exported customer names."""
    text = unicodedata.normalize("NFC", str(value or "")).replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def js_dump(path, var, payload):
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"window.{var} = {text};\n", encoding="utf-8")
    return len(text)


# --------------------------------------------------------------------------
def main(exports, geojson_path):
    print("building " + str(len(exports)) + " period(s) from " + str(SOURCE_DIR))

    geo = json.loads(Path(geojson_path).read_text(encoding="utf-8"))

    provinces = []
    for feature in geo["features"]:
        name = feature["properties"]["name"]
        polys = rings_of(feature["geometry"])
        # Keep the mainland shape plus any island group big enough to survive
        # simplification; the tiny specks only add weight.
        biggest = max(ring_area(p[0]) for p in polys)
        polys = [p for p in polys if ring_area(p[0]) >= biggest * 0.004]
        provinces.append({"name": name, "polys": polys})

    # ---- assign customers, one entry per monthly export --------------------
    periods = []
    for period, label, path in exports:
        customers, unmapped, outside = read_export(path, provinces)
        periods.append({
            "period": period,
            "label": label,
            "source": path.name,
            "customers": customers,
            "unmapped": unmapped,
        })
        report_period(label, path, customers, unmapped, outside)

    # ---- write the basemap ------------------------------------------------
    features = []
    for p in provinces:
        polys = []
        for poly in p["polys"]:
            rings = []
            for ring in poly:
                pts = simplify([(c[0], c[1]) for c in ring], 0.004)
                if len(pts) >= 4:
                    rings.append([[round(x, 4), round(y, 4)] for x, y in pts])
            if rings:
                polys.append(rings)
        if polys:
            features.append({
                "name": p["name"],
                "nameTh": PROVINCE_TH.get(p["name"], p["name"]),
                "region": PROVINCE_REGION[p["name"]],
                "polys": polys,
            })

    map_bytes = js_dump(OUT / "thailand.js", "THAILAND_MAP", {
        "source": "apisit/thailand.json province boundaries, "
                  "Douglas-Peucker simplified to ~0.004deg",
        "provinces": features,
    })

    data_bytes = js_dump(OUT / "sales.js", "SALES_DATA", {
        "regionOrder": REGION_ORDER,
        "regionTh": REGION_TH,
        "provinceTh": PROVINCE_TH,
        "periods": periods,
    })

    print(f"\n{len(periods)} period(s) written: " +
          ", ".join(p["label"] for p in periods))
    print(f"thailand.js {map_bytes/1024:.0f} KB   sales.js {data_bytes/1024:.0f} KB")


def read_export(xlsx_path, provinces):
    """One month's sheet -> (mapped customers, unmapped customers, snap count)."""
    ws = openpyxl.load_workbook(xlsx_path, data_only=True)["Sheet1"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    customers, unmapped, outside = [], [], 0
    for store_id, store_name, lat, lng, group, amt, qty in rows:
        amount = float(amt or 0)
        quantity = float(qty or 0)
        name = clean_name(store_name)
        sales_group = clean_name(group)
        if sales_group == "-":
            sales_group = ""

        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            unmapped.append({
                "id": store_id, "name": name, "group": sales_group,
                "amt": amount, "qty": quantity,
            })
            continue

        province = next(
            (p["name"] for p in provinces
             if any(point_in_polygon(lng, lat, poly) for poly in p["polys"])),
            None,
        )
        if province is None:
            # Coastal customers can land just outside a simplified shoreline;
            # fall back to the nearest province centroid before giving up.
            province = nearest_province(lng, lat, provinces)
            outside += 1

        customers.append({
            "id": store_id, "name": name, "group": sales_group,
            "lat": round(float(lat), 5), "lng": round(float(lng), 5),
            "amt": amount, "qty": quantity,
            "prov": province, "region": PROVINCE_REGION[province],
        })

    return customers, unmapped, outside


def report_period(label, path, customers, unmapped, outside):
    """Per-month summary, so totals can be reconciled against QlikView."""
    total = sum(c["amt"] for c in customers) + sum(u["amt"] for u in unmapped)
    print(f"\n{label}  ({path.name})")
    print(f"  customers mapped   : {len(customers)}")
    print(f"  customers unmapped : {len(unmapped)}")
    print(f"  snapped to nearest : {outside}")
    print(f"  total sales        : {total:,.2f}")
    for region in REGION_ORDER:
        sub = [c for c in customers if c["region"] == region]
        print(f"    {region:<10} {len(sub):>4} customers  "
              f"{sum(c['amt'] for c in sub):>18,.2f}")
    print(f"    {'Unmapped':<10} {len(unmapped):>4} customers  "
          f"{sum(u['amt'] for u in unmapped):>18,.2f}")


def nearest_province(x, y, provinces):
    best, best_d = None, float("inf")
    for p in provinces:
        for poly in p["polys"]:
            for px, py in poly[0]:
                d = (px - x) ** 2 + (py - y) ** 2
                if d < best_d:
                    best, best_d = p["name"], d
    return best


if __name__ == "__main__":
    args = [Path(a) for a in sys.argv[1:]]
    geojson = DEFAULT_GEOJSON
    if args and args[-1].suffix.lower() in (".geojson", ".json"):
        geojson = args.pop()
    if not geojson.exists():
        sys.exit("Province boundaries missing: " + str(geojson))
    main(collect_exports(args or None), geojson)
