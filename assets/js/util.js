/* Utilitas umum: template HTML aman, format angka/tanggal, komponen kecil. */
(function () {
  'use strict';

  const MPL = (window.MPL = window.MPL || { seasons: {} });

  // ---------------------------------------------------------------- HTML
  class Safe {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

  function flat(v) {
    if (v == null || v === false) return '';
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(flat).join('');
    return esc(v);
  }

  /** Tagged template: nilai yang disisipkan otomatis di-escape kecuali hasil html``. */
  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += flat(vals[i]) + strings[i + 1];
    return new Safe(out);
  }
  html.raw = (s) => new Safe(String(s));

  // --------------------------------------------------------------- Format
  const nf = new Intl.NumberFormat('id-ID');
  const fmt = {
    int: (n) => nf.format(n),
    pct: (x, d = 1) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d).replace('.', ',') + '%'),
    rupiah(n) {
      if (!n) return '—';
      if (n >= 1e9) return 'Rp' + (n / 1e9).toFixed(2).replace('.', ',').replace(/,?0+$/, '') + ' Miliar';
      if (n >= 1e6) return 'Rp' + (n / 1e6).toFixed(0) + ' Juta';
      return 'Rp' + nf.format(n);
    },
    rupiahFull: (n) => (n ? 'Rp' + nf.format(n) : '—'),
    signed: (n) => (n > 0 ? '+' + n : String(n)),
    date(iso, opts) {
      if (!iso) return 'TBD';
      const d = new Date(iso.length <= 10 ? iso + 'T00:00:00+07:00' : iso);
      return new Intl.DateTimeFormat('id-ID', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }, opts)).format(d);
    },
    dayDate(iso) {
      return fmt.date(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    },
    time(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', hour12: false }).format(d).replace('.', ':') + ' WIB';
    },
    duration(sec) {
      if (sec == null || isNaN(sec)) return '—';
      const m = Math.floor(sec / 60), s = Math.round(sec % 60);
      return m + ':' + String(s).padStart(2, '0');
    },
  };

  const toSec = (len) => {
    if (!len) return null;
    const p = len.split(':').map(Number);
    return p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : null;
  };

  // ----------------------------------------------------------- Lookups
  const LANES = {
    exp: { name: 'EXP Lane', short: 'EXP' },
    jungle: { name: 'Jungle', short: 'JGL' },
    mid: { name: 'Mid Lane', short: 'MID' },
    gold: { name: 'Gold Lane', short: 'GOLD' },
    roam: { name: 'Roam', short: 'ROAM' },
    flex: { name: 'Flex', short: 'FLEX' },
  };
  const ROLE_ORDER = ['exp', 'jungle', 'mid', 'gold', 'roam'];
  const STAFF_ROLES = {
    'head coach': 'Head Coach',
    coach: 'Coach',
    'assistant coach': 'Assistant Coach',
    analyst: 'Analyst',
    manager: 'Manager',
    'team manager': 'Team Manager',
    staff: 'Staff',
  };
  const AWARD_NAMES = {
    'Finals MVP': 'MVP Grand Final',
    'Regular Season MVP': 'MVP Regular Season',
    'Rookie Of The Season': 'Rookie of the Season',
    'Most Improved Player': 'Most Improved Player',
    'First Team Winner': 'First Team',
    'Second Team Winner': 'Second Team',
    'Best Coaching Team': 'Coaching Staff Terbaik',
    'Dream Team': 'Dream Team (pilihan fans)',
  };

  let heroIndex = null;
  function hero(id) {
    if (!heroIndex) {
      heroIndex = {};
      (MPL.heroes || []).forEach((h) => (heroIndex[h.id] = h));
    }
    return heroIndex[id] || (id ? { id, name: id, lane: 'flex' } : null);
  }
  const team = (id) => (MPL.teams && MPL.teams[id]) || null;

  function initials(name) {
    const parts = name.replace(/[^A-Za-z0-9' -]/g, ' ').split(/[\s-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function flagEmoji(code) {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  const COUNTRY = { id: 'Indonesia', ph: 'Filipina', my: 'Malaysia', sg: 'Singapura', kh: 'Kamboja', mm: 'Myanmar', th: 'Thailand', vn: 'Vietnam', us: 'Amerika Serikat' };

  // ------------------------------------------------------------- Links
  /**
   * Bangun link hash berformat sederhana: #s18-team-onic-po.
   * Format ini hanya memakai huruf, angka, dan tanda hubung supaya aman
   * dibagikan dan bekerja juga ketika situs disematkan di halaman lain.
   */
  const PHASE_CODE = { regular: 'rs', playoffs: 'po' };
  function href(sid, view, arg, params = {}) {
    const t = [sid];
    if (view && view !== 'home') t.push(view);
    if (arg) t.push(String(arg).toLowerCase());
    if (params.week) t.push('w' + params.week);
    if (PHASE_CODE[params.phase]) t.push(PHASE_CODE[params.phase]);
    if (params.lane && params.lane !== 'all') t.push(params.lane);
    return '#' + t.join('-');
  }

  // --------------------------------------------------------- Components
  function teamBadge(id, size = '') {
    const t = team(id);
    if (!t) return html`<span class="team-badge tbd ${size}" aria-hidden="true">TBD</span>`;
    return html`<span class="team-badge ${size}" style="--tc:${t.color};--ti:${t.ink}" aria-hidden="true">${t.short}</span>`;
  }

  function teamLink(season, id, opts = {}) {
    const t = team(id);
    if (!t) return html`<span class="team-link">${teamBadge(null, opts.size)}<span class="tn muted">${opts.tbdText || 'TBD'}</span></span>`;
    const label = opts.short ? t.short : t.name;
    return html`<a class="team-link" href="${href(season, 'team', t.id)}">${teamBadge(id, opts.size)}<span class="tn">${label}</span></a>`;
  }

  function heroChip(season, id, opts = {}) {
    const h = hero(id);
    if (!h) return html`<span class="hero-chip ${opts.size || ''} lane-flex"><span class="hero-ava" aria-hidden="true">—</span>${opts.noName ? '' : html`<span class="hn muted">Tidak ada</span>`}</span>`;
    const cls = `hero-chip ${opts.size || ''} lane-${h.lane}${opts.banned ? ' banned' : ''}`;
    const label = opts.noName ? html`<span class="sr-only">${h.name}</span>` : html`<span class="hn">${h.name}</span>`;
    return html`<a class="${cls}" href="${href(season, 'hero', h.id)}" title="${h.name}${opts.banned ? ' (dibanned)' : ''}"><span class="hero-ava" aria-hidden="true">${initials(h.name)}</span>${label}</a>`;
  }

  /** Avatar hero tanpa link (untuk dipakai di dalam elemen yang sudah berupa link). */
  function heroAva(id, size = '') {
    const h = hero(id);
    if (!h) return '';
    return html`<span class="hero-chip ${size} lane-${h.lane}"><span class="hero-ava" aria-hidden="true">${initials(h.name)}</span></span>`;
  }

  function bar(value, max, cls = '') {
    const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return html`<span class="bar ${cls}"><i style="width:${w}%"></i></span>`;
  }

  MPL.util = { html, esc, fmt, toSec, LANES, ROLE_ORDER, STAFF_ROLES, AWARD_NAMES, hero, team, initials, flagEmoji, COUNTRY, href, teamBadge, teamLink, heroChip, heroAva, bar };
})();
