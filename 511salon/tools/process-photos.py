#!/usr/bin/env python3
"""แปลงภาพถ่ายจริงเป็นชุดไฟล์สำหรับเว็บ แล้วเปลี่ยน index.html ให้ใช้ภาพนั้น

    pip install pillow
    python3 tools/process-photos.py                 # ทำทุกช่องที่มีไฟล์ต้นฉบับ
    python3 tools/process-photos.py hero work-01    # เฉพาะบางช่อง
    python3 tools/process-photos.py --list          # ดูว่าช่องไหนมีภาพจริงแล้วบ้าง
    python3 tools/process-photos.py --dry-run       # ดูว่าจะทำอะไร โดยยังไม่แตะไฟล์

    # ชี้ไปโฟลเดอร์ภาพที่ไหนก็ได้ ไม่ต้องก็อปมาก่อน และจับไฟล์เข้าช่องเองได้
    python3 tools/process-photos.py --from ~/MyProjects/hair-photo \
        hero=IMG_1234.jpg work-05=IMG_1240.jpg

วิธีใช้
  1. วางภาพต้นฉบับไว้ที่ assets/img/_originals/ ตั้งชื่อตามช่อง เช่น hero.jpg,
     work-01.jpg, cmp-1-before.jpg  (รายชื่อช่องทั้งหมดอยู่ใน PHOTOS.md)
     ไฟล์ต้นฉบับใส่ความละเอียดสูงสุดที่มีได้เลย สคริปต์จะย่อเอง
  2. รันสคริปต์ จะได้ <ช่อง>-480/960/1600 ทั้ง .avif .webp .jpg
  3. สคริปต์จะแก้ index.html ให้เอง: <img> ที่ยังชี้ภาพชั่วคราวจะกลายเป็น
     <picture> ที่มี srcset ครบ โดยคง alt/width/height/loading เดิมไว้

การครอบตัด
  แต่ละช่องมีสัดส่วนตายตัว (ดู SLOTS) สคริปต์ครอบตัดจากกึ่งกลางแนวนอน และจาก
  ระยะ 38% จากขอบบนในแนวตั้ง เพราะใบหน้าคนมักอยู่ค่อนไปทางบน
  ถ้าช่องไหนครอบไม่สวย สร้าง assets/img/_originals/focus.json แล้วใส่จุดโฟกัส
  เป็นเปอร์เซ็นต์ เช่น  {"hero": [50, 25], "work-03": [40, 50]}
"""
import json, os, re, sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("ต้องติดตั้ง Pillow ก่อน:  pip install pillow")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "assets", "img", "_originals")
OUT = os.path.join(ROOT, "assets", "img")
HTML = os.path.join(ROOT, "index.html")

WIDTHS = (480, 960, 1600)
FORMATS = (("avif", {"quality": 55}), ("webp", {"quality": 78, "method": 6}), ("jpg", {"quality": 82, "progressive": True, "optimize": True}))

# ช่อง -> (สัดส่วน กว้าง/สูง, sizes attribute)
PORTRAIT = (4 / 5, "(max-width:860px) 88vw, 25vw")
CARD = (3 / 4, "(max-width:860px) 78vw, 290px")
# hero-portrait เป็นช่องเสริม ถ้ามีไฟล์นี้จะถูกใช้บนจอแคบแทน hero เพราะภาพแนวนอน
# พอ object-fit:cover ลงจอมือถือแนวตั้ง จะถูกตัดด้านข้างจนเสียองค์ประกอบ
SLOTS = {
    "hero":          (3 / 4, "46vw"),
    "hero-portrait": (3 / 4, "100vw"),
    "og":          (1200 / 630, "100vw"),
    "branch-keha": (3 / 2, "(max-width:860px) 100vw, 46vw"),
    **{f"rail-{k}": CARD for k in ("keratin", "treatment", "volume", "perm", "color", "bleach")},
    **{f"cmp-{i}-{s}": (4 / 5, "(max-width:860px) 92vw, 520px") for i in (1, 2, 3) for s in ("before", "after")},
    **{f"work-{i:02d}": PORTRAIT for i in range(1, 10)},
}
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff")


def find_source(slot, src_dir, explicit=None):
    if explicit:
        path = explicit if os.path.isabs(explicit) else os.path.join(src_dir, explicit)
        return path if os.path.exists(path) else None
    for ext in EXTS:
        for name in (slot + ext, slot + ext.upper()):
            path = os.path.join(src_dir, name)
            if os.path.exists(path):
                return path
    return None


def crop_to(im, ratio, focus):
    """ครอบตัดให้ได้สัดส่วนที่ต้องการโดยไม่บีบภาพ

    focus = [x%, y%] หรือ [x%, y%, zoom]
    zoom > 1 ทำให้กรอบเล็กลง จึงเลื่อนกรอบได้ทั้งสองแกน ใช้ตอนที่อยากให้ตัวแบบ
    ไปอยู่ฝั่งใดฝั่งหนึ่งของภาพ เช่น hero ที่ต้องเว้นที่ว่างไว้วางพาดหัว
    """
    w, h = im.size
    fx, fy = focus[0], focus[1]
    zoom = focus[2] if len(focus) > 2 else 1.0
    new_w, new_h = (round(h * ratio), h) if w / h > ratio else (w, round(w / ratio))
    if zoom > 1:
        new_w, new_h = round(new_w / zoom), round(new_h / zoom)
    left = round((w - new_w) * fx / 100)
    top = round((h - new_h) * fy / 100)
    left = max(0, min(left, w - new_w))
    top = max(0, min(top, h - new_h))
    return im.crop((left, top, left + new_w, top + new_h))


