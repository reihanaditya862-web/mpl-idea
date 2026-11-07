/* Router hash sederhana, pemuat data musim, tema, dan pemilih musim. */
(function () {
  'use strict';

  const MPL = window.MPL;
  const { fmt, html } = MPL.util;
  const V = MPL.views;
  const main = document.getElementById('main');
  const select = document.getElementById('season-select');
  const navLinks = document.querySelectorAll('[data-nav]');
  const brand = document.querySelector('.brand');
  const index = (MPL.index || []).slice().sort((a, b) => b.season - a.season);
  const VIEWS = ['home', 'regular', 'playoffs', 'teams', 'team', 'heroes', 'hero', 'match'];
  const NAV_OF = { home: 'home', regular: 'regular', playoffs: 'playoffs', teams: 'teams', team: 'teams', heroes: 'heroes', hero: 'heroes', match: null };
  const pending = {};

  // ------------------------------------------------------------ data
  function loadSeason(id) {
    if (MPL.seasons[id]) return Promise.resolve(MPL.seasons[id]);
    const entry = index.find((s) => s.id === id);
    if (!entry) return Promise.reject(new Error('Musim tidak dikenal: ' + id));
    if (!pending[id]) {
      pending[id] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `data/season-${entry.season}.js`;
        s.onload = () => (MPL.seasons[id] ? resolve(MPL.seasons[id]) : reject(new Error('Data kosong')));
        s.onerror = () => reject(new Error('Gagal memuat ' + s.src));
        document.head.appendChild(s);
      });
      pending[id].catch(() => delete pending[id]);
    }
    return pending[id];
  }

  // ---------------------------------------------------------- routing
  const LANE_KEYS = ['exp', 'jungle', 'mid', 'gold', 'roam'];
  const PHASE_OF = { rs: 'regular', po: 'playoffs' };

  /**
   * Baca hash berformat #s18-team-onic-po menjadi { sid, view, arg, params }.
   * Format lama (#/s18/team/onic?phase=playoffs) tetap didukung.
   */
  function parse() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    const params = {};
    let sid, view, arg;
    if (raw.startsWith('/')) {
      const [path, query = ''] = raw.split('?');
      [sid, view, arg] = path.split('/').filter(Boolean);
      query.split('&').filter(Boolean).forEach((kv) => {
        const [k, v = ''] = kv.split('=');
        params[k] = v;
      });
    } else {
      const t = raw.toLowerCase().split('-').filter(Boolean);
      if (/^s\d+$/.test(t[0] || '')) sid = t.shift();
      if (VIEWS.includes(t[0])) view = t.shift();
      const rest = [];
      t.forEach((tok) => {
        if (PHASE_OF[tok]) params.phase = PHASE_OF[tok];
        else if (view === 'regular' && /^w\d+$/.test(tok)) params.week = tok.slice(1);
        else if (view === 'heroes' && LANE_KEYS.includes(tok)) params.lane = tok;
        else rest.push(tok);
      });
      arg = rest.join('-') || undefined;
    }
    if (!sid || !index.some((s) => s.id === sid)) sid = index.length ? index[0].id : null;
    if (!VIEWS.includes(view)) view = 'home';
    return { sid, view, arg, params };
  }

  let renderToken = 0;
  /** opts.quiet: render ulang karena skor live berubah (tanpa animasi, posisi scroll dipertahankan). */
  async function render(opts = {}) {
    const quiet = opts && opts.quiet === true;
    const route = parse();
    const token = ++renderToken;
    if (!route.sid) {
      main.innerHTML = '<p class="notice">Data belum tersedia. Jalankan <code>python3 scripts/build_data.py</code>.</p>';
      return;
    }
    updateChrome(route);
    if (!MPL.seasons[route.sid]) main.innerHTML = '<div class="loading">Memuat data musim…</div>';
    let season;
    try {
      season = await loadSeason(route.sid);
    } catch (e) {
      main.innerHTML = html`<p class="notice">${e.message}</p>`.toString();
      return;
    }
    if (token !== renderToken) return;
    syncLive(season);
    if (quiet && !LIVE_VIEWS.includes(route.view)) {
      updateLiveBar(route.sid);
      return;
    }
    const fn = V[route.view] || V.home;
    let view;
    try {
      view = fn(route.sid, season, route.arg, route.params);
    } catch (e) {
      console.error(e);
      view = V.notFound(route.sid, 'Terjadi kesalahan saat menampilkan halaman ini.');
    }
    const y = window.scrollY;
    main.innerHTML = view.body.toString();
    document.title = `${view.title} · MPL ID Hub`;
    if (view.mount) view.mount(main);
    updateLiveBar(route.sid);
    if (quiet) {
      window.scrollTo(0, y);
      return;
    }
    animate(main);
    const updated = document.getElementById('data-updated');
    if (updated) updated.textContent = season.generatedAt ? `Data diperbarui ${fmt.date(season.generatedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB.` : '';
    const target = view.scrollTo && document.getElementById(view.scrollTo);
    if (target && lastView === route.view) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    if (lastView !== null) main.focus({ preventScroll: true });
    lastView = route.view;
  }
  let lastView = null;

  // ---------------------------------------------------------- animasi
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const STAGGER = '.team-cards, .matches, .people, .rank-list, .placements, .role-pool, .game-list, .grid, .scoreboard, table.data tbody, .tc-squad, .b-stack';

  /** Satu momen masuk per halaman: bagian lalu isi daftar muncul berurutan. */
  function animate(root) {
    if (reduceMotion.matches) return;
    const mark = (el, i) => {
      el.classList.add('anim-in');
      el.style.setProperty('--i', i);
      el.addEventListener('animationend', function done(e) {
        if (e.target !== el) return;
        el.classList.remove('anim-in');
        el.removeEventListener('animationend', done);
      });
    };
    [...root.children].forEach((el, i) => mark(el, Math.min(i, 6)));
    root.querySelectorAll(STAGGER).forEach((list) => [...list.children].forEach((c, j) => mark(c, Math.min(j, 14))));
    countUp(root);
  }

  /** Angka papan skor berhitung naik; teks akhir selalu nilai aslinya. */
  function countUp(root) {
    root.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      if (!isFinite(target) || target <= 0) return;
      const type = el.dataset.fmt;
      const final = el.textContent;
      const show = (v) => (type === 'pct' ? (v / 10).toFixed(1).replace('.', ',') + '%' : type === 'dur' ? fmt.duration(v) : fmt.int(Math.round(v)));
      const t0 = performance.now();
      const dur = 900;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = p < 1 ? show(target * (1 - Math.pow(1 - p, 3))) : final;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function updateChrome(route) {
    navLinks.forEach((a) => {
      const v = a.dataset.nav;
      a.href = V.href(route.sid, v);
      if (NAV_OF[route.view] === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (brand) brand.href = V.href(route.sid, 'home');
    if (select.value !== route.sid) select.value = route.sid;
  }

  // ------------------------------------------------------ season picker
  select.innerHTML = index.map((s) => `<option value="${s.id}">Season ${s.season}</option>`).join('');
  select.addEventListener('change', () => {
    const r = parse();
    let view = r.view, arg = r.arg;
    if (view === 'match') {
      view = 'regular';
      arg = null;
    }
    location.hash = V.href(select.value, view, arg, { phase: r.params.phase, lane: r.params.lane });
  });

  // -------------------------------------------------------------- theme
  const themeBtn = document.getElementById('theme-toggle');
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mpl-theme', next);
    } catch (e) { /* abaikan */ }
  });

  // --------------------------------------------------------- skor live
  // data/live.json dibuat scripts/live_update.py (GitHub Actions / lokal).
  // Saat situs dibuka lewat http(s), file itu dibaca ulang berkala; saat
  // dibuka dari file atau di halaman statis, data/live.js menjadi snapshot.
  const LIVE_VIEWS = ['home', 'regular', 'playoffs', 'teams', 'team', 'match'];
  const liveBar = document.getElementById('live-bar');
  const canPoll = /^https?:$/.test(location.protocol);
  let liveVersion = 0;
  let polling = false;
  let pollTimer = null;

  function syncLive(season) {
    if (season._liveVersion === liveVersion) return;
    MPL.stats.applyLive(season, MPL.live || null);
    season._liveVersion = liveVersion;
  }

  function updateLiveBar(sid) {
    if (!liveBar) return;
    const season = MPL.seasons[sid];
    const lives = season ? MPL.stats.liveMatches(season) : [];
    if (!lives.length) {
      liveBar.hidden = true;
      liveBar.innerHTML = '';
      return;
    }
    const at = MPL.live && MPL.live.updatedAt ? fmt.time(MPL.live.updatedAt) : '';
    const note = polling ? `Diperbarui otomatis${at ? ', skor terakhir berubah ' + at : ''}` : `Snapshot skor ${at}`;
    liveBar.innerHTML = lives.map((m) => {
      const t = m.teams.map((x) => (x ? MPL.util.team(x) : null));
      return html`<div class="wrap live-inner">
        <span class="pill pill-live">Live</span>
        <a class="live-score" href="${V.href(sid, 'match', m.id)}">${MPL.util.teamBadge(m.teams[0], 'sm')}<b>${t[0] ? t[0].short : 'TBD'}</b><span class="ls-num">${m.score[0]}<i>–</i>${m.score[1]}</span><b>${t[1] ? t[1].short : 'TBD'}</b>${MPL.util.teamBadge(m.teams[1], 'sm')}</a>
        <span class="live-meta">${m.stage || m.label} · Bo${m.bestOf}</span>
        <span class="live-note">${note}</span>
        ${m.official && m.official.watch ? html`<a class="btn btn-sm live-watch" href="${m.official.watch}" target="_blank" rel="noopener">Tonton siaran</a>` : ''}
      </div>`.toString();
    }).join('');
    liveBar.hidden = false;
  }

  function anyLive() {
    return ((MPL.live && MPL.live.matches) || []).some((m) => m.status === 'live');
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    try {
      const r = await fetch('data/live.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        const firstOk = !polling;
        polling = true;
        if (data && data.mplLive && (!MPL.live || data.updatedAt !== MPL.live.updatedAt)) {
          MPL.live = data;
          liveVersion++;
          render({ quiet: true });
        } else if (firstOk) {
          updateLiveBar(parse().sid);
        }
      }
    } catch (e) { /* jaringan putus atau file belum ada: coba lagi nanti */ }
    pollTimer = setTimeout(poll, anyLive() ? 30000 : 120000);
  }

  if (canPoll) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    setTimeout(poll, 1500);
  }

  window.addEventListener('hashchange', () => render());
  render();
})();
