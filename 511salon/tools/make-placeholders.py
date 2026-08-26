#!/usr/bin/env python3
"""สร้างภาพ placeholder ชั่วคราวสำหรับทุกช่องภาพในหน้า landing

ใช้ระหว่างรอภาพถ่ายจริงจากทางร้าน เมื่อได้ภาพจริงแล้วให้ลบโฟลเดอร์
assets/img/placeholder/ ทิ้ง แล้วแก้ src ใน index.html ไปที่ภาพจริง
(รายละเอียดวิธีเปลี่ยนอยู่ใน README.md)

    python3 tools/make-placeholders.py
"""
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "img", "placeholder")

# (ชื่อไฟล์, กว้าง, สูง, บรรทัดบน, บรรทัดล่าง)
SLOTS = [
    ("hero",              1800, 1200, "ภาพ HERO",            "ลูกค้าหลังยืดเคราติน · แนวนอน"),
    ("og",                1200,  630, "ภาพแชร์ (OG)",         "โลโก้ + ผลงานเด่น"),
    ("rail-keratin",       900, 1200, "ยืดเคราติน",           "ผมฟอกประบ่า"),
    ("rail-treatment",     900, 1200, "เคราตินสด",            "ผมขาดจากการฟอก"),
    ("rail-volume",        900, 1200, "ยืดวอลลุ่ม",            "ตรงแต่ไม่ลีบ"),
    ("rail-perm",          900, 1200, "ดัดดิจิตอล",            "ลอนอยู่ทรงข้ามวัน"),
    ("rail-color",         900, 1200, "ทำสีผม",               "โทนน้ำตาลประกายหม่น"),
    ("rail-bleach",        900, 1200, "ฟอกสี + เชื่อมแกน",     "ไม่ขาดยุ่ย"),
    ("cmp-1-before",      1000, 1250, "ก่อน · เคส 1",         "ผมฟอกแห้งชี้ฟู"),
    ("cmp-1-after",       1000, 1250, "หลัง · เคส 1",         "ยืดเคราติน + เคราตินสด"),
    ("cmp-2-before",      1000, 1250, "ก่อน · เคส 2",         "ผมดัดเก่าปลายแตก"),
    ("cmp-2-after",       1000, 1250, "หลัง · เคส 2",         "ยืดวอลลุ่ม"),
    ("cmp-3-before",      1000, 1250, "ก่อน · เคส 3",         "ผมสีตกเป็นส้ม"),
    ("cmp-3-after",       1000, 1250, "หลัง · เคส 3",         "ฟอกสี + เชื่อมแกนผม"),
    ("branch-keha",       1200,  800, "หน้าร้านสาขา",          "BTS เคหะฯ"),
    ("branch-bangpu",     1200,  800, "หน้าร้านสาขา",          "บางปู–ตำหรุ"),
]
SLOTS += [(f"work-{i:02d}", 1000, 1250, f"ผลงาน {i:02d}", "ก่อน–หลัง") for i in range(1, 10)]

TPL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{top}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#241a22"/><stop offset=".55" stop-color="#3a2436"/><stop offset="1" stop-color="#14101a"/>
</linearGradient></defs>
<rect width="{w}" height="{h}" fill="url(#g)"/>
<rect x="{m}" y="{m}" width="{iw}" height="{ih}" fill="none" stroke="#C79A4B" stroke-opacity=".38" stroke-width="{sw}" stroke-dasharray="{da}"/>
<g fill="#F0E6D6" font-family="'IBM Plex Sans Thai','Noto Sans Thai','Sarabun',sans-serif" text-anchor="middle">
<text x="{cx}" y="{y1}" font-size="{f1}" font-weight="600">{top}</text>
<text x="{cx}" y="{y2}" font-size="{f2}" fill="#C79A4B">{bottom}</text>
<text x="{cx}" y="{y3}" font-size="{f3}" fill="#8d8296" font-family="'IBM Plex Mono',monospace">{w} × {h}</text>
</g></svg>
"""


def build(name, w, h, top, bottom):
    m = round(min(w, h) * 0.035)
    base = min(w, h)
    return TPL.format(
        w=w, h=h, m=m, iw=w - 2 * m, ih=h - 2 * m,
        sw=max(2, round(base * 0.004)), da=f"{round(base*0.03)} {round(base*0.022)}",
        cx=w // 2, y1=round(h * 0.47), y2=round(h * 0.47 + base * 0.075),
        y3=round(h * 0.47 + base * 0.145),
        f1=round(base * 0.062), f2=round(base * 0.042), f3=round(base * 0.032),
        top=top, bottom=bottom,
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, w, h, top, bottom in SLOTS:
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(build(name, w, h, top, bottom))
        total += os.path.getsize(path)
    print(f"สร้าง {len(SLOTS)} ไฟล์ รวม {total/1024:.1f} KB ใน {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