def build(slot, path, focus_map, dry):
    ratio, _sizes = SLOTS[slot]
    focus = focus_map.get(slot, (50, 38))
    made = []
    if dry:
        return [f"{slot}-{w}.{e}" for w in WIDTHS for e, _ in FORMATS]

    with Image.open(path) as raw:
        im = ImageOps.exif_transpose(raw).convert("RGB")
        im = crop_to(im, ratio, focus)
        for width in WIDTHS:
            if width > im.width:
                # ไม่ขยายภาพให้ใหญ่กว่าต้นฉบับ ภาพจะเบลอเปล่า ๆ
                continue
            height = round(width / ratio)
            small = im.resize((width, height), Image.LANCZOS)
            for ext, opts in FORMATS:
                dest = os.path.join(OUT, f"{slot}-{width}.{ext}")
                small.save(dest, format="JPEG" if ext == "jpg" else ext.upper(), **opts)
                made.append(os.path.basename(dest))
    return made


def widths_for(slot):
    return [w for w in WIDTHS if os.path.exists(os.path.join(OUT, f"{slot}-{w}.jpg"))]


def source_lines(slot, ext, pad, media=""):
    ws = widths_for(slot)
    srcset = ",\n".join(f"{pad}                  assets/img/{slot}-{w}.{ext} {w}w" for w in ws).lstrip()
    mq = f'media="{media}" ' if media else ""
    mime = "jpeg" if ext == "jpg" else ext
    return [f'{pad}  <source {mq}type="image/{mime}" sizes="{SLOTS[slot][1]}"',
            f'{pad}          srcset="{srcset}">']


def picture_tag(slot, img_tag, indent):
    """สร้าง <picture> จาก <img> เดิม โดยคง attribute ที่สำคัญไว้ทั้งหมด"""
    ws = widths_for(slot)
    if not ws:
        return None
    keep = dict(re.findall(r'(\w[\w-]*)="([^"]*)"', img_tag))
    keep.pop("src", None)
    keep.pop("srcset", None)
    attrs = " ".join(f'{k}="{v}"' for k, v in keep.items())
    pad = " " * indent
    lines = [f"{pad}<picture>"]
    # จอแคบใช้ภาพแนวตั้งก่อน ต้องมาก่อน source ปกติ เพราะเบราว์เซอร์เลือกอันแรกที่ตรงเงื่อนไข
    if slot == "hero" and widths_for("hero-portrait"):
        for ext in ("avif", "webp", "jpg"):
            lines += source_lines("hero-portrait", ext, pad, media="(max-width: 860px)")
    for ext in ("avif", "webp"):
        lines += source_lines(slot, ext, pad)
    lines.append(f'{pad}  <img src="assets/img/{slot}-{ws[len(ws) // 2]}.jpg" {attrs}>')
    lines.append(f"{pad}</picture>")
    return "\n".join(lines)


def hero_preload():
    """preload ต้องชี้ไฟล์เดียวกับที่เบราว์เซอร์จะเลือกจริง ไม่งั้นจะโหลดซ้ำสองรูป"""
    def one(slot, media):
        return ('<link rel="preload" as="image" type="image/avif" fetchpriority="high"\n'
                f'      media="{media}" imagesizes="100vw"\n'
                '      imagesrcset="' + ", ".join(f"assets/img/{slot}-{w}.avif {w}w" for w in widths_for(slot)) + '">')
    if widths_for("hero-portrait"):
        return one("hero-portrait", "(max-width: 860px)") + "\n" + one("hero", "(min-width: 861px)")
    return one("hero", "all")


CMP_SLOTS = [f"cmp-{i}-{s}" for i in (1, 2, 3) for s in ("before", "after")]


