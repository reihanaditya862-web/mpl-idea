#!/usr/bin/env python3
"""
Skor live MPL Indonesia dari situs resmi (https://id-mpl.com/schedule).

Menulis data/live.json (dibaca ulang website setiap 30 detik) dan
data/live.js (salinan untuk dibuka langsung dari file / halaman statis).

Pemakaian:
    python3 scripts/live_update.py                    # ambil sekali
    python3 scripts/live_update.py --watch 30         # ulangi tiap 30 detik
    python3 scripts/live_update.py --watch 30 --max-minutes 50 --idle-exit --git --relay live-score.yml
        # dipakai GitHub Actions: commit & push data/live.* setiap skor berubah,
        # lalu memicu run berikutnya sendiri selama masih ada match

Yang diambil:
  * semua match (regular season & playoff): tim, waktu, skor seri, status
    (upcoming / live / done) dan link siaran saat live;
  * untuk match yang sudah selesai dalam 6 hari terakhir: detail per game
    (pemenang, durasi, kill, hero & KDA tiap pemain, damage, gold).
Detail game hanya diambil sekali lalu disimpan di live.json.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "live.json"
OUT_JS = ROOT / "data" / "live.js"
SITE = "https://id-mpl.com"
UA = "Mozilla/5.0 (compatible; mpl-idea-static-site/1.0; +https://github.com/reihanaditya862-web/mpl-idea)"
WIB = timezone(timedelta(hours=7))
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"], 1)}
MONTHS.update({"may": 5, "aug": 8, "oct": 10, "dec": 12})
TEAM_CODES = {"ae": "ae", "btr": "btr", "dewa": "dewa", "evos": "evos", "geek": "geek",
              "navi": "navi", "onic": "onic", "rrq": "rrq", "tlid": "tlid"}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def team_id(code: str) -> str | None:
    return TEAM_CODES.get(re.sub(r"[^a-z]", "", (code or "").lower()))


def num(s: str) -> int:
    return int(re.sub(r"\D", "", s) or 0)


# --------------------------------------------------------------------------
# Halaman jadwal
# --------------------------------------------------------------------------
def best_of(label: str, phase: str) -> int:
    if phase == "regular":
        return 3
    return 7 if re.search(r"grand final|lower bracket final", label or "", re.I) else 5


def parse_when(day: str, mon: str, hm: str, now: datetime) -> str | None:
    m = MONTHS.get(mon.lower()[:3])
    if not m:
        return None
    hh, mm = (int(x) for x in hm.split(":"))
    dt = datetime(now.year, m, int(day), hh, mm, tzinfo=WIB)
    if dt - now > timedelta(days=200):
        dt = dt.replace(year=now.year - 1)
    elif now - dt > timedelta(days=200):
        dt = dt.replace(year=now.year + 1)
    return dt.isoformat()


def parse_schedule(page: str, now: datetime) -> list[dict]:
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    po_at = page.find('id="playoffs"')
    rs_at = page.find('id="regular-season"')
    out, seen = [], set()
    for m in re.finditer(r'<div class="match position-relative', page):
        start = m.start()
        nxt = page.find('<div class="match position-relative', start + 10)
        block = page[start: nxt if nxt > 0 else len(page)]
        mid = re.search(r"openMatchDetail\((\d+)\)|id=\"modal2?-(\d+)\"", block)
        if not mid:
            continue
        oid = int(mid.group(1) or mid.group(2))
        if oid in seen:
            continue
        seen.add(oid)
        names = re.findall(r'class="name">\s*([^<]*?)\s*<', block)[:2]
        scores = re.findall(r'class="score[^"]*">\s*([^<]*?)\s*<', block)[:2]
        when = re.search(r"(\d{1,2}) ([A-Za-z]{3}) \| (\d{1,2}:\d{2})", block)
        label = re.search(r'padding: 2px 5px;\s*border-radius: 3px;\s*">\s*([^<]+?)\s*<', block)
        if len(names) < 2 or not when:
            continue
        # Blok milik tab yang posisi pembukanya paling dekat sebelum blok ini.
        tabs = [(p, name) for p, name in ((po_at, "playoffs"), (rs_at, "regular")) if 0 <= p <= start]
        phase = max(tabs)[1] if tabs else "regular"
        lab = html.unescape(label.group(1)).strip() if label else ""
        bo = best_of(lab, phase)
        sc = [int(x) if x.strip().isdigit() else None for x in scores] if len(scores) == 2 else [None, None]
        live = bool(re.search(r"\bblink\b", block))
        need = bo // 2 + 1
        if live:
            status = "live"
        elif sc[0] is not None and sc[1] is not None and max(sc) >= need:
            status = "done"
        else:
            status = "upcoming"
        watch = re.search(r'class="button-watch\s+live\s*"\s+href="([^"]+)"', block)
        out.append({
            "officialId": oid,
            "phase": phase,
            "label": lab or None,
            "date": parse_when(when.group(1), when.group(2), when.group(3), now),
            "teams": [team_id(n) for n in names],
            "score": sc,
            "bestOf": bo,
            "status": status,
            "watch": html.unescape(watch.group(1)) if (watch and live) else None,
        })
    out.sort(key=lambda x: (x["date"] or "", x["officialId"]))
    return out


# --------------------------------------------------------------------------
# Detail match
# --------------------------------------------------------------------------
def strip_tags(s: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


STAT_ICONS = {"dmg": r"sword(?:-r)?-64", "taken": r"shield-64", "turret": r"tower-64", "gold": r"money-64"}


def stat_near(blk: str, icon: str) -> int | None:
    """Angka di sebelah ikon statistik (tim kiri: angka lalu ikon; tim kanan: ikon lalu angka)."""
    img = rf'<img[^>]*{icon}[^>]*>'
    m = re.search(rf'([\d.,]+)\s*{img}', blk) or re.search(rf'{img}\s*([\d.,]+)', blk)
    return num(m.group(1)) if m else None


def parse_players(col: str) -> list[dict]:
    players = []
    for blk in re.split(r'align-items-lg-start my-3">', col)[1:]:
        # Nama pemain (tebal) lalu nama hero tepat di bawahnya; dua tim memakai tata letak cermin.
        nm = re.search(r'font-weight:\s*700;\s*">\s*([^<]+?)\s*</div>\s*<div[^>]*font-size:\s*0\.9rem[^>]*>\s*([^<]+?)\s*<', blk)
        if not nm:
            continue
        p = {"name": html.unescape(nm.group(1)).strip(), "hero": html.unescape(nm.group(2)).strip()}
        kda = re.search(r'kda-content">\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)', blk)
        if kda:
            p["kda"] = [int(kda.group(i)) for i in (1, 2, 3)]
        for key, icon in STAT_ICONS.items():
            v = stat_near(blk, icon)
            if v is not None:
                p[key] = v
        players.append(p)
    return players


def parse_detail(page: str) -> list[dict]:
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    parts = re.split(r'<div class="tab-content match-detail[^"]*"', page)[1:]
    games = []
    for n, seg in enumerate(parts, 1):
        res = re.findall(r'position-relative mb-2\s+(defeat|victory)\s*"', seg)[:2]
        teams = [team_id(t) for t in re.findall(r'class="mt-0"[^>]*>\s*([^<]+?)\s*<', seg)[:2]]
        dur = re.search(r'clock-64[^>]*>\s*(\d{1,2}:\d{2})', seg)
        flat = re.sub(r'<img[^>]*swords[^>]*>', " ⚔ ", seg)
        flat = strip_tags(flat)
        k1 = re.search(r"⚔\s*(\d+)", flat)
        k2 = re.search(r"(\d+)\s*⚔", flat[k1.end():] if k1 else flat)
        cols = re.split(r'<div class="col-6', seg)[1:3]
        g = {
            "n": n,
            "teams": teams,
            "winner": (1 if res[0] == "victory" else 2) if len(res) == 2 else None,
            "duration": dur.group(1) if dur else None,
            "kills": [int(k1.group(1)) if k1 else None, int(k2.group(1)) if k2 else None],
            "players": [parse_players(c) for c in cols] if len(cols) == 2 else [[], []],
        }
        if g["winner"] or any(g["players"]):
            games.append(g)
    return games


# --------------------------------------------------------------------------
# Siklus
# --------------------------------------------------------------------------
def load_previous() -> dict:
    try:
        return json.loads(OUT_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def build(prev: dict, now: datetime) -> dict:
    matches = parse_schedule(get(f"{SITE}/schedule"), now)
    old = {m["officialId"]: m for m in prev.get("matches", [])}
    for m in matches:
        o = old.get(m["officialId"])
        if o and o.get("games") and o.get("status") == "done" and m["status"] == "done":
            m["games"] = o["games"]
            continue
        if m["status"] != "done" or not m["date"]:
            continue
        if now - datetime.fromisoformat(m["date"]) > timedelta(days=6):
            continue
        try:
            games = parse_detail(get(f"{SITE}/match-detail/{m['officialId']}"))
            time.sleep(1)
        except urllib.error.URLError as e:
            print(f"  detail {m['officialId']} gagal: {e}", file=sys.stderr)
            games = (o or {}).get("games") or []
        if games:
            m["games"] = games
    return {"mplLive": 1, "source": f"{SITE}/schedule", "matches": matches}


def write(data: dict, now: datetime, prev: dict) -> bool:
    """Tulis file hanya bila isinya berubah. Return True bila berubah."""
    same = {k: v for k, v in prev.items() if k != "updatedAt"} == data
    if same and OUT_JSON.exists():
        return False
    data = {**data, "updatedAt": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT_JSON.write_text(body + "\n", encoding="utf-8")
    OUT_JS.write_text(
        "// Dibuat otomatis oleh scripts/live_update.py. Sumber: id-mpl.com/schedule.\n"
        f"(window.MPL = window.MPL || {{seasons: {{}}}}).live =\n{body};\n", encoding="utf-8")
    return True


def git_push(summary: str) -> None:
    def run(*args: str) -> None:
        subprocess.run(["git", *args], cwd=ROOT, check=True)
    run("add", "data/live.json", "data/live.js")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        return
    run("commit", "-m", f"Skor live: {summary}")
    for attempt in range(4):
        try:
            run("pull", "--rebase", "--autostash")
            run("push")
            break
        except subprocess.CalledProcessError:
            time.sleep(2 ** (attempt + 1))
    else:
        print("  push gagal setelah 4 percobaan", file=sys.stderr)
        return
    # Push dari GitHub Actions tidak memicu workflow lain; panggil deploy Pages langsung.
    workflow = os.environ.get("MPL_PAGES_WORKFLOW")
    if workflow:
        branch = subprocess.run(["git", "branch", "--show-current"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        r = subprocess.run(["gh", "workflow", "run", workflow, "--ref", branch], cwd=ROOT)
        if r.returncode != 0:
            print("  gagal memicu deploy Pages", file=sys.stderr)


def summarize(data: dict) -> str:
    live = [m for m in data["matches"] if m["status"] == "live"]
    pick = live or [m for m in data["matches"] if m["status"] == "done"][-1:]
    return ", ".join(f"{(m['teams'][0] or 'TBD').upper()} {m['score'][0]}-{m['score'][1]} {(m['teams'][1] or 'TBD').upper()}"
                     for m in pick) or "jadwal"


def active_window(data: dict, now: datetime) -> bool:
    """Ada match live, atau dimulai dalam 3 jam ke depan, atau seharusnya sudah mulai."""
    for m in data["matches"]:
        if m["status"] == "live":
            return True
        if not m["date"]:
            continue
        start = datetime.fromisoformat(m["date"])
        if m["status"] == "upcoming" and timedelta(0) <= start - now <= timedelta(hours=3):
            return True
        if m["status"] == "upcoming" and now >= start and now - start < timedelta(hours=8):
            return True
    return False


def relay(workflow: str) -> None:
    """Picu run berikutnya dari workflow ini (jadwal GitHub sering dilewati)."""
    branch = subprocess.run(["git", "branch", "--show-current"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["gh", "workflow", "run", workflow, "--ref", branch or "HEAD"], cwd=ROOT)
    print("Run berikutnya dipicu." if r.returncode == 0 else "Gagal memicu run berikutnya.", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--watch", type=int, default=0, help="ulangi setiap N detik")
    ap.add_argument("--max-minutes", type=float, default=0, help="berhenti setelah N menit (mode --watch)")
    ap.add_argument("--git", action="store_true", help="commit & push data/live.* saat berubah")
    ap.add_argument("--idle-exit", action="store_true", help="berhenti bila tidak ada match yang live/dekat")
    ap.add_argument("--relay", metavar="WORKFLOW",
                    help="saat --max-minutes habis dan masih ada match, picu workflow ini lagi (butuh gh + GH_TOKEN)")
    args = ap.parse_args()
    t0 = time.time()
    data = None
    while True:
        now = datetime.now(WIB)
        prev = load_previous()
        try:
            data = build(prev, now)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"{now:%H:%M:%S} gagal mengambil jadwal: {e}", file=sys.stderr)
            data = None
        if data:
            changed = write(data, now, prev)
            msg = summarize(data)
            print(f"{now:%H:%M:%S} {'BERUBAH' if changed else 'sama'}: {msg}", flush=True)
            if changed and args.git:
                git_push(msg)
            if args.idle_exit and not active_window(data, now):
                print("Tidak ada match yang live atau akan mulai; berhenti.", flush=True)
                break
        if not args.watch:
            break
        if args.max_minutes and time.time() - t0 > args.max_minutes * 60:
            if args.relay and data and active_window(data, datetime.now(WIB)):
                relay(args.relay)
            break
        time.sleep(args.watch)


if __name__ == "__main__":
    main()
