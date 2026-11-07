# MPL ID Hub

Situs penggemar untuk **MPL Indonesia (Mobile Legends: Bang Bang Professional League Indonesia)**.
Isinya informasi regular season dan playoff, roster setiap tim (pemain, coach, analyst), serta hero yang dipick dan diban di setiap game.

Saat ini tersedia **Season 18** (Agustus–November 2026, playoff masih berjalan) dan **Season 17** (Maret–Juni 2026, juara Bigetron by Vitality).

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Info musim (jadwal, venue, total hadiah, patch), juara atau pertandingan berikutnya, ringkasan statistik, klasemen singkat, meta hero, dan daftar penghargaan. |
| **Regular Season** | Klasemen lengkap (match W–L, game W–L, selisih, poin, 5 hasil terakhir) dengan tiebreaker head-to-head, plus jadwal dan hasil per minggu. |
| **Playoff** | Bracket upper/lower, hasil akhir beserta hadiah, serta top pick/ban selama playoff. |
| **Tim** | Kartu 9 tim, lalu halaman detail per tim: 5 starter per posisi, cadangan, head coach, assistant coach, analyst, hero pool per posisi (bisa difilter Regular Season/Playoff), hero yang paling sering diban lawan, dan riwayat match. |
| **Hero** | Tabel pick, ban, presence, dan win rate. Bisa diurutkan, difilter per fase dan lane, serta dicari. Halaman detail hero berisi tim yang memakai, posisi, dan daftar game. |
| **Detail match** | Skor, MVP, caster, pergantian pemain, dan draft lengkap setiap game: 5 pick per tim sesuai posisi, 5 ban per tim, sisi blue/red, durasi, map, serta link VOD. |

Fitur lain: pilihan musim, tema terang/gelap, dan tampilan responsif untuk HP.

## Menjalankan

Situs ini statis (HTML, CSS, dan JavaScript tanpa framework dan tanpa build step).

- Cara cepat: buka `index.html` langsung di browser (klik dua kali file-nya). Tidak perlu internet kecuali untuk font.
- Atau jalankan server lokal:

```bash
python3 -m http.server 8000
```

Setelah itu buka <http://localhost:8000>.

Untuk dipublikasikan, folder ini bisa langsung di-deploy ke GitHub Pages, Netlify, atau Vercel.

## Memperbarui data

Data diambil dari wikitext [Liquipedia](https://liquipedia.net/mobilelegends/MPL/Indonesia) oleh script yang hanya memakai library standar Python:

```bash
python3 scripts/build_data.py --refresh
```

```bash
python3 scripts/build_data.py --seasons 16 17 18 --refresh
```

- Script menghasilkan `data/season-<N>.js`, `data/heroes.js`, `data/teams.js`, dan `data/index.js`. Musim baru otomatis muncul di pilihan musim.
- Halaman yang sudah diunduh disimpan di `.cache/liquipedia/` dan ada jeda 3 detik antar-request, sesuai batas rate Liquipedia.
- Kalau muncul tim atau alias hero baru, tambahkan ke `TEAM_ALIASES` atau `HERO_ALIASES` di `scripts/build_data.py`.

## Struktur

```
index.html            kerangka halaman + navigasi
assets/css/style.css  tampilan (tema terang & gelap)
assets/js/util.js     helper template HTML aman, format angka/tanggal, komponen kecil
assets/js/stats.js    perhitungan klasemen, statistik hero & tim
assets/js/views.js    semua halaman
assets/js/app.js      router (hash), pemuat data musim, tema
data/                 data hasil scripts/build_data.py
scripts/build_data.py pengambil & pengolah data Liquipedia
```

## Catatan data

- Urutan pick per game mengikuti posisi **EXP · Jungle · Mid · Gold · Roam** sesuai input draft di Liquipedia. Karena itu hero pool ditampilkan per posisi tim, bukan per pemain (game yang dimainkan pemain cadangan ikut masuk ke posisi yang sama).
- Analyst hanya tampil jika tercantum di Liquipedia. Beberapa tim tidak mencantumkannya.
- Lane hero memakai posisi utama hero menurut Liquipedia.
- Logo tim dan gambar hero sengaja tidak dipakai. Situs ini memakai badge warna dan inisial.

## Lisensi & kredit

Data turnamen dari [Liquipedia](https://liquipedia.net/mobilelegends) di bawah lisensi [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
Ini proyek penggemar dan tidak berafiliasi dengan Moonton, MPL Indonesia, maupun tim yang ditampilkan.
