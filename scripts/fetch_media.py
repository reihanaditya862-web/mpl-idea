#!/usr/bin/env python3
"""
Unduh logo tim serta foto pemain & coach dari situs resmi MPL Indonesia.

Sumber : https://id-mpl.com/teams dan https://id-mpl.com/team/<tim>
Output : assets/img/teams/<tim>.<ext>
         assets/img/people/<tim>/<nama>.<ext>
         data/media.js

Pemakaian:
    python3 scripts/fetch_media.py            # lewati gambar yang sudah ada
    python3 scripts/fetch_media.py --refresh  # unduh ulang semua gambar

Situs resmi hanya menampilkan roster musim yang sedang berjalan, jadi foto
dipasangkan ke pemain berdasarkan nama (pemain musim lalu yang masih aktif
ikut mendapat foto). Kalau Pillow terpasang, gambar dikecilkan dan diubah ke
WebP supaya situs tetap ringan; tanpa Pillow file asli yang disimpan.
"""
from __future__ import annotations

import argparse
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
OUT = ROOT / "data" / "media.js"
SITE = "https://id-mpl.com"
UA = "Mozilla/5.0 (compatible; mpl-idea-static-site/1.0; +https://github.com/reihanaditya862-web/mpl-idea)"
DELAY = 1.5
PHOTO_SIZE = 360
LOGO_SIZE = 256

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None

_last = 0.0


def get(url: str) -> bytes:
    global _last
    wait = DELAY - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    finally:
        _last = time.time()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


def unwrap(url: str) -> str:
    """Ambil URL asli dari proxy gambar wsrv.nl?url=..."""
    url = html.unescape(url)
    m = re.match(r"https?://wsrv\.nl/?\?url=(.+)$", url)
    return m.group(1) if m else url


def save_image(data: bytes, dest_stem: Path, size: int) -> Path:
    dest_stem.parent.mkdir(parents=True, exist_ok=True)
    if Image is not None:
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGBA")
        im.thumbnail((size, size), Image.LANCZOS)
        out = dest_stem.with_suffix(".webp")
        im.save(out, "WEBP", quality=82, method=6)
        return out
    ext = ".png" if data[:4] == b"\x89PNG" else ".jpg" if data[:2] == b"\xff\xd8" else ".webp"
    out = dest_stem.with_suffix(ext)
    out.write_bytes(data)
    return out


def existing(dest_stem: Path) -> Path | None:
    for ext in (".webp", ".png", ".jpg"):
        p = dest_stem.with_suffix(ext)
        if p.exists():
            return p
    return None


def fetch_image(url: str, dest_stem: Path, size: int, refresh: bool) -> str | None:
    if not refresh and (p := existing(dest_stem)):
        return p.relative_to(ROOT).as_posix()
    try:
        data = get(url)
    except urllib.error.URLError as e:
        print(f"  gagal unduh {url[:90]}… ({e})", file=sys.stderr)
        return None
    p = save_image(data, dest_stem, size)
    print(f"  simpan {p.relative_to(ROOT)} ({p.stat().st_size // 1024} KB)", file=sys.stderr)
    return p.relative_to(ROOT).as_posix()


def logo_tone(path: Path) -> str | None:
    """'dark' bila logo hampir seluruhnya gelap (tidak terbaca di tema gelap)."""
    if Image is None:
        return None
    im = Image.open(path).convert("RGBA")
    px = [max(r, g, b) for r, g, b, a in im.getdata() if a > 128]
    if not px:
        return None
    lum = sum(px) / len(px)  # rata-rata "value" HSV: merah terang tetap dianggap terang
    return "dark" if lum < 70 else "light"


def parse_teams(page: str) -> dict[str, str]:
    """slug tim -> URL logo (dari halaman /teams)."""
    out = {}
    for m in re.finditer(r'href="https://id-mpl\.com/team/([a-z0-9-]+)"(.*?)</a>', page, re.S):
        img = re.search(r'src="([^"]+)"', m.group(2))
        if img:
            out[m.group(1)] = unwrap(img.group(1))
    return out


def parse_roster(page: str) -> list[dict]:
    start = page.find("ROSTER SEASON")
    if start < 0:
        return []
    block = page[start:page.find("PERTANDINGAN", start) if "PERTANDINGAN" in page[start:] else len(page)]
    people = []
    for m in re.finditer(
        r'<img src="([^"]+)" alt="([^"]*)">.*?class="player-name">\s*(.*?)\s*</div>\s*'
        r'<div class="player-role[^"]*">\s*(.*?)\s*</div>', block, re.S):
        people.append({
            "url": html.unescape(m.group(1)),
            "name": html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).strip() or m.group(2),
            "role": html.unescape(m.group(4)).strip(),
        })
    return people


