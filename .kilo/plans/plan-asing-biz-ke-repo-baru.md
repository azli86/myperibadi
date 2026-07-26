# Plan asingkan `biz` ke repo/folder baru

## Tujuan
Pisahkan domain `biz` daripada repo semasa `E:/Project/budgetsw`.

Target:
- semua backend/API `biz` pindah ke `E:/Project/biz`
- semua worker `biz` pindah ke `E:/Project/biz`
- app personal buang feature/route `biz`
- tinggal personal-only dalam `budgetsw`

## Cadangan ringkas
Jangan pindah ikut fail satu-satu dulu.
Pisah ikut app boundary:
1. clone/copy backend + worker ke repo baru
2. hidupkan `biz` sebagai app sendiri
3. alih web route `biz`
4. selepas stable, delete `biz` dari personal

## Scope semasa ditemui

### Backend/API bercampur personal + biz
Path utama:
- `apps/api/main.py`
- `apps/api/modules/biz_dashboard/`
- `apps/api/modules/biz_orders/`
- `apps/api/modules/biz_webhooks_entry/`

Nota:
- `apps/api/main.py` sangat besar, campur import personal + biz
- pemisahan pertama patut keluarkan route `biz` dari monolith ini

### Worker berkaitan biz
- `apps/cloudflare-worker/`
- `apps/worker/`

### Web route biz
- `apps/web/src/app/[sessionId]/biz/`
- `apps/web/src/app/public/biz/`
- kemungkinan shared UI dalam:
  - `apps/web/src/components/`
  - `apps/web/src/app/masterpop/` jika reuse

## Struktur target dicadang

### Repo/folder baru
`E:/Project/biz`

Cadangan minimum:
- `E:/Project/biz/apps/api/`
- `E:/Project/biz/apps/cloudflare-worker/`
- `E:/Project/biz/apps/worker/`
- `E:/Project/biz/apps/web/` untuk route/UI biz sahaja

Jika mahu lagi cepat:
- copy `apps/web` penuh dulu
- delete page personal kemudian
- selepas stable baru kemas shared component

`ponytail:` cepat dulu, cantik kemudian. Ceiling: duplicate code sementara. Upgrade path: extract shared package lepas split stabil.

## Pelan fasa

### Fasa 1 — Audit dependency silang
Checklist:
- cari semua import `biz` dalam `apps/api/main.py`
- cari semua route `/biz`
- cari semua panggilan web ke API biz
- cari worker env var, secret, webhook URL
- kenal pasti model DB yang dikongsi personal + biz

Output perlu ada:
- senarai fail yang wajib pindah
- senarai fail shared yang masih coupling
- senarai env var/domain/secret

### Fasa 2 — Boot repo `E:/Project/biz`
Minimum:
- init git repo baru atau subtree copy
- copy:
  - `apps/api`
  - `apps/cloudflare-worker`
  - `apps/worker`
  - `apps/web`
- buang page personal dari salinan `biz`
- set README + env example

Kenapa copy dulu:
- paling laju
- kurang risiko refactor besar awal
- boleh hidupkan localhost cepat

### Fasa 3 — Pisah backend/API
Sasaran:
- `E:/Project/biz/apps/api` hanya expose route biz
- `E:/Project/budgetsw/apps/api` buang route biz

Kerja minimum:
1. dalam repo baru, trim `apps/api/main.py` supaya tinggal route/dep `biz`
2. jika ada module personal dipakai oleh biz, copy dulu ke repo baru
3. verify startup API biz tanpa module personal
4. dalam repo personal, remove import/route `biz`

Risiko utama:
- model DB shared
- helper auth/email/storage shared
- webhook entry gabung logic personal + biz

### Fasa 4 — Pisah worker
Sasaran:
- `apps/cloudflare-worker` deploy dari repo `biz`
- `apps/worker` deploy dari repo `biz`

Checklist:
- update path build/deploy
- update secret/vars
- update callback URL ke domain/API biz baru
- test webhook Telegram/WhatsApp/CF worker

### Fasa 5 — Pisah web
Sasaran repo baru:
- kekalkan:
  - `apps/web/src/app/[sessionId]/biz/`
  - `apps/web/src/app/public/biz/`
  - shared component yang route ini perlukan
- buang page personal

Sasaran repo personal:
- delete:
  - `apps/web/src/app/[sessionId]/biz/`
  - `apps/web/src/app/public/biz/`
- buang nav/link/menu ke biz
- buang API client/payload type khusus biz jika tiada guna lain

### Fasa 6 — DB dan domain
Tentukan awal:

#### Opsi A — Kongsi DB dulu
Paling cepat.
- repo personal + biz guna DB sama
- split app sahaja

Pros:
- laju
- kurang migration

Cons:
- coupling masih ada di data layer

#### Opsi B — DB berasingan
Lebih bersih.
- perlukan migration data biz keluar
- perlukan boundary table jelas

Cadangan:
Mulakan dengan Opsi A. Jangan migrasi DB sekali jika objektif sekarang hanya asingkan codebase/localhost.

### Fasa 7 — Delete dari personal
Bila repo `biz` dah boot stable:
- delete module biz dalam `budgetsw`
- delete worker biz dalam `budgetsw`
- delete route web biz dalam `budgetsw`
- buang env var tak dipakai
- buang script deploy biz

## Senarai delete target dalam repo personal
Minimum candidate:
- `apps/cloudflare-worker/`
- `apps/worker/`
- `apps/web/src/app/[sessionId]/biz/`
- `apps/web/src/app/public/biz/`
- `apps/api/modules/biz_dashboard/`
- `apps/api/modules/biz_orders/`
- `apps/api/modules/biz_webhooks_entry/`
- import/route biz dalam `apps/api/main.py`

Jangan delete terus sebelum:
- repo `biz` boleh run
- webhook test pass
- route web biz boleh buka

## Urutan kerja dicadang
1. create `E:/Project/biz` dari copy semasa
2. hidupkan API biz sahaja
3. hidupkan worker biz
4. hidupkan web biz
5. test end-to-end
6. baru prune dari `budgetsw`

## Localhost plan

### `budgetsw` selepas split
- personal web only
- personal API only
- tiada `/biz`

### `biz` selepas split
- biz web only
- biz API only
- biz worker only

Contoh target localhost:
- personal web: `http://localhost:3000`
- personal API: `http://localhost:8000`
- biz web: `http://localhost:3001`
- biz API: `http://localhost:8001`

## Risiko
- `apps/api/main.py` monolith besar, split boleh pecah import chain
- shared models/database belum jelas boundary
- web shared component mungkin banyak tersembunyi
- worker webhook URL/secret mudah tertinggal

## Keputusan disaran
- Ya, asingkan ikut repo/folder baru `E:/Project/biz`
- Tidak, jangan terus refactor cantik dulu
- Mula dengan copy + trim
- DB kekal sama dulu kecuali memang mahu migrasi data sekali

## Deliverable seterusnya
Jika teruskan, step praktikal seterusnya:
1. hasilkan senarai fail exact untuk dipindah
2. map import silang `biz`/personal
3. sediakan script split/manual checklist
4. kemudian baru buat pemindahan sebenar