def rewrite_html(slots, dry):
    html = open(HTML, encoding="utf-8").read()
    changed = []
    # การสลับเคสทำโดยแทนชื่อช่องใน srcset ถ้าแปลงแค่บางเคส พอผู้ใช้กดสลับไปเคส
    # ที่ยังเป็นภาพชั่วคราวจะกลายเป็นภาพเสีย จึงรอให้ครบทั้งหกช่องก่อน
    cmp_ready = all(widths_for(s) for s in CMP_SLOTS)
    if not cmp_ready:
        held = [s for s in slots if s.startswith("cmp-")]
        if held:
            print(f"  (พักไว้ก่อน) เคสเทียบก่อน–หลังต้องครบทั้ง 6 ช่องถึงจะแก้ HTML — "
                  f"ยังขาด {', '.join(s for s in CMP_SLOTS if not widths_for(s))}")
        slots = [s for s in slots if not s.startswith("cmp-")]
    for slot in slots:
        # 1) <img> ที่ยังชี้ภาพชั่วคราว -> <picture>
        #    ต้องยอมให้มี attribute อื่นก่อน src ด้วย เช่น <img class="hero-img" src="…">
        pat = re.compile(r'<img\b[^>]*\bsrc="assets/img/placeholder/' + re.escape(slot) + r'\.svg"[^>]*>')
        m = pat.search(html)
        if m:
            line_start = html.rfind("\n", 0, m.start()) + 1
            before = html[line_start:m.start()]
            inline = before.strip() != ""          # <img> อยู่กลางบรรทัด เช่นใน <div class="before">…</div>
            indent = len(before) - len(before.lstrip()) if not inline else len(before)
            tag = picture_tag(slot, m.group(0), indent)
            if tag:
                html = html[: m.start()] + (tag.lstrip() if inline else tag.lstrip(" ")) + html[m.end():]
                changed.append(slot)
        # 2) og:image ชี้ไฟล์จริง
        if slot == "og" and "/assets/img/placeholder/og.svg" in html:
            html = html.replace("/assets/img/placeholder/og.svg", "/assets/img/og-1200.jpg")
            changed.append("og:image")
        # 3) hero ต้อง preload ไฟล์ที่ browser จะเลือกจริง
        if slot == "hero" and widths_for("hero"):
            html = re.sub(r'<link rel="preload" as="image"[^>]*>', hero_preload(), html, count=1)
    if changed:
        html = re.sub(r"[ \t]*<!-- TODO\(ภาพ\):[^>]*-->\n", "", html)
    if not dry and changed:
        open(HTML, "w", encoding="utf-8").write(html)
    return changed


def parse_argv(argv):
    """คืน (ช่องที่ขอ, ไฟล์ที่ระบุเจาะจง, โฟลเดอร์ต้นทาง, ธง)"""
    wanted, explicit, src_dir, flags, expect_dir = [], {}, SRC, set(), False
    for a in argv:
        if expect_dir:
            src_dir, expect_dir = os.path.expanduser(a), False
        elif a in ("--from", "-f"):
            expect_dir = True
        elif a.startswith("--from="):
            src_dir = os.path.expanduser(a.split("=", 1)[1])
        elif a.startswith("-"):
            flags.add(a)
        elif "=" in a:
            slot, filename = a.split("=", 1)
            wanted.append(slot)
            explicit[slot] = os.path.expanduser(filename)
        else:
            wanted.append(a)
    return wanted, explicit, src_dir, flags


def main():
    wanted, explicit, src_dir, flags = parse_argv(sys.argv[1:])
    dry = "--dry-run" in flags
    focus_path = os.path.join(src_dir, "focus.json")
    if not os.path.exists(focus_path):
        focus_path = os.path.join(SRC, "focus.json")
    focus_map = json.load(open(focus_path, encoding="utf-8")) if os.path.exists(focus_path) else {}

    if "--list" in flags:
        print(f"ต้นทาง: {src_dir}\n")
        for slot in SLOTS:
            done_ = "ใช้ภาพจริงแล้ว" if widths_for(slot) else "ยังเป็นภาพชั่วคราว"
            src = find_source(slot, src_dir)
            print(f"  {slot:16s} {done_:18s} {'ต้นฉบับ: ' + os.path.basename(src) if src else ''}")
        return

    unknown = [s for s in wanted if s not in SLOTS]
    if unknown:
        sys.exit(f"ไม่รู้จักช่อง: {', '.join(unknown)}\nดูรายชื่อช่องทั้งหมดใน PHOTOS.md หรือรัน --list")
    if not wanted:
        wanted = list(SLOTS)
    if src_dir == SRC:
        os.makedirs(SRC, exist_ok=True)   # โคลนใหม่จะยังไม่มีโฟลเดอร์นี้ เพราะอยู่ใน .gitignore
    if not os.path.isdir(src_dir):
        sys.exit(f"ไม่พบโฟลเดอร์ต้นทาง: {src_dir}")

    done, missing = [], []
    for slot in wanted:
        path = find_source(slot, src_dir, explicit.get(slot))
        if not path:
            missing.append(slot)
            continue
        made = build(slot, path, focus_map, dry)
        done.append(slot)
        print(f"  {slot:16s} <- {os.path.basename(path):24s} {len(made)} ไฟล์")

    changed = rewrite_html(done, dry) if done else []
    print(f"\nแปลงแล้ว {len(done)} ช่อง · แก้ index.html {len(changed)} จุด" + ("  (dry-run ไม่ได้เขียนไฟล์)" if dry else ""))
    if missing:
        print(f"ยังไม่มีภาพต้นฉบับอีก {len(missing)} ช่อง: {', '.join(missing[:8])}" + (" …" if len(missing) > 8 else ""))
        print(f"หาใน {src_dir} ตามชื่อช่อง — หรือระบุไฟล์เองแบบ  <ช่อง>=<ชื่อไฟล์>")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        pass   # ต่อท่อเข้า head/grep แล้วปลายทางปิดก่อน ไม่ใช่ข้อผิดพลาด
