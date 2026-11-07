/* Semua halaman (view). Setiap view mengembalikan { title, body, mount? }. */
(function () {
  'use strict';

  const MPL = window.MPL;
  const U = MPL.util;
  const S = MPL.stats;
  const { html, fmt, LANES, ROLE_ORDER, hero, team, teamLink, teamBadge, heroChip, heroAva, bar } = U;

  const PHASES = { all: 'Semua', regular: 'Regular Season', playoffs: 'Playoff' };
  const STAGE_ID = {
    'Upper Bracket Quarterfinal': 'Upper Bracket Perempat Final',
    'Upper Bracket Semifinal': 'Upper Bracket Semifinal',
    'Lower Bracket Semifinal': 'Lower Bracket Semifinal',
    'Upper Bracket Final': 'Upper Bracket Final',
    'Lower Bracket Final': 'Lower Bracket Final',
    'Grand Final': 'Grand Final',
  };

  // ------------------------------------------------------------ helpers
  const href = U.href;

  function phaseTabs(sid, view, arg, current, extra = {}) {
    return html`<div class="tabs" role="tablist" aria-label="Fase turnamen">${Object.entries(PHASES).map(
      ([k, v]) => html`<a class="tab" role="tab" aria-selected="${String(current === k)}" href="${href(sid, view, arg, { ...extra, phase: k })}">${v}</a>`
    )}</div>`;
  }

  function sectionHead(title, desc, right) {
    return html`<div class="section-head"><div><h2>${title}</h2>${desc ? html`<p>${desc}</p>` : ''}</div>${right || ''}</div>`;
  }

  function placeLabel(place, season) {
    if (!place) {
      const live = S.status(season) !== 'done';
      return live ? 'Masih bertanding' : '—';
    }
    if (place === '1') return 'Juara';
    if (place === '2') return 'Runner-up';
    if (Number(place) >= 7) return 'Tidak lolos playoff';
    return 'Peringkat ' + place;
  }

  function stageName(m) {
    return m.phase === 'playoffs' ? STAGE_ID[m.stage] || m.stage : m.label;
  }

  function mvpView(season, m) {
    if (!m.mvp) return null;
    const p = S.resolvePlayer(season, m.mvp, m.teams);
    return { name: p.name, team: p.team, link: p.link };
  }

  function matchCard(sid, season, m, opts = {}) {
    const done = !!m.winner;
    const row = (i) => {
      const cls = done ? (m.winner === i + 1 ? 'won' : 'lost') : '';
      return html`<div class="mc-row ${cls}">${m.teams[i] ? html`<span class="team-link">${teamBadge(m.teams[i])}<span class="tn">${team(m.teams[i]).name}</span></span>` : html`<span class="team-link">${teamBadge(null)}<span class="tn muted">TBD</span></span>`}<span class="mc-score">${done || m.games.length ? m.score[i] : '–'}</span></div>`;
    };
    const mvp = mvpView(season, m);
    return html`<a class="match-card" href="${href(sid, 'match', m.id)}" aria-label="${(m.teams[0] ? team(m.teams[0]).name : 'TBD') + ' melawan ' + (m.teams[1] ? team(m.teams[1]).name : 'TBD')}">
      <div class="mc-top"><span>${opts.showLabel ? stageName(m) : 'Bo' + m.bestOf}</span><span class="nowrap">${fmt.date(m.date, { day: 'numeric', month: 'short' })} · ${fmt.time(m.date)}</span></div>
      ${row(0)}${row(1)}
      <div class="mc-foot"><span>${done ? html`MVP: <b>${mvp ? mvp.name : '—'}</b>` : html`<span class="pill pill-accent">Akan datang</span>`}</span><span>${m.games.length ? m.games.length + ' game' : ''}</span></div>
    </a>`;
  }

  function rankList(sid, items, valueFn) {
    if (!items.length) return html`<p class="empty">Belum ada data.</p>`;
    return html`<ol class="rank-list">${items.map(
      (x, i) => html`<li><span class="i">${i + 1}</span>${heroChip(sid, x.id, { size: 'sm' })}<span class="v">${valueFn(x)}</span></li>`
    )}</ol>`;
  }

  function statTile(k, v, s) {
    return html`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? html`<div class="s">${s}</div>` : ''}</div>`;
  }

  // ================================================================ HOME
  function home(sid, season) {
    const meta = season.meta;
    const st = S.status(season);
    const sum = S.summary(season);
    const champ = S.champion(season);
    const table = S.standings(season);
    const hs = S.heroStats(season, 'all');
    const topPick = hs.list.slice().sort((a, b) => b.picks - a.picks).slice(0, 5);
    const topBan = hs.list.slice().sort((a, b) => b.bans - a.bans).slice(0, 5);
    const topWr = hs.list.filter((h) => h.picks >= 15).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
    const rsVenue = meta.venues.find((v) => /regular/i.test(v.desc)) || meta.venues[0];
    const poVenue = meta.venues.find((v) => /playoff/i.test(v.desc)) || meta.venues[1];
    const next = S.nextMatch(season);

    const statusPill = st === 'done' ? html`<span class="pill pill-done">Selesai</span>` : st === 'live' ? html`<span class="pill pill-live">Sedang berlangsung</span>` : html`<span class="pill">Segera</span>`;

    let feature;
    if (champ) {
      const t = team(champ.team);
      const mvp = mvpView(season, champ.match);
      const fmvp = season.awards.find((a) => a.award === 'Finals MVP');
      const fm = fmvp && fmvp.winners[0];
      feature = html`<a class="feature card" href="${href(sid, 'match', champ.match.id)}" style="--tc:${t.color};text-decoration:none">
        ${teamBadge(champ.team, 'xl')}
        <div><div class="label">Juara ${meta.shortName || meta.name}</div><h3>${t.name}</h3>
          <p class="muted">Menang ${Math.max(...champ.match.score)}–${Math.min(...champ.match.score)} atas ${team(champ.runnerUp).name} di Grand Final${fm ? html` · MVP Final: <b>${fm.player}</b>` : mvp ? html` · MVP: <b>${mvp.name}</b>` : ''}</p></div>
        <span class="btn btn-sm">Lihat draft final →</span></a>`;
    } else if (next) {
      const gf = season.playoffs.matches.find((m) => m.slot === 'R4M1');
      feature = html`<a class="feature card" href="${href(sid, 'match', next.id)}" style="text-decoration:none">
        <span class="vs-logos" aria-hidden="true">${teamBadge(next.teams[0], 'lg')}<b>VS</b>${teamBadge(next.teams[1], 'lg')}</span>
        <div><div class="label">Pertandingan berikutnya · ${stageName(next)}</div>
          <h3>${next.teams[0] ? team(next.teams[0]).name : 'TBD'} vs ${next.teams[1] ? team(next.teams[1]).name : 'TBD'}</h3>
          <p class="muted">${fmt.dayDate(next.date)} · ${fmt.time(next.date)}${gf && gf !== next ? html` · Grand Final ${fmt.date(gf.date, { day: 'numeric', month: 'long' })}: <b>${gf.teams.map((x) => (x ? team(x).short : 'TBD')).join(' vs ')}</b>` : ''}</p></div>
        <span class="btn btn-sm">Detail match →</span></a>`;
    }

    const awards = season.awards.filter((a) => a.winners.length);
    return {
      title: meta.name,
      body: html`
      <section class="section banner">
        <div class="eyebrow">Mobile Legends: Bang Bang Professional League Indonesia</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h1>${meta.name}</h1>${statusPill}</div>
        ${meta.tagline ? html`<div class="tagline">“${meta.tagline}”</div>` : ''}
        <dl class="banner-meta">
          <div><dt>Jadwal</dt><dd>${fmt.date(meta.startDate, { day: 'numeric', month: 'short' })} – ${fmt.date(meta.endDate)}</dd></div>
          ${rsVenue ? html`<div><dt>Regular Season</dt><dd>${rsVenue.name}, ${rsVenue.city}</dd></div>` : ''}
          ${poVenue ? html`<div><dt>Playoff</dt><dd>${poVenue.name}, ${poVenue.city}</dd></div>` : ''}
          <div><dt>Total hadiah</dt><dd>${fmt.rupiah(meta.prizePool)}</dd></div>
          <div><dt>Tim</dt><dd>${meta.teamCount || table.length} tim</dd></div>
          ${meta.patch ? html`<div><dt>Patch</dt><dd>${meta.patch}${meta.endPatch ? ' → ' + meta.endPatch : ''}</dd></div>` : ''}
        </dl>
        <div class="banner-actions">
          <a class="btn btn-primary" href="${href(sid, 'regular')}">Klasemen &amp; jadwal</a>
          <a class="btn" href="${href(sid, 'playoffs')}">Bracket playoff</a>
          <a class="btn" href="${href(sid, 'teams')}">Roster tim</a>
          <a class="btn" href="${href(sid, 'heroes')}">Statistik hero</a>
        </div>
      </section>

      ${feature ? html`<section class="section">${feature}</section>` : ''}

      <section class="section">
        <div class="grid grid-4">
          ${statTile('Match selesai', html`${sum.matches}<small class="muted" style="font-size:16px"> / ${sum.totalMatches}</small>`, 'Regular season + playoff')}
          ${statTile('Total game', fmt.int(sum.games), `${S.summary(season, 'regular').games} RS · ${S.summary(season, 'playoffs').games} playoff`)}
          ${statTile('Durasi rata-rata', fmt.duration(sum.avgDuration), sum.longest ? `Terlama ${fmt.duration(sum.longest.sec)} · tercepat ${fmt.duration(sum.shortest.sec)}` : '')}
          ${statTile('Win rate blue side', fmt.pct(sum.blueWinRate), `${sum.uniqueHeroes} hero berbeda dipick`)}
        </div>
      </section>

      <section class="section grid grid-2">
        <div class="card card-pad">
          ${sectionHead('Klasemen Regular Season', 'Peringkat 1–6 lolos ke playoff', html`<a class="link-more" href="${href(sid, 'regular')}">Semua →</a>`)}
          ${standingsTable(sid, season, { compact: true })}
        </div>
        <div class="card card-pad">
          ${sectionHead('Playoff', poVenue ? `${poVenue.name}, ${poVenue.city}` : '', html`<a class="link-more" href="${href(sid, 'playoffs')}">Bracket →</a>`)}
          ${placementList(sid, season, { compact: true })}
        </div>
      </section>

      <section class="section">
        ${sectionHead('Meta hero musim ini', `Dari ${hs.games} game regular season & playoff`, html`<a class="link-more" href="${href(sid, 'heroes')}">Statistik lengkap →</a>`)}
        <div class="grid grid-3">
          <div class="card card-pad"><h3 style="margin-bottom:6px">Paling sering dipick</h3>${rankList(sid, topPick, (x) => html`${x.picks}<small>pick</small>`)}</div>
          <div class="card card-pad"><h3 style="margin-bottom:6px">Paling sering diban</h3>${rankList(sid, topBan, (x) => html`${x.bans}<small>ban</small>`)}</div>
          <div class="card card-pad"><h3 style="margin-bottom:6px">Win rate tertinggi <small class="muted" style="font-weight:500">(min. 15 pick)</small></h3>${rankList(sid, topWr, (x) => html`${fmt.pct(x.winRate)}<small>${x.picks} pick</small>`)}</div>
        </div>
      </section>

      ${awards.length ? html`<section class="section">
        ${sectionHead('Penghargaan musim', 'Diumumkan oleh MPL Indonesia')}
        <div class="grid grid-3">${awards.map((a) => html`<div class="card award"><div class="an">${U.AWARD_NAMES[a.award] || a.award}</div><div class="aw">${a.winners.map((w) =>
          w.player
            ? html`<span class="who">${U.personAvatar({ id: w.player, link: w.link }, w.team, 'xs')}${w.player}${w.team ? html`<span class="muted" style="font-weight:500;font-size:12px">${team(w.team).short}</span>` : ''}</span>`
            : html`<span class="who">${teamLink(sid, w.team, { size: 'sm' })}</span>`
        )}</div></div>`)}</div>
      </section>` : ''}
      `,
    };
  }

  // ========================================================== STANDINGS
  function standingsTable(sid, season, opts = {}) {
    const rows = S.standings(season);
    const compact = !!opts.compact;
    return html`<div class="table-wrap"><table class="data">
      <thead><tr><th class="c">#</th><th>Tim</th><th class="c">Match</th>${compact ? '' : html`<th class="c">Main</th>`}<th class="c">Game</th><th class="c">Diff</th>${compact ? '' : html`<th class="c">Poin</th><th>5 terakhir</th>`}</tr></thead>
      <tbody>${rows.map(
        (r) => html`<tr class="zone zone-${S.zone(r.rank)}">
          <td class="c"><span class="rank">${r.rank}</span></td>
          <td>${teamLink(sid, r.team, { short: compact })}</td>
          <td class="c num"><b>${r.w}</b>–${r.l}</td>
          ${compact ? '' : html`<td class="c num">${r.played}</td>`}
          <td class="c num">${r.gw}–${r.gl}</td>
          <td class="c num ${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}">${fmt.signed(r.diff)}</td>
          ${compact ? '' : html`<td class="c num"><b>${r.points}</b></td><td><span class="form">${r.form.slice(-5).map((f) => html`<b class="${f}" title="${f === 'W' ? 'Menang' : 'Kalah'}">${f === 'W' ? 'M' : 'K'}</b>`)}</span></td>`}
        </tr>`
      )}</tbody></table></div>
      <div class="legend"><span style="--zc:var(--accent)"><i></i>Upper Bracket Semifinal</span><span style="--zc:var(--blue)"><i></i>Upper Bracket Perempat Final</span><span style="--zc:var(--border-strong)"><i></i>Tersingkir</span></div>`;
  }

  // ============================================================ REGULAR
  function regular(sid, season, arg, params) {
    const weeks = season.regular;
    const lastPlayed = weeks.filter((w) => w.matches.some((m) => m.winner)).pop();
    const wk = Number(params.week) || (lastPlayed ? lastPlayed.week : 1);
    const week = weeks.find((w) => w.week === wk) || weeks[0];
    const byDay = [];
    week.matches.forEach((m) => {
      let d = byDay.find((x) => x.day === m.day);
      if (!d) byDay.push((d = { day: m.day, date: m.date, list: [] }));
      d.list.push(m);
    });
    const sum = S.summary(season, 'regular');
    return {
      title: 'Regular Season — ' + season.meta.name,
      body: html`
      <section class="section">
        <div class="eyebrow">${season.meta.name}</div>
        ${sectionHead('Regular Season', `Double round robin · setiap match Bo3 · ${weeks.length} minggu · ${sum.matches}/${sum.totalMatches} match selesai`)}
        <div class="card card-pad">${standingsTable(sid, season)}</div>
        <p class="muted" style="font-size:13px;margin-top:10px">Urutan: poin (jumlah match menang) → selisih game → head-to-head.</p>
      </section>
      <section class="section" id="jadwal">
        ${sectionHead('Jadwal & hasil', 'Klik match untuk melihat draft hero tiap game')}
        <div class="tabs" role="tablist" aria-label="Pilih minggu">${weeks.map(
          (w) => html`<a class="tab" role="tab" aria-selected="${String(w.week === week.week)}" href="${href(sid, 'regular', null, { week: w.week })}">Week ${w.week}</a>`
        )}</div>
        ${byDay.map((d) => html`<h3 class="day-title">${d.day ? d.day + ' · ' : ''}${fmt.dayDate(d.date)}</h3><div class="matches">${d.list.map((m) => matchCard(sid, season, m))}</div>`)}
      </section>`,
      scrollTo: params.week ? 'jadwal' : null,
    };
  }

  // =========================================================== PLAYOFFS
  function bracketMatch(sid, season, m, final) {
    if (!m) return '';
    const done = !!m.winner;
    const row = (i) => {
      const t = m.teams[i];
      const cls = !t ? 'tbd' : done ? (m.winner === i + 1 ? 'won' : 'lost') : '';
      return html`<div class="b-team ${cls}">${teamBadge(t, 'sm')}<span class="tn">${t ? team(t).name : 'TBD'}</span><span class="sc">${m.games.length || done ? m.score[i] : ''}</span></div>`;
    };
    return html`<a class="b-match ${final ? 'final' : ''}" href="${href(sid, 'match', m.id)}"><div class="bm-head"><span>Bo${m.bestOf}</span><span>${fmt.date(m.date, { day: 'numeric', month: 'short' })} · ${fmt.time(m.date)}</span></div>${row(0)}${row(1)}</a>`;
  }

  function placementList(sid, season, opts = {}) {
    const pl = S.placements(season);
    const order = ['1', '2', '3', '4', '5–6'];
    const rows = [];
    order.forEach((p) => {
      const teams = Object.keys(pl).filter((t) => pl[t] === p);
      if (teams.length) teams.forEach((t) => rows.push({ p, t }));
      else rows.push({ p, t: null });
    });
    const label = { '1': 'Juara', '2': 'Runner-up', '3': 'Ke-3', '4': 'Ke-4', '5–6': '5–6' };
    const seen = {};
    const list = rows.filter((r) => {
      if (r.t) return true;
      if (seen[r.p]) return false;
      seen[r.p] = 1;
      return true;
    });
    return html`<div class="placements">${list.map(
      (r) => html`<div class="place ${r.p === '1' ? 'p1' : ''}"><span class="p">${r.p === '1' ? '🏆' : r.p}</span>${r.t ? teamLink(sid, r.t) : html`<span class="muted">${label[r.p]} — belum ditentukan</span>`}<span class="prize">${opts.compact ? (r.t ? label[r.p] : '') : fmt.rupiah(S.prizeFor(season, r.p))}</span></div>`
    )}</div>`;
  }

  function playoffs(sid, season) {
    const by = {};
    season.playoffs.matches.forEach((m) => (by[m.slot] = m));
    const poVenue = season.meta.venues.find((v) => /playoff/i.test(v.desc));
    const dates = season.playoffs.matches.map((m) => m.date).filter(Boolean).sort();
    const hs = S.heroStats(season, 'playoffs');
    const stages = [];
    season.playoffs.matches
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach((m) => {
        let s = stages.find((x) => x.stage === m.stage);
        if (!s) stages.push((s = { stage: m.stage, list: [] }));
        s.list.push(m);
      });
    const col = (title, ...ms) => html`<div class="b-cell"><div class="b-col-title">${title}</div><div class="b-stack">${ms}</div></div>`;
    const note = (text) => html`<div class="b-cell"><div class="b-col-title">&nbsp;</div><div class="b-stack"><p class="muted" style="font-size:13px">${text}</p></div></div>`;
    const bos = {};
    season.playoffs.matches.forEach((m) => (bos[m.bestOf] = bos[m.bestOf] || []).push(STAGE_ID[m.stage] || m.stage));
    const mainBo = Object.keys(bos).sort((a, b) => bos[b].length - bos[a].length)[0];
    const boText = Object.keys(bos).length > 1
      ? `Bo${mainBo}; ${Object.keys(bos).filter((b) => b !== mainBo).map((b) => [...new Set(bos[b])].join(' & ') + ' Bo' + b).join('; ')}`
      : mainBo ? `Bo${mainBo}` : '';
    return {
      title: 'Playoff — ' + season.meta.name,
      body: html`
      <section class="section">
        <div class="eyebrow">${season.meta.name}</div>
        ${sectionHead('Playoff', `${poVenue ? poVenue.name + ', ' + poVenue.city + ' · ' : ''}${dates.length ? fmt.date(dates[0], { day: 'numeric', month: 'short' }) + ' – ' + fmt.date(dates[dates.length - 1]) : ''} · ${boText}`)}
        <p class="muted" style="margin:-4px 0 16px;font-size:14px">Format hybrid: peringkat 1–2 regular season langsung ke Upper Bracket Semifinal, peringkat 3–6 mulai dari Upper Bracket Perempat Final (kalah = tersingkir). Kalah di Upper Bracket Semifinal/Final masih punya kesempatan di Lower Bracket.</p>
        <div class="bracket-scroll card card-pad">
          <div class="bracket">
            <div class="b-lane-title" style="margin-top:0">Upper Bracket</div>
            ${col('Perempat Final', bracketMatch(sid, season, by.R1M1), bracketMatch(sid, season, by.R1M2))}
            ${col('Semifinal', bracketMatch(sid, season, by.R2M1), bracketMatch(sid, season, by.R2M2))}
            ${col('Upper Final', bracketMatch(sid, season, by.R3M1))}
            ${col('Grand Final', bracketMatch(sid, season, by.R4M1, true))}
            <div class="b-lane-title">Lower Bracket</div>
            ${note('Kalah di perempat final langsung tersingkir (peringkat 5–6).')}
            ${col('Lower Semifinal', bracketMatch(sid, season, by.R2M3))}
            ${col('Lower Final', bracketMatch(sid, season, by.R3M2))}
            ${note('Pemenang Lower Final menantang pemenang Upper Final di Grand Final.')}
          </div>
        </div>
        <div class="stage-list">${stages.map((s) => html`<div><h3 class="day-title" style="margin-top:0">${STAGE_ID[s.stage] || s.stage}</h3><div class="matches">${s.list.map((m) => matchCard(sid, season, m))}</div></div>`)}</div>
      </section>
      <section class="section grid grid-2">
        <div>${sectionHead('Hasil akhir & hadiah', 'Hadiah dasar per posisi')}${placementList(sid, season)}</div>
        <div>
          ${sectionHead('Hero di playoff', `${hs.games} game`, html`<a class="link-more" href="${href(sid, 'heroes', null, { phase: 'playoffs' })}">Lengkap →</a>`)}
          <div class="grid grid-2">
            <div class="card card-pad"><h3 style="margin-bottom:6px">Top pick</h3>${rankList(sid, hs.list.slice().sort((a, b) => b.picks - a.picks).slice(0, 6), (x) => html`${x.picks}<small>${fmt.pct(x.winRate, 0)}</small>`)}</div>
            <div class="card card-pad"><h3 style="margin-bottom:6px">Top ban</h3>${rankList(sid, hs.list.slice().sort((a, b) => b.bans - a.bans).slice(0, 6), (x) => html`${x.bans}<small>ban</small>`)}</div>
          </div>
        </div>
      </section>`,
    };
  }

  // ============================================================== MATCH
  function draftGrid(sid, m, g) {
    const cell = (t, inner, extra = '') => html`<div class="dc ${t ? 'r' : 'l'} ${g.winner === t + 1 ? 'won' : ''} ${extra}">${inner}</div>`;
    const head = (t) => {
      const tid = m.teams[t];
      const side = g.sides[t];
      return html`${teamBadge(tid, 'sm')}<b>${tid ? team(tid).short : 'TBD'}</b>${side ? html`<span class="side side-${side}">${side}</span>` : ''}${g.winner === t + 1 ? html`<span class="win-tag">MENANG</span>` : ''}`;
    };
    return html`<div class="draft">
      ${cell(0, head(0), 'dh')}<div class="drole dh" aria-hidden="true"></div>${cell(1, head(1), 'dh')}
      ${ROLE_ORDER.map((r, i) => html`${cell(0, heroChip(sid, g.picks[0][i]))}<div class="drole"><span>${LANES[r].short}</span></div>${cell(1, heroChip(sid, g.picks[1][i]))}`)}
    </div>`;
  }

  function match(sid, season, id) {
    const m = S.findMatch(season, id);
    if (!m) return notFound(sid, 'Match tidak ditemukan.');
    const done = !!m.winner;
    const mvp = mvpView(season, m);
    const back = m.phase === 'regular' ? href(sid, 'regular', null, { week: m.week }) : href(sid, 'playoffs');
    const names = m.teams.map((t) => (t ? team(t).name : 'TBD'));
    const subs = m.subs.flatMap((list, i) => list.map((s) => ({ ...s, team: m.teams[i] })));
    const side = (i) => html`<a class="mh-team ${done && m.winner !== i + 1 ? 'lost' : ''}" href="${m.teams[i] ? href(sid, 'team', m.teams[i]) : '#'}">${teamBadge(m.teams[i], 'xl')}<span class="tn">${names[i]}</span></a>`;
    return {
      title: `${names[0]} vs ${names[1]} — ${stageName(m)}`,
      body: html`
      <a class="back" href="${back}">← ${m.phase === 'regular' ? 'Week ' + m.week : 'Playoff'}</a>
      <section class="card match-hero">
        ${side(0)}
        <div class="mh-score">${m.games.length ? html`<span>${m.score[0]}</span><span class="dash">–</span><span>${m.score[1]}</span>` : html`<span class="dash">VS</span>`}</div>
        ${side(1)}
        <div class="mh-meta">
          <span><b>${stageName(m)}</b></span>
          <span>${fmt.dayDate(m.date)} · ${fmt.time(m.date)}</span>
          <span>Best of ${m.bestOf}</span>
          ${mvp ? html`<span class="mvp-line">${U.personAvatar({ id: mvp.name, link: mvp.link }, mvp.team, 'xs')}MVP: <b>${mvp.name}</b>${mvp.team ? html` (${team(mvp.team).short})` : ''}</span>` : ''}
          ${m.casters.length ? html`<span>Caster: ${m.casters.join(', ')}</span>` : ''}
        </div>
      </section>
      ${subs.length ? html`<p class="notice" style="margin-top:14px">Pergantian pemain: ${subs.map((s, i) => html`${i ? '; ' : ''}<b>${team(s.team).short}</b> ${s.in} masuk menggantikan ${s.out}${s.games ? ` (game ${s.games.join(', ')})` : ''}`)}</p>` : ''}
      ${m.games.length ? '' : html`<p class="notice" style="margin-top:16px">Match ini belum dimainkan. Draft hero akan muncul setelah data diperbarui.</p>`}
      ${m.games.map(
        (g) => html`<article class="card game">
          <header class="game-head">
            <h3>Game ${g.n}</h3>
            <div class="gm">
              <span>Pemenang: <b>${g.winner ? team(m.teams[g.winner - 1]).name : '—'}</b></span>
              ${g.length ? html`<span>⏱ ${g.length}</span>` : ''}
              ${g.mode ? html`<span>Map: ${g.mode}</span>` : ''}
              ${g.vod ? html`<a class="btn btn-sm" href="${g.vod}" target="_blank" rel="noopener">▶ Tonton VOD</a>` : ''}
            </div>
          </header>
          ${draftGrid(sid, m, g)}
          <div class="bans-grid">
            ${[0, 1].map((t) => html`<div class="bans"><span class="bl">Ban ${m.teams[t] ? team(m.teams[t]).short : ''}</span>${g.bans[t].map((h) => heroChip(sid, h, { size: 'sm', banned: true }))}</div>`)}
          </div>
        </article>`
      )}
      ${m.games.length ? html`<p class="muted" style="font-size:12.5px;margin-top:12px">Urutan hero mengikuti posisi EXP · Jungle · Mid · Gold · Roam sesuai input draft di Liquipedia.</p>` : ''}`,
    };
  }

  // ============================================================== TEAMS
  function teams(sid, season) {
    const pl = S.placements(season);
    const rows = S.standings(season);
    return {
      title: 'Tim — ' + season.meta.name,
      body: html`
      <section class="section">
        <div class="eyebrow">${season.meta.name}</div>
        ${sectionHead('Tim peserta', `${rows.length} tim franchise · roster pemain, pelatih, dan analyst`)}
        <div class="team-cards">${rows.map((r) => {
          const t = team(r.team);
          const roster = season.rosters[r.team] || { players: [], staff: [] };
          const staffAll = roster.staff.concat(U.extraStaff(season, r.team));
          const hc = staffAll.find((p) => p.staffRole === 'head coach' && p.status !== 'former');
          const starters = roster.players.filter((p) => p.status === 'main').sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
          return html`<a class="card team-card" href="${href(sid, 'team', r.team)}" style="--tc:${t.color}">
            <div class="tc-top">${teamBadge(r.team, 'lg')}<div><h3>${t.name}</h3><div class="muted" style="font-size:13px">Peringkat #${r.rank} regular season</div></div></div>
            <ul class="tc-squad" aria-label="Pemain inti ${t.name}">${starters.map((p) => html`<li title="${p.id} · ${LANES[p.role] ? LANES[p.role].name : p.role}">${U.personAvatar(p, r.team)}<span>${p.id}</span></li>`)}</ul>
            <dl class="tc-stats"><div><dt>Match</dt><dd>${r.w}–${r.l}</dd></div><div><dt>Game</dt><dd>${r.gw}–${r.gl}</dd></div><div><dt>Playoff</dt><dd>${placeLabel(pl[r.team], season).replace('Peringkat ', '#').replace('Tidak lolos playoff', '—')}</dd></div></dl>
            <div class="tc-coach">${hc ? U.personAvatar(hc, r.team, 'xs') : ''}<span>Head Coach: <b>${hc ? hc.id : '—'}</b> · ${roster.players.filter((p) => p.status === 'sub').length} cadangan</span></div>
          </a>`;
        })}</div>
      </section>`,
    };
  }

  function personCard(p, staff, teamId) {
    const roleLabel = staff ? U.STAFF_ROLES[p.staffRole] || p.staffRole : LANES[p.role] ? LANES[p.role].name : p.role;
    const aka = (p.link || '').replace(/\s*\(.*\)$/, '');
    const t = team(teamId);
    const photo = U.photoOf(p);
    const cls = ['person', p.status === 'sub' ? 'sub' : '', p.status === 'former' ? 'former' : '', !staff ? 'lane-' + (p.role || 'flex') : 'staff'].join(' ');
    return html`<div class="${cls}" style="--tc:${t ? t.color : 'var(--surface-3)'}">
      <div class="person-photo">${photo ? html`<img src="${photo}" alt="Foto ${p.id}" loading="lazy" decoding="async">` : html`<span class="ph-initials" aria-hidden="true">${U.initials(p.id)}</span>`}</div>
      <div class="person-body">
      <span class="role" style="${staff ? 'color:var(--accent-text)' : 'color:var(--lc)'}">${roleLabel}</span>
      <span class="ign">${p.flag ? html`<span class="flag" title="${U.COUNTRY[p.flag] || p.flag.toUpperCase()}">${U.flagEmoji(p.flag)}</span>` : ''}${p.id}${p.captain ? html`<span class="cap">CAPTAIN</span>` : ''}${p.viceCaptain ? html`<span class="cap" style="background:var(--surface-3);color:var(--text-2)">VICE</span>` : ''}</span>
      ${aka && aka.toLowerCase() !== p.id.toLowerCase() ? html`<span class="aka">dikenal juga: ${aka}</span>` : ''}
      ${p.status === 'sub' ? html`<span class="aka">Cadangan${p.played === false ? ' · belum bermain' : ''}</span>` : ''}
      ${p.status === 'former' ? html`<span class="aka">Keluar di tengah musim</span>` : ''}
      ${p.source ? html`<span class="aka">Data dari situs resmi MPL ID</span>` : ''}
      </div>
    </div>`;
  }

  function teamPage(sid, season, id, params) {
    const t = team(id);
    if (!t || !season.rosters[id]) return notFound(sid, 'Tim tidak ditemukan di musim ini.');
    const phase = PHASES[params.phase] ? params.phase : 'all';
    const roster = season.rosters[id];
    const row = S.standings(season).find((r) => r.team === id);
    const place = S.placements(season)[id];
    const ts = S.teamStats(season, id, phase);
    const tsAll = S.teamStats(season, id, 'all');
    const starters = roster.players.filter((p) => p.status === 'main').sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    const subs = roster.players.filter((p) => p.status === 'sub');
    const former = roster.players.filter((p) => p.status === 'former').concat(roster.staff.filter((p) => p.status === 'former'));
    const staff = roster.staff.filter((p) => p.status !== 'former').concat(U.extraStaff(season, id));
    const staffOrder = ['head coach', 'coach', 'assistant coach', 'analyst', 'manager'];
    staff.sort((a, b) => staffOrder.indexOf(a.staffRole) - staffOrder.indexOf(b.staffRole));
    const hasAnalyst = staff.some((p) => p.staffRole === 'analyst');
    const ms = S.teamMatches(season, id);
    const maxPick = Math.max(1, ...ts.pools.flat().map((x) => x.picks));

    return {
      title: `${t.name} — ${season.meta.name}`,
      body: html`
      <a class="back" href="${href(sid, 'teams')}">← Semua tim</a>
      <section class="card team-head" style="--tc:${t.color}">
        ${teamBadge(id, 'xl')}
        <div>
          <div class="eyebrow">${season.meta.name}</div>
          <h1 style="font-size:clamp(26px,4vw,38px)">${t.name}</h1>
          <div class="facts">
            <span class="pill pill-accent">Peringkat #${row.rank} regular season</span>
            <span class="pill">Match ${row.w}–${row.l}</span>
            <span class="pill">Game ${row.gw}–${row.gl}</span>
            <span class="pill ${place === '1' ? 'pill-done' : ''}">Playoff: ${placeLabel(place, season)}</span>
            ${tsAll.blue ? html`<span class="pill">Blue side ${tsAll.blueWins}/${tsAll.blue}</span>` : ''}
            ${tsAll.avgDuration ? html`<span class="pill">Rata-rata game ${fmt.duration(tsAll.avgDuration)}</span>` : ''}
          </div>
        </div>
      </section>

      <section class="section">
        ${sectionHead('Pemain inti', 'Lima starter sesuai posisi')}
        <div class="people">${starters.map((p) => personCard(p, false, id))}</div>
        ${subs.length ? html`<h3 class="day-title">Cadangan</h3><div class="people">${subs.map((p) => personCard(p, false, id))}</div>` : ''}
      </section>

      <section class="section">
        ${sectionHead('Coach & analyst', 'Jajaran staf pelatih')}
        <div class="people">${staff.map((p) => personCard(p, true, id))}</div>
        ${hasAnalyst ? '' : html`<p class="muted" style="font-size:13px;margin-top:10px">Analyst tim ini tidak tercantum di Liquipedia maupun situs resmi MPL ID.</p>`}
        ${former.length ? html`<h3 class="day-title">Keluar di tengah musim</h3><div class="people">${former.map((p) => personCard(p, !!p.staffRole, id))}</div>` : ''}
      </section>

      <section class="section">
        ${sectionHead('Hero yang dipakai', `${ts.games} game · ${ts.wins} menang${ts.games ? ' (' + fmt.pct(ts.wins / ts.games, 0) + ')' : ''}`, phaseTabs(sid, 'team', id, phase))}
        ${ts.games ? html`<div class="role-pool">${ROLE_ORDER.map((r, i) => {
          const pl = starters.find((p) => p.role === r);
          return html`<div class="rp-row lane-${r}"><div class="rl">${LANES[r].name}${pl ? html`<small>Starter: ${pl.id}</small>` : ''}</div>
            <div class="rp-heroes">${ts.pools[i].map((x) => html`<a class="hp" href="${href(sid, 'hero', x.id, { phase })}" title="${hero(x.id).name}: ${x.picks} game, ${x.wins} menang">${heroAva(x.id, 'sm')}<span>${hero(x.id).name}</span><span class="cnt">×${x.picks}</span><span class="wr">${fmt.pct(x.wins / x.picks, 0)}</span></a>`)}</div></div>`;
        })}</div>
        <p class="muted" style="font-size:12.5px;margin-top:10px">Hero dikelompokkan per posisi draft (EXP · Jungle · Mid · Gold · Roam). Persentase = win rate tim saat memakai hero tersebut. Game yang dimainkan pemain cadangan ikut terhitung di posisi yang sama.</p>
        <div class="grid grid-3" style="margin-top:16px">
          <div class="card card-pad"><h3 style="margin-bottom:6px">Hero andalan</h3>${rankList(sid, ts.heroes.slice(0, 6), (x) => html`${x.picks}<small>${fmt.pct(x.wins / x.picks, 0)}</small>`)}</div>
          <div class="card card-pad"><h3 style="margin-bottom:6px">Paling sering diban lawan</h3>${rankList(sid, ts.bansAgainst.slice(0, 6), (x) => html`${x.n}<small>×</small>`)}</div>
          <div class="card card-pad"><h3 style="margin-bottom:6px">Paling sering diban ${t.short}</h3>${rankList(sid, ts.bansBy.slice(0, 6), (x) => html`${x.n}<small>×</small>`)}</div>
        </div>` : html`<p class="empty card">Belum ada game di fase ini.</p>`}
      </section>

      <section class="section">
        ${sectionHead('Riwayat match', `${ms.length} match regular season & playoff`)}
        <div class="matches">${ms.map((m) => matchCard(sid, season, m, { showLabel: true }))}</div>
      </section>`,
    };
  }

  // ============================================================= HEROES
  const HERO_COLS = [
    { k: 'name', label: 'Hero', get: (s) => hero(s.id).name, str: true },
    { k: 'picks', label: 'Pick', get: (s) => s.picks },
    { k: 'bans', label: 'Ban', get: (s) => s.bans },
    { k: 'presence', label: 'Presence', get: (s) => s.presence },
    { k: 'winRate', label: 'Win rate', get: (s) => (s.winRate == null ? -1 : s.winRate) },
  ];

  function heroes(sid, season, arg, params) {
    const phase = PHASES[params.phase] ? params.phase : 'all';
    const lane = LANES[params.lane] ? params.lane : 'all';
    const hs = S.heroStats(season, phase);
    const pool = MPL.heroes || [];
    const untouched = pool.filter((h) => !hs.byId[h.id] && (lane === 'all' || h.lane === lane));
    const maxPres = Math.max(0.01, ...hs.list.map((s) => s.presence));
    const mostPicked = hs.list.slice().sort((a, b) => b.picks - a.picks)[0];
    const mostBanned = hs.list.slice().sort((a, b) => b.bans - a.bans)[0];
    const mostPresent = hs.list.slice().sort((a, b) => b.presence - a.presence)[0];
    const laneTabs = html`<div class="tabs" aria-label="Filter lane">${[['all', 'Semua lane']].concat(ROLE_ORDER.map((r) => [r, LANES[r].name])).map(
      ([k, v]) => html`<a class="tab" aria-current="${String(lane === k)}" href="${href(sid, 'heroes', null, { phase, lane: k })}">${v}</a>`
    )}</div>`;

    return {
      title: 'Statistik Hero — ' + season.meta.name,
      body: html`
      <section class="section">
        <div class="eyebrow">${season.meta.name}</div>
        ${sectionHead('Statistik hero', `Pick, ban, presence, dan win rate dari ${hs.games} game${phase === 'all' ? '' : ' ' + PHASES[phase].toLowerCase()}`, phaseTabs(sid, 'heroes', null, phase, { lane }))}
        <div class="grid grid-4" style="margin-bottom:18px">
          ${statTile('Game', fmt.int(hs.games), PHASES[phase])}
          ${statTile('Hero dipakai', hs.list.filter((s) => s.picks).length, `dari ${pool.length} hero · ${hs.list.length} pernah dipick/diban`)}
          ${mostPicked ? statTile('Paling sering dipick', hero(mostPicked.id).name, `${mostPicked.picks} pick · WR ${fmt.pct(mostPicked.winRate)}`) : ''}
          ${mostBanned ? statTile('Paling sering diban', hero(mostBanned.id).name, `${mostBanned.bans} ban · presence ${fmt.pct(mostPresent.presence)} (${hero(mostPresent.id).name})`) : ''}
        </div>
        <div class="toolbar">${laneTabs}<input class="search" id="hero-search" type="search" placeholder="Cari hero…" aria-label="Cari hero" value="${params.q || ''}"></div>
        <div class="card"><div class="table-wrap"><table class="data" id="hero-table">
          <thead><tr><th class="c">#</th>${HERO_COLS.map((c) => html`<th class="sortable ${c.str ? '' : 'r'}" data-k="${c.k}" tabindex="0" scope="col">${c.label}</th>`)}<th>Lane</th><th class="r">M–K</th></tr></thead>
          <tbody></tbody>
        </table></div></div>
        <p class="muted" style="font-size:12.5px;margin-top:10px">Presence = (pick + ban) ÷ jumlah game. Win rate dihitung dari game saat hero dipick. Lane = posisi utama hero menurut Liquipedia.</p>
        ${untouched.length ? html`<details class="card card-pad" style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">${untouched.length} hero tidak pernah dipick maupun diban</summary><div class="rp-heroes" style="margin-top:12px">${untouched.map((h) => heroChip(sid, h.id, { size: 'sm' }))}</div></details>` : ''}
      </section>`,
      mount(root) {
        const tbody = root.querySelector('#hero-table tbody');
        const heads = root.querySelectorAll('#hero-table th.sortable');
        const input = root.querySelector('#hero-search');
        let sortK = params.sort && HERO_COLS.some((c) => c.k === params.sort) ? params.sort : 'presence';
        let dir = sortK === 'name' ? 1 : -1;
        const base = hs.list.filter((s) => lane === 'all' || hero(s.id).lane === lane);
        function render() {
          const q = input.value.trim().toLowerCase();
          const col = HERO_COLS.find((c) => c.k === sortK);
          const rows = base
            .filter((s) => !q || hero(s.id).name.toLowerCase().includes(q))
            .sort((a, b) => {
              const va = col.get(a), vb = col.get(b);
              const r = col.str ? String(va).localeCompare(String(vb)) : va - vb;
              return r * dir || b.presence - a.presence;
            });
          heads.forEach((h) => h.setAttribute('aria-sort', h.dataset.k === sortK ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
          tbody.innerHTML = rows.length
            ? rows.map((s, i) => html`<tr>
                <td class="c muted num">${i + 1}</td>
                <td>${heroChip(sid, s.id)}</td>
                <td class="r num">${s.picks}</td>
                <td class="r num">${s.bans}</td>
                <td class="r"><div class="bar-cell">${bar(s.presence, maxPres)}<span>${fmt.pct(s.presence)}</span></div></td>
                <td class="r"><div class="bar-cell">${s.picks ? bar(s.winRate, 1, 'win') : ''}<span>${s.picks ? fmt.pct(s.winRate) : '—'}</span></div></td>
                <td><span class="lane-dot lane-${hero(s.id).lane}">${(LANES[hero(s.id).lane] || LANES.flex).name}</span></td>
                <td class="r num muted">${s.wins}–${s.picks - s.wins}</td>
              </tr>`).join('')
            : html`<tr><td colspan="8" class="empty">Tidak ada hero yang cocok.</td></tr>`.toString();
        }
        heads.forEach((h) => {
          const go = () => {
            if (sortK === h.dataset.k) dir = -dir;
            else {
              sortK = h.dataset.k;
              dir = sortK === 'name' ? 1 : -1;
            }
            render();
          };
          h.addEventListener('click', go);
          h.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
        });
        input.addEventListener('input', render);
        render();
      },
    };
  }

  function heroPage(sid, season, id, params) {
    const h = MPL.heroes.find((x) => x.id === id);
    if (!h) return notFound(sid, 'Hero tidak ditemukan.');
    const phase = PHASES[params.phase] ? params.phase : 'all';
    const hs = S.heroStats(season, phase);
    const s = hs.byId[id] || { picks: 0, wins: 0, bans: 0, presence: 0, winRate: null, roles: [0, 0, 0, 0, 0], teams: {}, bannedBy: {} };
    const games = S.heroGames(season, id, phase);
    const byTeam = Object.entries(s.teams).map(([t, v]) => ({ t, ...v })).sort((a, b) => b.picks - a.picks || b.wins - a.wins);
    const bannedBy = Object.entries(s.bannedBy).map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n);
    const maxRole = Math.max(1, ...s.roles);
    const cmp = ['regular', 'playoffs'].map((p) => {
      const x = S.heroStats(season, p);
      return { p, games: x.games, s: x.byId[id] };
    });

    return {
      title: `${h.name} — Statistik Hero ${season.meta.name}`,
      body: html`
      <a class="back" href="${href(sid, 'heroes', null, { phase })}">← Statistik hero</a>
      <section class="card hero-head lane-${h.lane}">
        ${heroChip(sid, id, { size: 'lg', noName: true })}
        <div>
          <div class="eyebrow">${(LANES[h.lane] || LANES.flex).name} · ${season.meta.name}</div>
          <h1 style="font-size:clamp(28px,4vw,40px)">${h.name}</h1>
          <div class="kv">
            <span class="pill pill-accent">${s.picks} pick</span>
            <span class="pill">${s.bans} ban</span>
            <span class="pill">Presence ${fmt.pct(s.presence)}</span>
            <span class="pill ${s.winRate >= 0.5 ? 'pill-done' : ''}">Win rate ${fmt.pct(s.winRate)}</span>
          </div>
        </div>
      </section>
      <section class="section">
        ${sectionHead('Ringkasan', '', phaseTabs(sid, 'hero', id, phase))}
        <div class="grid grid-2">
          <div class="card"><div class="table-wrap"><table class="data">
            <thead><tr><th>Fase</th><th class="r">Pick</th><th class="r">Ban</th><th class="r">Presence</th><th class="r">Win rate</th></tr></thead>
            <tbody>${cmp.map((c) => html`<tr><td>${PHASES[c.p]} <span class="muted">(${c.games} game)</span></td><td class="r num">${c.s ? c.s.picks : 0}</td><td class="r num">${c.s ? c.s.bans : 0}</td><td class="r num">${fmt.pct(c.s ? c.s.presence : 0)}</td><td class="r num">${c.s && c.s.picks ? fmt.pct(c.s.winRate) : '—'}</td></tr>`)}</tbody>
          </table></div></div>
          <div class="card card-pad"><h3 style="margin-bottom:10px">Dipakai di posisi</h3>
            ${s.picks ? html`<div style="display:grid;gap:10px">${ROLE_ORDER.map((r, i) => html`<div class="bar-cell lane-${r}"><span class="lane-dot" style="min-width:90px;justify-content:flex-start">${LANES[r].name}</span><span class="bar" style="--accent:var(--lc)"><i style="width:${Math.round((s.roles[i] / maxRole) * 100)}%;background:var(--lc)"></i></span><span>${s.roles[i]}</span></div>`)}</div>` : html`<p class="muted">Belum pernah dipick di fase ini.</p>`}
          </div>
        </div>
      </section>
      <section class="section grid grid-2">
        <div class="card card-pad"><h3 style="margin-bottom:8px">Tim yang memakai</h3>
          ${byTeam.length ? html`<ol class="rank-list">${byTeam.map((x, i) => html`<li><span class="i">${i + 1}</span>${teamLink(sid, x.t)}<span class="v">${x.picks}<small>${x.wins}M–${x.picks - x.wins}K</small></span></li>`)}</ol>` : html`<p class="muted">Belum ada.</p>`}
        </div>
        <div class="card card-pad"><h3 style="margin-bottom:8px">Diban oleh</h3>
          ${bannedBy.length ? html`<ol class="rank-list">${bannedBy.map((x, i) => html`<li><span class="i">${i + 1}</span>${teamLink(sid, x.t)}<span class="v">${x.n}<small>×</small></span></li>`)}</ol>` : html`<p class="muted">Belum pernah diban.</p>`}
        </div>
      </section>
      <section class="section">
        ${sectionHead('Daftar game', `${games.length} kemunculan (pick & ban)`)}
        ${games.length ? html`<div class="game-list">${games.slice(0, 120).map((x) => html`<a class="gl-row" href="${href(sid, 'match', x.match.id)}">
          <span class="res ${x.type === 'ban' ? 'B' : x.won ? 'W' : 'L'}">${x.type === 'ban' ? 'BAN' : x.won ? 'M' : 'K'}</span>
          <span><span class="ttl">${teamBadge(x.team, 'sm')} ${team(x.team).short} <span class="muted">vs</span> ${team(x.opp).short} · Game ${x.game.n}</span>
          <span class="sub">${stageName(x.match)} · ${fmt.date(x.match.date)}${x.type === 'pick' ? ' · posisi ' + LANES[ROLE_ORDER[x.role]].name : ' · diban oleh ' + team(x.team).short}</span></span>
          <span class="muted num">${x.game.length || ''}</span></a>`)}</div>` : html`<p class="empty card">Hero ini tidak muncul di fase ini.</p>`}
      </section>`,
    };
  }

  function notFound(sid, msg) {
    return { title: 'Tidak ditemukan', body: html`<div class="card empty"><h2>Ups!</h2><p style="margin:8px 0 16px">${msg}</p><a class="btn btn-primary" href="${href(sid, 'home')}">Kembali ke beranda</a></div>` };
  }

  MPL.views = { home, regular, playoffs, teams, team: teamPage, heroes, hero: heroPage, match, notFound, href };
})();
