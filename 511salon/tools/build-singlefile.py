#!/usr/bin/env python3
"""รวม index.html + CSS + JS + ฟอนต์ + ภาพ ให้เป็นไฟล์ HTML ไฟล์เดียว

ใช้สำหรับ "ส่งให้ดู" เท่านั้น — ส่งลิงก์เดียวแล้วเปิดได้เลยโดยไม่ต้องมีเซิร์ฟเวอร์
เว็บตัวจริงยังใช้ไฟล์แยกเหมือนเดิม เพราะไฟล์แยกแคชได้ทีละไฟล์และโหลดขนานกัน
ส่วนไฟล์เดียวจะบวมเพราะ base64 (+33% ของทุกไฟล์ไบนารี)

    python3 tools/build-singlefile.py  ->  dist/511salon-preview.html
"""
import base64, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
MIME = {".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg"}


def datauri(relpath):
    path = os.path.join(ROOT, relpath)
    with open(path, "rb") as fh:
        blob = fh.read()
    mime = MIME[os.path.splitext(path)[1].lower()]
    return f"data:{mime};base64," + base64.b64encode(blob).decode("ascii")


def main():
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    css = open(os.path.join(ROOT, "assets/css/main.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "assets/js/main.js"), encoding="utf-8").read()

    # ฟอนต์: url(../fonts/x.woff2) -> data URI
    css = re.sub(r"url\(\.\./fonts/([^)]+)\)",
                 lambda m: f"url({datauri('assets/fonts/' + m.group(1))})", css)

    # ยุบ <picture> เหลือ <img> ตัวเดียว: ไฟล์เดียวต้องแบกทุกขนาดทุกฟอร์แมต
    # แล้ว base64 บวกอีก 33% จะทะลุเพดานขนาดของหน้าพรีวิวทันที
    # เว็บจริงยังใช้ <picture> ครบ srcset เหมือนเดิม นี่แก้เฉพาะไฟล์พรีวิว
    html, n = re.subn(r"<picture>.*?(<img\b[^>]*>).*?</picture>", r"\1", html, flags=re.S)
    if n:
        print(f"  ยุบ <picture> {n} จุดเหลือ JPG ขนาดเดียว (เฉพาะไฟล์พรีวิว)")

    # ภาพทุกอันใน src="..." และใน data-before / data-after ของแท็บเทียบภาพ
    def swap(m):
        attr, path = m.group(1), m.group(2)
        return f'{attr}="{datauri(path)}"'
    html = re.sub(r'(src|data-before|data-after)="(assets/img/[^"]+)"', swap, html)

    # แทนที่ลิงก์ไฟล์ภายนอกด้วยเนื้อไฟล์
    # ต้องส่ง replacement เป็น lambda ไม่ใช่สตริง เพราะเนื้อ CSS/JS มี backslash
    # (เช่น regex \d ใน main.js) ซึ่ง re.sub จะตีความเป็น escape ของ template แล้วพัง
    html = re.sub(r'\s*<link rel="stylesheet" href="assets/css/main\.css">',
                  lambda _m: f"\n<style>\n{css}\n</style>", html)
    html = re.sub(r'<script type="module" src="assets/js/main\.js"></script>',
                  lambda _m: f'<script type="module">\n{js}\n</script>', html)
    # preload/favicon ที่ชี้ไฟล์แยกไม่มีความหมายในไฟล์เดียว
    html = re.sub(r'\s*<link rel="(?:preload|icon)"[^>]*>', "", html)

    left = re.findall(r'(?:src|href)="(?:assets|\.\./)[^"]*"', html)
    assert not left, f"ยังเหลือลิงก์ไฟล์ภายนอก: {left[:3]}"

    out = os.path.join(ROOT, "dist")
    os.makedirs(out, exist_ok=True)
    dest = os.path.join(out, "511salon-preview.html")
    with open(dest, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"{os.path.relpath(dest)}  {os.path.getsize(dest)/1024:.0f} KB")


if __name__ == "__main__":
    main()