STAFF_ROLE = {"coach": "head coach", "head coach": "head coach", "asst. coach": "assistant coach",
              "assistant coach": "assistant coach", "analyst": "analyst", "manager": "manager"}


def norm(s: str) -> str:
    """Kunci pencocokan nama: huruf kecil, tanpa 'coach', tanpa simbol, huruf ganda diringkas."""
    s = re.sub(r"^coach\s+", "", (s or "").lower())
    s = re.sub(r"\s*\(.*\)$", "", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return re.sub(r"(.)\1+", r"\1", s)


def display_name(name: str) -> str:
    name = re.sub(r"^coach\s+", "", name.strip(), flags=re.I)
    return name.title() if name.isupper() and len(name) > 3 else name


def load_season(n: int) -> dict | None:
    f = ROOT / "data" / f"season-{n}.js"
    if not f.exists():
        return None
    text = f.read_text(encoding="utf-8")
    return json.loads(text[text.index("\n{") + 1: text.rindex("};") + 1])


def link_photos(media: dict) -> None:
    """Pasangkan foto resmi ke identitas Liquipedia (link) pemain/staff musim yang sama.

    Hasilnya media['photos'] = {kunci link: path foto} sehingga musim lain (mis. S17)
    ikut mendapat foto walaupun nama tampilannya berbeda. Staff resmi yang tidak ada
    di data Liquipedia dimasukkan ke media['extraStaff'].
    """
    season = load_season(media["season"]) if media.get("season") else None
    rosters = season["rosters"] if season else {}
    photos, extra, unmatched = {}, {}, []
    for op in media["people"]:
        if not op["photo"]:
            continue
        key = norm(op["name"])
        roster = rosters.get(op["team"], {"players": [], "staff": []})
        hit = next((p for p in roster["players"] + roster["staff"]
                    if key in (norm(p["id"]), norm(p.get("link", "")))), None)
        if hit:
            photos[norm(hit.get("link") or hit["id"])] = op["photo"]
            photos.setdefault(norm(hit["id"]), op["photo"])
            continue
        role = STAFF_ROLE.get(op["role"].lower())
        if role:
            extra.setdefault(op["team"], []).append(
                {"id": display_name(op["name"]), "staffRole": role, "photo": op["photo"], "source": "id-mpl.com"})
        else:
            photos.setdefault(key, op["photo"])
            unmatched.append(f"{op['team']}:{op['name']}")
    media["photos"] = photos
    media["extraStaff"] = extra
    if unmatched:
        print("Pemain resmi tanpa pasangan di data Liquipedia:", ", ".join(unmatched), file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="unduh ulang semua gambar")
    args = ap.parse_args()
    if Image is None:
        print("Pillow tidak terpasang: gambar disimpan tanpa dikecilkan (pip install pillow).", file=sys.stderr)

    teams_page = get(f"{SITE}/teams").decode("utf-8")
    logos = parse_teams(teams_page)
    if not logos:
        raise SystemExit("Tidak menemukan daftar tim di id-mpl.com/teams — struktur situs mungkin berubah.")
    media = {
        "source": f"{SITE}/teams",
        "season": None,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "teams": {},
        "people": [],
    }
    for team, logo_url in sorted(logos.items()):
        print(f"{team}", file=sys.stderr)
        logo = fetch_image(logo_url, IMG / "teams" / team, LOGO_SIZE, args.refresh)
        media["teams"][team] = {"logo": logo, "tone": logo_tone(ROOT / logo) if logo else None,
                                "page": f"{SITE}/team/{team}"}
        page = get(f"{SITE}/team/{team}").decode("utf-8")
        roster = parse_roster(page)
        m = re.search(r"ROSTER SEASON\s+(\d+)", page)
        if m:
            media["season"] = int(m.group(1))
        if not roster:
            print(f"  roster {team} kosong", file=sys.stderr)
        for p in roster:
            photo = fetch_image(p["url"], IMG / "people" / team / slug(p["name"]), PHOTO_SIZE, args.refresh)
            media["people"].append({"team": team, "name": p["name"], "role": p["role"], "photo": photo})

    link_photos(media)
    body = json.dumps(media, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "// File ini dibuat otomatis oleh scripts/fetch_media.py — jangan diedit manual.\n"
        "// Logo & foto: situs resmi MPL Indonesia (id-mpl.com). Hak cipta milik pemiliknya masing-masing.\n"
        f"(window.MPL = window.MPL || {{seasons: {{}}}}).media =\n{body};\n", encoding="utf-8")
    n = sum(1 for p in media["people"] if p["photo"])
    print(f"Selesai: {len(media['teams'])} logo, {n}/{len(media['people'])} foto -> {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
