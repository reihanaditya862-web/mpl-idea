#!/usr/bin/env python3
"""
Bangun file data MPL ID dari wikitext Liquipedia.

Sumber : https://liquipedia.net/mobilelegends (konten CC BY-SA 3.0)
Output : data/heroes.js, data/teams.js, data/season-<N>.js

Pemakaian:
    python3 scripts/build_data.py                 # musim default (17 18)
    python3 scripts/build_data.py --seasons 16 17 18
    python3 scripts/build_data.py --refresh       # abaikan cache, unduh ulang

Script hanya memakai library standar Python. Halaman yang sudah diunduh
disimpan di .cache/liquipedia supaya tidak membebani server Liquipedia
(mereka meminta maksimal 1 request / 2 detik untuk action=raw).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "liquipedia"
OUT = ROOT / "data"
BASE = "https://liquipedia.net/mobilelegends"
UA = "mpl-idea-static-site/1.0 (educational fan project)"
DELAY = 3.0
_last_request = 0.0

# --------------------------------------------------------------------------
# Tim: id kanonik, nama, singkatan, warna aksen (hanya untuk UI)
# --------------------------------------------------------------------------
TEAMS = {
    "ae":   {"name": "Alter Ego", "short": "AE", "color": "#e5243b", "ink": "#ffffff"},
    "btr":  {"name": "Bigetron by Vitality", "short": "BTR", "color": "#f2c230", "ink": "#111111"},
    "dewa": {"name": "Dewa United Esports", "short": "DEWA", "color": "#c9a24a", "ink": "#111111"},
    "evos": {"name": "EVOS", "short": "EVOS", "color": "#1d7cf2", "ink": "#ffffff"},
    "geek": {"name": "Geek Fam ID", "short": "GEEK", "color": "#8b5cf6", "ink": "#ffffff"},
    "navi": {"name": "Natus Vincere", "short": "NAVI", "color": "#ffe600", "ink": "#111111"},
    "onic": {"name": "ONIC", "short": "ONIC", "color": "#ffb000", "ink": "#111111"},
    "rrq":  {"name": "RRQ Hoshi", "short": "RRQ", "color": "#f97316", "ink": "#111111"},
    "tlid": {"name": "Team Liquid ID", "short": "TLID", "color": "#3aa0e8", "ink": "#ffffff"},
}
TEAM_ALIASES = {
    "alter ego": "ae", "ae": "ae", "alter ego esports": "ae",
    "bigetron by vitality": "btr", "btr": "btr", "bigetron": "btr", "bigetron alpha": "btr",
    "dewa united esports": "dewa", "dewa united": "dewa", "dewa": "dewa",
    "evos": "evos", "evos esports": "evos", "evos legends": "evos", "evos glory": "evos",
    "geek fam id": "geek", "geek fam indonesia": "geek", "geek fam": "geek", "geek": "geek",
    "natus vincere": "navi", "navi": "navi",
    "onic": "onic", "onic esports": "onic", "onic indonesia": "onic",
    "rrq hoshi": "rrq", "rrq": "rrq",
    "team liquid id": "tlid", "tlid": "tlid", "team liquid indonesia": "tlid", "liquid id": "tlid",
}

# Alias hero yang dipakai editor Liquipedia -> nama resmi
HERO_ALIASES = {
    "yss": "Yi Sun-shin", "guin": "Guinevere", "yz": "Yu Zhong", "yuzhong": "Yu Zhong",
    "gatot": "Gatotkaca", "phove": "Phoveus", "lapu": "Lapu-Lapu", "lapu lapu": "Lapu-Lapu",
    "arlot": "Arlott", "xborg": "X.Borg", "x borg": "X.Borg", "val": "Valentina",
    "valen": "Valentina", "leo": "Leomord", "haya": "Hayabusa", "fred": "Fredrinn",
    "luo": "Luo Yi", "change": "Chang'e", "chang e": "Chang'e", "pk": "Popol and Kupa",
    "popol": "Popol and Kupa", "lolita": "Lolita", "mino": "Minotaur", "esme": "Esmeralda",
    "benny": "Benedetta", "bene": "Benedetta", "ybn": "Yi Sun-shin", "karina": "Karina",
}

LANE_KEYS = {"EXP Lane": "exp", "Jungle": "jungle", "Mid Lane": "mid", "Gold Lane": "gold", "Roam": "roam"}
ROLE_ORDER = ["exp", "jungle", "mid", "gold", "roam"]
PLAYER_ROLE = {"exp": "exp", "jgl": "jungle", "jungle": "jungle", "mid": "mid", "gold": "gold",
               "roam": "roam", "flex": "flex"}
MAPMODE = {"fc": "Flying Cloud", "gt": "Golden Turret", "ht": "Healing Turtle", "rw": "Revealing Wisps",
           "bw": "Broken Walls", "dg": "Dangerous Grass", "er": "Expanding Rivers"}
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}


# --------------------------------------------------------------------------
# Unduh / cache
# --------------------------------------------------------------------------
def _get(url: str) -> bytes:
    global _last_request
    wait = DELAY - (time.time() - _last_request)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    _last_request = time.time()
    return data


def fetch_raw(title: str, refresh: bool) -> str:
    path = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", title).strip("_") + ".txt")
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    url = f"{BASE}/{urllib.parse.quote(title.replace(' ', '_'))}?action=raw"
    print(f"  unduh {url}", file=sys.stderr)
    text = _get(url).decode("utf-8")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return text


def fetch_parse(title: str, refresh: bool) -> str:
    path = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", title).strip("_") + ".parse.json")
    if not path.exists() or refresh:
        url = (f"{BASE}/api.php?action=parse&format=json&formatversion=2&prop=text&page="
               + urllib.parse.quote(title))
        print(f"  unduh {url}", file=sys.stderr)
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_get(url))
    return json.loads(path.read_text(encoding="utf-8"))["parse"]["text"]


# --------------------------------------------------------------------------
# Parser template wikitext sederhana (mendukung {{ }} dan [[ ]] bersarang)
# --------------------------------------------------------------------------
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


def strip_comments(s: str) -> str:
    return COMMENT_RE.sub("", s)


def find_templates(text: str, name: str) -> list[tuple[int, int]]:
    """Cari semua {{name ...}} (case-insensitive) dan kembalikan (start, end)."""
    out = []
    pat = re.compile(r"\{\{\s*" + re.escape(name) + r"\s*[|}\n]", re.I)
    pos = 0
    while True:
        m = pat.search(text, pos)
        if not m:
            break
        end = match_braces(text, m.start())
        out.append((m.start(), end))
        pos = end
    return out


def match_braces(text: str, start: int) -> int:
    depth = 0
    i = start
    n = len(text)
    while i < n:
        if text.startswith("{{", i):
            depth += 1
            i += 2
            continue
        if text.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return i
            continue
        i += 1
    return n


def parse_template(src: str) -> tuple[str, list[str], dict[str, str]]:
    """Ubah '{{Name|a|k=v}}' -> ('Name', ['a'], {'k': 'v'})."""
    assert src.startswith("{{") and src.endswith("}}"), src[:40]
    body = src[2:-2]
    parts, buf, depth_c, depth_s, i = [], [], 0, 0, 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "{{":
            depth_c += 1; buf.append(two); i += 2; continue
        if two == "}}":
            depth_c -= 1; buf.append(two); i += 2; continue
        if two == "[[":
            depth_s += 1; buf.append(two); i += 2; continue
        if two == "]]":
            depth_s -= 1; buf.append(two); i += 2; continue
        ch = body[i]
        if ch == "|" and depth_c == 0 and depth_s == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(ch)
        i += 1
    parts.append("".join(buf))
    name = parts[0].strip()
    pos, named = [], {}
    for p in parts[1:]:
        m = re.match(r"\s*([A-Za-z0-9_\- ]+?)\s*=(.*)$", p, re.S)
        if m and "{{" not in m.group(1):
            named[m.group(1).strip().lower()] = m.group(2).strip()
        else:
            pos.append(p.strip())
    return name, pos, named


def first_template(text: str, name: str):
    found = find_templates(text, name)
    if not found:
        return None
    s, e = found[0]
    return parse_template(text[s:e])


def all_templates(text: str, name: str):
    return [parse_template(text[s:e]) for s, e in find_templates(text, name)]


def clean_text(s: str) -> str:
    s = strip_comments(s or "")
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip()


# --------------------------------------------------------------------------
# Normalisasi
# --------------------------------------------------------------------------
def team_id(name: str) -> str | None:
    key = clean_text(name).lower().strip()
    if not key:
        return None
    if key in TEAM_ALIASES:
        return TEAM_ALIASES[key]
    raise SystemExit(f"Tim tidak dikenal: {name!r} — tambahkan ke TEAM_ALIASES")


class HeroBook:
    def __init__(self, heroes: list[dict]):
        self.heroes = heroes
        self.by_key = {}
        for h in heroes:
            self.by_key[self.key(h["name"])] = h
        for alias, real in HERO_ALIASES.items():
            if self.key(real) in self.by_key:
                self.by_key.setdefault(self.key(alias), self.by_key[self.key(real)])
        self.unknown: set[str] = set()

    @staticmethod
    def key(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "", s.lower())

    def resolve(self, raw: str) -> str | None:
        raw = clean_text(raw)
        if not raw:
            return None
        h = self.by_key.get(self.key(raw)) or self.by_key.get(self.key(HERO_ALIASES.get(raw.lower(), "")))
        if not h:
            self.unknown.add(raw)
            return None
        return h["id"]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_date(raw: str) -> str | None:
    s = clean_text(re.sub(r"\{\{[^{}]*\}\}", "", raw or ""))
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?", s)
    if not m:
        return None
    mon = MONTHS.get(m.group(1))
    if not mon:
        return None
    hh, mm = (m.group(4) or "00"), (m.group(5) or "00")
    # ICT (UTC+7) = WIB
    return f"{m.group(3)}-{mon:02d}-{int(m.group(2)):02d}T{int(hh):02d}:{mm}:00+07:00"


def flag(code: str) -> str | None:
    code = (code or "").strip().lower()
    return code if re.fullmatch(r"[a-z]{2}", code) else None


# --------------------------------------------------------------------------
# Hero
# --------------------------------------------------------------------------
def build_heroes(refresh: bool) -> list[dict]:
    html = fetch_parse("Portal:Heroes", refresh)
    parts = re.split(r'<div class="(content\d)">', html)
    lanes: dict[str, str] = {}
    all_names: list[str] = []
    for k in range(1, len(parts), 2):
        tab, body = parts[k], parts[k + 1]
        cur = None
        for head, name in re.findall(r'font-size:18px">([^<]*)</div>|font-size:13.5px">([^<]*)</span>', body):
            if head:
                cur = re.sub(r"\s*\(\d+\)\s*$", "", head)
                continue
            name = name.replace("&#39;", "'").replace("&amp;", "&").strip()
            if tab == "content1":
                all_names.append(name)
            elif tab == "content2" and cur in LANE_KEYS:
                lanes.setdefault(name, LANE_KEYS[cur])
    names = sorted(set(all_names) | set(lanes))
    return [{"id": slug(n), "name": n, "lane": lanes.get(n, "flex")} for n in names]


# --------------------------------------------------------------------------
# Halaman utama musim
# --------------------------------------------------------------------------
def parse_person_list(src: str) -> list[dict]:
    people = []
    for _, pos, kv in all_templates(src, "Person"):
        if not pos or not pos[0]:
            continue
        role_raw = [r.strip().lower() for r in kv.get("role", "").split(",") if r.strip()]
        is_staff = kv.get("type", "").lower() == "staff"
        person = {
            "id": pos[0].strip(),
            "link": (kv.get("link") or pos[0]).strip(),
            "flag": flag(kv.get("flag", "")),
            "status": (kv.get("status") or "main").lower(),
        }
        if is_staff:
            person["staffRole"] = next((r for r in role_raw if r not in ("captain", "vice captain")), "staff")
        else:
            person["role"] = next((PLAYER_ROLE[r] for r in role_raw if r in PLAYER_ROLE), "flex")
            if "captain" in role_raw:
                person["captain"] = True
            if "vice captain" in role_raw:
                person["viceCaptain"] = True
            if kv.get("played", "").lower() == "false":
                person["played"] = False
        people.append((is_staff, person))
    return people


def parse_main(text: str) -> dict:
    t = strip_comments(text)
    _, _, info = first_template(t, "Infobox league")
    venues = []
    for i in range(1, 6):
        v = info.get(f"venue{i}")
        if v:
            venues.append({"name": clean_text(v), "desc": clean_text(info.get(f"venue{i}desc", "")),
                           "city": clean_text(info.get(f"city{i}") or info.get("city") or "")})
    sponsors = [clean_text(re.sub(r"^\[\S+\s+(.*)\]$", r"\1", info[k])) for k in sorted(
        (k for k in info if re.fullmatch(r"sponsor\d+", k)), key=lambda k: int(k[7:]))]
    meta = {
        "name": clean_text(info.get("name", "")),
        "shortName": clean_text(info.get("shortname", "")),
        "tagline": clean_text(info.get("caption", "")).strip('"'),
        "startDate": info.get("sdate"),
        "endDate": info.get("edate"),
        "prizePool": int(re.sub(r"\D", "", info.get("prizepool", "0")) or 0),
        "currency": "IDR",
        "patch": clean_text(info.get("patch", "")),
        "endPatch": clean_text(info.get("epatch", "")),
        "venues": venues,
        "teamCount": int(info.get("team_number", "0") or 0),
        "device": clean_text(info.get("device", "")),
        "sponsors": [s for s in sponsors if s],
        "website": info.get("website"),
    }

    # Roster
    rosters = {}
    tp = find_templates(t, "TeamParticipants")
    if tp:
        s, e = tp[0]
        block = t[s:e]
        for os_, oe in find_templates(block, "Opponent"):
            seg = block[os_:oe]
            _, pos, kv = parse_template(seg)
            if not pos:
                continue
            tid = team_id(pos[0])
            players, staff = [], []
            for is_staff, p in parse_person_list(kv.get("players", "")):
                (staff if is_staff else players).append(p)
            rosters[tid] = {"players": players, "staff": staff}

    # Penghargaan musim
    awards = []
    skip = re.compile(r"^(Week \d+|Team of The Week)", re.I)
    for _, pos, kv in all_templates(t, "AwardPrizePool"):
        for p in pos:
            if not p.startswith("{{Slot"):
                continue
            _, spos, skv = parse_template(p)
            award = clean_text(skv.get("award", ""))
            if not award or skip.match(award):
                continue
            winners = []
            for op in spos + [skv.get(k) for k in skv if k not in ("award", "localprize", "date")]:
                if not op:
                    continue
                for os_, oe in find_templates(op, "Opponent"):
                    _, opos, okv = parse_template(op[os_:oe])
                    if opos and opos[0]:
                        winners.append({"player": opos[0], "link": okv.get("link", opos[0]),
                                        "team": team_id(okv["team"]) if okv.get("team") else None})
                for os_, oe in find_templates(op, "TeamOpponent"):
                    _, opos, _ = parse_template(op[os_:oe])
                    if opos and opos[0]:
                        winners.append({"team": team_id(opos[0])})
            awards.append({"award": award, "winners": winners})

    # Hadiah per posisi
    prizes = []
    bp = first_template(t, "BasePrizePoolTable")
    if bp:
        for p in bp[1]:
            if p.startswith("{{Json"):
                _, _, jkv = parse_template(p)
                prizes.append({"place": jkv.get("place"), "prize": int(jkv.get("prize", "0") or 0)})
    meta["basePrizes"] = prizes
    return {"meta": meta, "rosters": rosters, "awards": awards}


# --------------------------------------------------------------------------
# Match
# --------------------------------------------------------------------------
def parse_subs(op_src: str) -> list[dict]:
    subs = []
    for _, _, kv in all_templates(op_src, "Substitution"):
        def name_of(v):
            v = v or ""
            m = first_template(v, "OpponentPlayer") or first_template(v, "Opponent")
            if m:
                return m[1][0] if m[1] else ""
            return clean_text(v)
        games = kv.get("games")
        subs.append({"in": name_of(kv.get("in")), "out": name_of(kv.get("out")),
                     "games": [int(g) for g in re.findall(r"\d+", games)] if games else None})
    return subs


def parse_match(src: str, heroes: HeroBook) -> dict:
    _, _, kv = parse_template(src)
    teams, subs = [], []
    for k in ("opponent1", "opponent2"):
        op = kv.get(k, "")
        tpl = first_template(op, "TeamOpponent")
        name = tpl[1][0] if tpl and tpl[1] else ""
        teams.append(team_id(name) if name else None)
        subs.append(parse_subs(op))
    games = []
    for i in range(1, 8):
        m = kv.get(f"map{i}")
        if not m:
            continue
        _, _, mk = parse_template(m)
        if mk.get("finished", "").lower() == "skip":
            continue
        winner = mk.get("winner", "").strip()
        picks = [[heroes.resolve(mk.get(f"t{t}h{j}", "")) for j in range(1, 6)] for t in (1, 2)]
        bans = [[heroes.resolve(mk.get(f"t{t}b{j}", "")) for j in range(1, 6)] for t in (1, 2)]
        if winner not in ("1", "2") and not any(any(p) for p in picks):
            continue  # belum dimainkan
        mode = clean_text(mk.get("mapmode", ""))
        games.append({
            "n": i,
            "winner": int(winner) if winner in ("1", "2") else None,
            "sides": [mk.get("team1side", "").lower() or None, mk.get("team2side", "").lower() or None],
            "length": mk.get("length") or None,
            "mode": MAPMODE.get(mode.lower(), mode) or None,
            "picks": picks,
            "bans": bans,
            "vod": (mk.get("vod") or "").strip() or None,
        })
    bo = int(re.sub(r"\D", "", kv.get("bestof", "3")) or 3)
    score = [sum(1 for g in games if g["winner"] == t) for t in (1, 2)]
    need = bo // 2 + 1
    winner = 1 if score[0] >= need else 2 if score[1] >= need else None
    if kv.get("winner") in ("1", "2"):
        winner = int(kv["winner"])
    casters = [clean_text(kv[k]) for k in sorted(kv) if re.fullmatch(r"caster\d", k) and kv[k].strip()]
    return {
        "teams": teams,
        "date": parse_date(kv.get("date", "")),
        "bestOf": bo,
        "score": score,
        "winner": winner,
        "mvp": clean_text(kv.get("mvp", "")) or None,
        "casters": casters,
        "subs": subs,
        "games": games,
    }


def parse_regular(text: str, heroes: HeroBook) -> list[dict]:
    t = strip_comments(text)
    weeks = []
    for s, e in find_templates(t, "Matchlist"):
        _, _, kv = parse_template(t[s:e])
        title = clean_text(kv.get("title", f"Week {len(weeks) + 1}"))
        wnum = int(re.search(r"\d+", title).group()) if re.search(r"\d+", title) else len(weeks) + 1
        day_headers = {int(k[1:-6]): clean_text(v) for k, v in kv.items() if re.fullmatch(r"m\d+header", k)}
        matches, day = [], None
        keys = sorted((k for k in kv if re.fullmatch(r"m\d+", k)), key=lambda k: int(k[1:]))
        for k in keys:
            idx = int(k[1:])
            day = day_headers.get(idx, day)
            if not kv[k].strip().startswith("{{"):
                continue
            m = parse_match(kv[k].strip(), heroes)
            m["id"] = f"w{wnum}m{idx}"
            m["day"] = day
            matches.append(m)
        weeks.append({"week": wnum, "title": f"Week {wnum}", "matches": matches})
    weeks.sort(key=lambda w: w["week"])
    return weeks


BRACKET_LABELS = {
    "R1M1": ("upper", "Upper Bracket Quarterfinal"),
    "R1M2": ("upper", "Upper Bracket Quarterfinal"),
    "R2M1": ("upper", "Upper Bracket Semifinal"),
    "R2M2": ("upper", "Upper Bracket Semifinal"),
    "R2M3": ("lower", "Lower Bracket Semifinal"),
    "R3M1": ("upper", "Upper Bracket Final"),
    "R3M2": ("lower", "Lower Bracket Final"),
    "R4M1": ("final", "Grand Final"),
}


def parse_playoffs(text: str, heroes: HeroBook) -> dict:
    t = strip_comments(text)
    s, e = find_templates(t, "Bracket")[0]
    name, pos, kv = parse_template(t[s:e])
    btype = pos[0] if pos else ""
    matches = []
    for k in sorted((k for k in kv if re.fullmatch(r"r\d+m\d+", k))):
        if not kv[k].strip().startswith("{{"):
            continue
        key = k.upper()
        m = parse_match(kv[k].strip(), heroes)
        bracket, label = BRACKET_LABELS.get(key, ("upper", key))
        m.update({"id": key.lower(), "slot": key, "bracket": bracket, "stage": label})
        matches.append(m)
    return {"type": btype, "matches": matches}


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def write_js(path: Path, var: str, payload) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(
        "// File ini dibuat otomatis oleh scripts/build_data.py — jangan diedit manual.\n"
        "// Sumber data: Liquipedia (https://liquipedia.net/mobilelegends), CC BY-SA 3.0.\n"
        f"{var}\n{body};\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seasons", nargs="+", type=int, default=[17, 18])
    ap.add_argument("--refresh", action="store_true", help="unduh ulang semua halaman")
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    hero_list = build_heroes(args.refresh)
    book = HeroBook(hero_list)
    print(f"{len(hero_list)} hero", file=sys.stderr)

    index = []
    for n in args.seasons:
        base = f"MPL/Indonesia/Season {n}"
        print(f"Season {n}", file=sys.stderr)
        main_page = parse_main(fetch_raw(base, args.refresh))
        regular = parse_regular(fetch_raw(f"{base}/Regular Season", args.refresh), book)
        playoffs = parse_playoffs(fetch_raw(f"{base}/Playoffs", args.refresh), book)
        season = {
            "season": n,
            "id": f"s{n}",
            "source": f"{BASE}/{base.replace(' ', '_')}",
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            **main_page,
            "regular": regular,
            "playoffs": playoffs,
        }
        write_js(OUT / f"season-{n}.js", f"(window.MPL = window.MPL || {{seasons: {{}}}}).seasons['s{n}'] =", season)
        rs_games = sum(len(m["games"]) for w in regular for m in w["matches"])
        po_games = sum(len(m["games"]) for m in playoffs["matches"])
        print(f"  {sum(len(w['matches']) for w in regular)} match RS ({rs_games} game), "
              f"{len(playoffs['matches'])} match playoff ({po_games} game)", file=sys.stderr)
        index.append({"id": f"s{n}", "season": n, "name": main_page["meta"]["name"],
                      "startDate": main_page["meta"]["startDate"], "endDate": main_page["meta"]["endDate"]})

    if book.unknown:
        print("PERINGATAN hero tidak dikenal:", sorted(book.unknown), file=sys.stderr)

    write_js(OUT / "heroes.js", "(window.MPL = window.MPL || {seasons: {}}).heroes =", hero_list)
    write_js(OUT / "teams.js", "(window.MPL = window.MPL || {seasons: {}}).teams =",
             {k: {"id": k, **v} for k, v in TEAMS.items()})
    index.sort(key=lambda s: -s["season"])
    write_js(OUT / "index.js", "(window.MPL = window.MPL || {seasons: {}}).index =", index)
    print("Selesai ->", OUT, file=sys.stderr)


if __name__ == "__main__":
    main()
