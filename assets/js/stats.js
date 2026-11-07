/* Perhitungan klasemen, statistik hero, statistik tim, dan ringkasan musim. */
(function () {
  'use strict';

  const MPL = window.MPL;
  const { toSec } = MPL.util;
  const cache = new WeakMap();

  function memo(season, key, fn) {
    let c = cache.get(season);
    if (!c) cache.set(season, (c = {}));
    if (!(key in c)) c[key] = fn();
    return c[key];
  }

  // ------------------------------------------------------------ Matches
  /** Semua match dengan tambahan field phase, label, dan key. */
  function matches(season, phase = 'all') {
    const list = memo(season, 'matches', () => {
      const out = [];
      season.regular.forEach((w) =>
        w.matches.forEach((m) => {
          m.phase = 'regular';
          m.week = w.week;
          m.label = `Week ${w.week}${m.day ? ' · ' + m.day : ''}`;
          out.push(m);
        })
      );
      season.playoffs.matches.forEach((m) => {
        m.phase = 'playoffs';
        m.label = m.stage;
        out.push(m);
      });
      return out;
    });
    return phase === 'all' ? list : list.filter((m) => m.phase === phase);
  }

  function findMatch(season, id) {
    return matches(season).find((m) => m.id === id) || null;
  }

  /** Iterasi setiap game yang sudah dimainkan: cb(game, match). */
  function eachGame(season, phase, cb) {
    matches(season, phase).forEach((m) => m.games.forEach((g) => g.winner && cb(g, m)));
  }

  // ---------------------------------------------------------- Standings
  function standings(season) {
    return memo(season, 'standings', () => {
      const rows = {};
      const row = (t) =>
        (rows[t] = rows[t] || { team: t, w: 0, l: 0, gw: 0, gl: 0, played: 0, form: [], h2h: {} });
      const ordered = matches(season, 'regular')
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      Object.keys(season.rosters).forEach(row);
      ordered.forEach((m) => {
        if (!m.winner || !m.teams[0] || !m.teams[1]) return;
        m.teams.forEach((t, i) => {
          const r = row(t);
          const opp = m.teams[1 - i];
          const won = m.winner === i + 1;
          r.played++;
          r.gw += m.score[i];
          r.gl += m.score[1 - i];
          won ? r.w++ : r.l++;
          r.form.push(won ? 'W' : 'L');
          const h = (r.h2h[opp] = r.h2h[opp] || { w: 0, gw: 0, gl: 0 });
          if (won) h.w++;
          h.gw += m.score[i];
          h.gl += m.score[1 - i];
        });
      });
      const list = Object.values(rows);
      list.forEach((r) => {
        r.diff = r.gw - r.gl;
        r.points = r.w;
      });
      list.sort((a, b) => b.points - a.points || b.diff - a.diff);
      // Tiebreaker head-to-head untuk tim dengan poin & diff sama
      const out = [];
      for (let i = 0; i < list.length; ) {
        let j = i;
        while (j < list.length && list[j].points === list[i].points && list[j].diff === list[i].diff) j++;
        const group = list.slice(i, j);
        if (group.length > 1) {
          const ids = group.map((r) => r.team);
          const h2h = (r) =>
            ids.reduce(
              (acc, o) => {
                const h = r.h2h[o];
                if (h) {
                  acc.w += h.w;
                  acc.d += h.gw - h.gl;
                }
                return acc;
              },
              { w: 0, d: 0 }
            );
          group.sort((a, b) => {
            const ha = h2h(a), hb = h2h(b);
            return hb.w - ha.w || hb.d - ha.d || b.gw - a.gw || a.team.localeCompare(b.team);
          });
        }
        out.push(...group);
        i = j;
      }
      out.forEach((r, i) => (r.rank = i + 1));
      return out;
    });
  }

  function zone(rank) {
    if (rank <= 2) return 'up';
    if (rank <= 6) return 'play';
    return 'out';
  }

  // ---------------------------------------------------------- Playoffs
  const LOSER_PLACE = { R4M1: '2', R3M2: '3', R2M3: '4', R1M1: '5–6', R1M2: '5–6' };

  function placements(season) {
    return memo(season, 'placements', () => {
      const res = {};
      season.playoffs.matches.forEach((m) => {
        if (!m.winner) return;
        const loser = m.teams[2 - m.winner];
        if (LOSER_PLACE[m.slot] && loser) res[loser] = LOSER_PLACE[m.slot];
        if (m.slot === 'R4M1') res[m.teams[m.winner - 1]] = '1';
      });
      standings(season).forEach((r) => {
        if (r.rank > 6 && !res[r.team]) res[r.team] = String(r.rank);
      });
      return res;
    });
  }

  function prizeFor(season, place) {
    const p = (season.meta.basePrizes || []).find((x) => x.place.replace('-', '–') === place);
    return p ? p.prize : null;
  }

  function champion(season) {
    const gf = season.playoffs.matches.find((m) => m.slot === 'R4M1');
    return gf && gf.winner ? { team: gf.teams[gf.winner - 1], runnerUp: gf.teams[2 - gf.winner], match: gf } : null;
  }

  function status(season) {
    if (champion(season)) return 'done';
    return matches(season).some((m) => m.winner) ? 'live' : 'upcoming';
  }

  function nextMatch(season) {
    return (
      matches(season)
        .filter((m) => !m.winner)
        .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0] || null
    );
  }

  // ----------------------------------------------------------- Players
  function playerIndex(season) {
    return memo(season, 'players', () => {
      const idx = {};
      Object.entries(season.rosters).forEach(([t, r]) =>
        r.players.concat(r.staff).forEach((p) => {
          const rec = { name: p.id, team: t, link: p.link };
          [p.id, p.link].forEach((k) => {
            const key = String(k).toLowerCase().replace(/\s+/g, '');
            if (!idx[key] || p.status !== 'former') idx[key] = rec;
          });
        })
      );
      return idx;
    });
  }

  function resolvePlayer(season, name, teamsHint) {
    if (!name) return null;
    const rec = playerIndex(season)[name.toLowerCase().replace(/\s+/g, '')];
    if (rec && (!teamsHint || teamsHint.includes(rec.team))) return rec;
    return { name, team: null };
  }

  // -------------------------------------------------------------- Heroes
  function heroStats(season, phase = 'all') {
    return memo(season, 'heroes:' + phase, () => {
      const map = {};
      let games = 0;
      const get = (id) =>
        (map[id] = map[id] || { id, picks: 0, wins: 0, bans: 0, roles: [0, 0, 0, 0, 0], teams: {}, bannedBy: {} });
      eachGame(season, phase, (g, m) => {
        games++;
        [0, 1].forEach((t) => {
          const tid = m.teams[t];
          const won = g.winner === t + 1;
          g.picks[t].forEach((h, i) => {
            if (!h) return;
            const s = get(h);
            s.picks++;
            if (won) s.wins++;
            s.roles[i]++;
            const ts = (s.teams[tid] = s.teams[tid] || { picks: 0, wins: 0 });
            ts.picks++;
            if (won) ts.wins++;
          });
          g.bans[t].forEach((h) => {
            if (!h) return;
            const s = get(h);
            s.bans++;
            s.bannedBy[tid] = (s.bannedBy[tid] || 0) + 1;
          });
        });
      });
      const list = Object.values(map);
      list.forEach((s) => {
        s.presence = games ? (s.picks + s.bans) / games : 0;
        s.winRate = s.picks ? s.wins / s.picks : null;
        s.pickRate = games ? s.picks / games : 0;
        s.banRate = games ? s.bans / games : 0;
      });
      return { games, list, byId: map };
    });
  }

  function heroGames(season, heroId, phase = 'all') {
    const out = [];
    eachGame(season, phase, (g, m) => {
      [0, 1].forEach((t) => {
        const pi = g.picks[t].indexOf(heroId);
        if (pi >= 0) out.push({ match: m, game: g, team: m.teams[t], opp: m.teams[1 - t], role: pi, won: g.winner === t + 1, type: 'pick' });
        if (g.bans[t].includes(heroId)) out.push({ match: m, game: g, team: m.teams[t], opp: m.teams[1 - t], type: 'ban' });
      });
    });
    return out.sort((a, b) => (b.match.date || '').localeCompare(a.match.date || '') || b.game.n - a.game.n);
  }

  // --------------------------------------------------------------- Teams
  function teamStats(season, teamId, phase = 'all') {
    return memo(season, `team:${teamId}:${phase}`, () => {
      const pools = [{}, {}, {}, {}, {}];
      const bansBy = {};
      const bansAgainst = {};
      let games = 0, wins = 0, blue = 0, blueWins = 0, dur = 0, durN = 0;
      eachGame(season, phase, (g, m) => {
        const t = m.teams.indexOf(teamId);
        if (t < 0) return;
        games++;
        const won = g.winner === t + 1;
        if (won) wins++;
        if (g.sides[t] === 'blue') {
          blue++;
          if (won) blueWins++;
        }
        const s = toSec(g.length);
        if (s) {
          dur += s;
          durN++;
        }
        g.picks[t].forEach((h, i) => {
          if (!h) return;
          const p = (pools[i][h] = pools[i][h] || { id: h, picks: 0, wins: 0 });
          p.picks++;
          if (won) p.wins++;
        });
        g.bans[t].forEach((h) => h && (bansBy[h] = (bansBy[h] || 0) + 1));
        g.bans[1 - t].forEach((h) => h && (bansAgainst[h] = (bansAgainst[h] || 0) + 1));
      });
      const sortPool = (o) => Object.values(o).sort((a, b) => b.picks - a.picks || b.wins - a.wins);
      const topOf = (o) => Object.entries(o).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
      const all = {};
      pools.forEach((p) =>
        Object.values(p).forEach((x) => {
          const a = (all[x.id] = all[x.id] || { id: x.id, picks: 0, wins: 0 });
          a.picks += x.picks;
          a.wins += x.wins;
        })
      );
      return {
        games, wins,
        blue, blueWins,
        avgDuration: durN ? dur / durN : null,
        pools: pools.map(sortPool),
        heroes: sortPool(all),
        bansBy: topOf(bansBy),
        bansAgainst: topOf(bansAgainst),
      };
    });
  }

  function teamMatches(season, teamId) {
    return matches(season)
      .filter((m) => m.teams.includes(teamId))
      .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  }

  // -------------------------------------------------------------- Season
  function summary(season, phase = 'all') {
    return memo(season, 'summary:' + phase, () => {
      let games = 0, dur = 0, durN = 0, blue = 0, blueWins = 0;
      let longest = null, shortest = null;
      const picked = new Set();
      eachGame(season, phase, (g, m) => {
        games++;
        const s = toSec(g.length);
        if (s) {
          dur += s;
          durN++;
          if (!longest || s > longest.sec) longest = { sec: s, game: g, match: m };
          if (!shortest || s < shortest.sec) shortest = { sec: s, game: g, match: m };
        }
        const bi = g.sides.indexOf('blue');
        if (bi >= 0) {
          blue++;
          if (g.winner === bi + 1) blueWins++;
        }
        g.picks.flat().forEach((h) => h && picked.add(h));
      });
      const ms = matches(season, phase);
      return {
        matches: ms.filter((m) => m.winner).length,
        totalMatches: ms.length,
        games,
        avgDuration: durN ? dur / durN : null,
        longest, shortest,
        blueWinRate: blue ? blueWins / blue : null,
        uniqueHeroes: picked.size,
      };
    });
  }

  MPL.stats = { matches, findMatch, eachGame, standings, zone, placements, prizeFor, champion, status, nextMatch, resolvePlayer, heroStats, heroGames, teamStats, teamMatches, summary };
})();
