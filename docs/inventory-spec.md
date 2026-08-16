# MyPeribadi — Complete Personal Inventory Implementation Specification

Arahan kepada coding agent

Implementasikan modul baharu **Barang Saya** (Personal Inventory) secara penuh dalam codebase MyPeribadi. Modul ini mesti tersedia melalui:

- Web/PWA MyPeribadi
- WhatsApp Bot
- Telegram Bot
- Web Chat MyPeribadi

Jangan hasilkan mockup sahaja. Implementasikan database migration, domain/service layer, API atau server actions, UI sebenar, integrasi bot, validation, authorization, tests dan documentation.

Sebelum menulis code:

- Analisis struktur keseluruhan repository.
- Kenal pasti frontend, backend, database, ORM, authentication, media storage, bot handlers dan convention sedia ada.
- Cari modul paling hampir seperti Transaction, Warranty, Subscription dan Loan.
- Ikut architecture, naming, design system, error handling dan timezone convention project.
- Tulis implementation plan ringkas serta senarai fail yang dijangka berubah.
- Jangan ubah behaviour atau memecahkan compatibility fungsi sedia ada.
- Gunakan migration; jangan edit production database secara manual.
- Jangan mereka framework baharu jika project sudah mempunyai pattern yang sesuai.

---

## 1. Objektif produk

Modul ini membantu pengguna menjawab soalan seperti:

- "Aku pernah beli barang ini ke?"
- "Barang itu aku simpan di mana?"
- "Dalam kotak atau rak mana?"
- "Berapa unit masih ada?"
- "Barang itu ada, dipinjam, hilang, rosak atau sudah dibuang?"

Model utama:

```text
Barang → Lokasi bertingkat → Bekas/Kotak
```

Contoh:

```text
Kabel HDMI
Kuantiti: 2 unit
Lokasi: Rumah → Stor → Rak 2 → Kotak Elektronik A
Status: Ada
```

Barang juga boleh dikaitkan dengan transaksi pembelian dan warranty sedia ada.

---

## 2. Skop versi pertama

Implementasikan:

- Dashboard Barang Saya.
- Create, read, update dan soft delete barang.
- Gambar barang.
- Lokasi penyimpanan bertingkat.
- Bekas/kotak dalam sesuatu lokasi.
- Carian, filter, sorting dan pagination.
- Kuantiti, unit dan status barang.
- Sejarah perpindahan dan perubahan kuantiti/status.
- Hubungan optional kepada Transaction dan Warranty.
- Paparan kandungan sesuatu lokasi atau kotak.
- Shared inventory command service.
- Integrasi WhatsApp, Telegram dan Web Chat.
- Confirmation flow bagi operasi berisiko.
- Audit log dan idempotency webhook.

Belum perlu untuk versi pertama:

- QR scanner dan cetakan label
- Barcode produk
- OCR resit automatik
- AI vision mengenal pasti barang
- Shared household inventory
- Import bulk
- Reminder barang
- Sistem contact bagi barang dipinjam

Sediakan `container.code` untuk QR pada masa akan datang, tetapi jangan bina QR sekarang.

---

## 3. Architecture wajib

Semua channel mesti menggunakan business logic yang sama:

```text
Web/PWA ─────────┐
WhatsApp Bot ────┤
Telegram Bot ────┼── Inventory Application Service ── Repository/Database
Web Chat ────────┘                 │
                                   ├── Authorization
                                   ├── Validation
                                   ├── Search
                                   ├── Movement/Audit
                                   └── Transaction/Warranty linking
```

Jangan duplicate logic CRUD atau validation di setiap bot handler. Channel adapter hanya perlu:

1. Kenal pasti pengguna/channel.
2. Normalize mesej atau UI request.
3. Panggil shared service/command handler.
4. Format keputusan mengikut channel.

AI/NLU hanya boleh mengenal pasti intent dan entity. AI tidak boleh menjalankan query database atau tool sensitif secara bebas. Backend mesti resolve record sebenar, validate, semak ownership dan menjalankan operasi.

---

## 4. Data model

Sesuaikan nama table, casing, foreign key, timestamp dan soft-delete pattern dengan codebase.

### 4.1 `inventory_items`

```text
id                  UUID primary key
user_id             UUID/index/not null
name                string/not null
description         text/null
category            string/null
quantity            decimal or integer/not null/default 1
unit                string/not null/default "unit"
status              enum or string/not null/default "available"
brand               string/null
model               string/null
serial_number       string/null
purchase_date       date/null
purchase_price      decimal/null
image_url/media_id  nullable, ikut media system sedia ada
location_id         UUID/null/index
container_id        UUID/null/index
transaction_id      UUID/null/index
warranty_id         UUID/null/index
notes               text/null
created_at
updated_at
deleted_at          nullable jika project menggunakan soft delete
```

Peraturan:

- UUID mesti dijana oleh standard generator project/server.
- `name` wajib dan mesti dibersihkan daripada whitespace berlebihan.
- `quantity >= 0`; default 1.
- `purchase_price >= 0` jika diberikan.
- Semua relation mesti dimiliki oleh user yang sama.
- Container optional.
- Jika container dipilih, location item mesti konsisten dengan location container.
- Jangan percaya `user_id` daripada client.

### 4.2 `inventory_locations`

```text
id
user_id
name
description
parent_id       nullable self-reference
icon            nullable
color           nullable
created_at
updated_at
deleted_at
```

Contoh hierarchy:

```text
Rumah
└── Stor
    └── Rak 2
```

Keperluan:

- Cegah circular hierarchy.
- Cegah location menjadi parent kepada dirinya sendiri.
- Tetapkan had kedalaman munasabah atau gunakan cycle-safe traversal.
- Nama yang sama boleh wujud di bawah parent berbeza.
- Full path mesti dihasilkan secara selamat dan konsisten.

### 4.3 `inventory_containers`

```text
id
user_id
name
description
location_id
code             unique per user, disediakan untuk QR masa hadapan
image_url/media_id
created_at
updated_at
deleted_at
```

### 4.4 `inventory_movements`

```text
id
user_id
inventory_item_id
movement_type       created | moved | quantity_changed | status_changed
from_location_id
from_container_id
to_location_id
to_container_id
quantity_before
quantity_after
status_before
status_after
notes
source_channel      web | whatsapp | telegram | web_chat | system
moved_at
created_at
```

Rekod sejarah mesti immutable dalam operasi aplikasi biasa.

### 4.5 Conversation state

Guna state mechanism sedia ada. Jika belum ada, tambah struktur setara:

```text
id
channel
channel_user_id
user_id
active_intent
pending_action
draft_data JSON
candidate_ids JSON
confirmation_token_hash
expires_at
created_at
updated_at
```

State mesti terikat kepada user dan channel, mempunyai expiry, dikosongkan selepas selesai, dan boleh dibatalkan dengan `batal`, `cancel` atau `0`.

### 4.6 Idempotency/event processing

Guna mekanisme webhook event sedia ada atau tambah rekod yang menyimpan:

```text
provider
external_event_id
user_id
status
result_reference
processed_at
```

Pastikan unique constraint bagi `(provider, external_event_id)` agar retry tidak menggandakan item atau movement.

---

## 5. Status barang

Gunakan constant/enum:

| Internal | Label BM |
|---|---|
| `available` | Ada |
| `loaned` | Dipinjam |
| `missing` | Hilang |
| `damaged` | Rosak |
| `disposed` | Dibuang |
| `used_up` | Sudah Habis |

Menukar status tidak memadam rekod. `disposed` dan `used_up` memerlukan confirmation melalui bot dan confirmation UI yang jelas di web.

---

## 6. Application service

Sediakan satu service/domain layer dengan operasi setara:

```text
createItem(actor, input)
getItem(actor, itemId)
updateItem(actor, itemId, input)
deleteItem(actor, itemId)
searchItems(actor, query, filters, pagination)
moveItem(actor, itemId, destination)
changeQuantity(actor, itemId, operation)
changeStatus(actor, itemId, status)
listLocationContents(actor, locationId)
listContainerContents(actor, containerId)
createLocation(actor, input)
updateLocation(actor, id, input)
deleteLocation(actor, id)
createContainer(actor, input)
updateContainer(actor, id, input)
deleteContainer(actor, id)
linkTransaction(actor, itemId, transactionId)
linkWarranty(actor, itemId, warrantyId)
getSummary(actor)
```

Semua operasi mesti menerima authenticated actor daripada server context, bukan `user_id` bebas daripada frontend.

Gunakan transaction database untuk operasi yang mengemas kini item bersama movement/audit record.

---

## 7. API atau server actions

Ikut architecture sedia ada. Jika REST digunakan, sediakan endpoint setara:

```text
GET    /api/inventory/items
POST   /api/inventory/items
GET    /api/inventory/items/:id
PATCH  /api/inventory/items/:id
DELETE /api/inventory/items/:id

POST   /api/inventory/items/:id/move
POST   /api/inventory/items/:id/quantity
POST   /api/inventory/items/:id/status
GET    /api/inventory/items/:id/movements

GET    /api/inventory/locations
POST   /api/inventory/locations
PATCH  /api/inventory/locations/:id
DELETE /api/inventory/locations/:id
GET    /api/inventory/locations/:id/items

GET    /api/inventory/containers
POST   /api/inventory/containers
PATCH  /api/inventory/containers/:id
DELETE /api/inventory/containers/:id
GET    /api/inventory/containers/:id/items

GET    /api/inventory/summary
```

Jika project menggunakan server actions/RPC, gunakan pattern itu. Semua input mesti menggunakan schema validation sedia ada. Semua list perlu pagination dan ownership filtering.

---

## 8. Web/PWA UI

Tambah navigation item Barang Saya dan route mengikut convention project.

### Dashboard

Paparkan:

- Jumlah jenis barang
- Jumlah keseluruhan unit
- Ada
- Dipinjam
- Hilang
- Rosak
- Tanpa lokasi
- Search bar
- Barang terkini
- Lokasi utama
- Butang `Tambah Barang`

Bezakan jenis item dan jumlah unit. Contoh: 15 jenis, 28 unit.

### Senarai barang

Setiap card/row:

- Thumbnail/placeholder
- Nama
- Kuantiti dan unit
- Kategori
- Status
- Full location path
- Updated time

Sediakan grid/list jika design system sesuai. Search meliputi nama, description, category, brand, model, serial number, notes, location dan container.

Filter:

- Status
- Kategori
- Lokasi
- Container
- Ada/tiada gambar
- Ada/tiada transaksi
- Ada/tiada warranty
- Tanpa lokasi

Sorting:

- Terbaru ditambah
- Terbaru dikemas kini
- Nama A–Z
- Kuantiti tertinggi
- Tarikh pembelian terbaru

### Borang tambah/edit

Field:

```text
Nama barang *
Gambar
Kategori
Kuantiti *
Unit
Status
Brand
Model
Serial number
Tarikh pembelian
Harga pembelian
Lokasi
Bekas/Kotak
Transaksi berkaitan
Warranty berkaitan
Keterangan
Nota
```

Nama dan kuantiti sahaja wajib. Default kuantiti 1 dan status Ada. Container ditapis mengikut location. Memilih container boleh menetapkan location secara automatik. Pengguna boleh mencipta location/container melalui inline modal tanpa meninggalkan borang.

### Halaman butiran

Paparkan semua metadata, gambar, full location path, transaction, warranty dan movement history. Action:

```text
Edit
Pindahkan
Ubah status
Tambah/kurangkan kuantiti
Padam
```

### Pengurusan lokasi dan kotak

Paparkan hierarchy lokasi sebagai tree/list yang mobile-friendly. Pada setiap lokasi/container, paparkan jumlah jenis dan jumlah unit.

Jangan benarkan location dipadam jika mempunyai child location, container atau item. Jangan benarkan container dipadam jika masih mengandungi item. Minta pengguna memindahkan kandungan terlebih dahulu.

### Empty states

```text
Belum ada barang direkodkan

Simpan barang anda di sini supaya mudah dicari apabila diperlukan.

[Tambah Barang Pertama]
```

```text
Barang tidak dijumpai

Cuba nama, kategori, lokasi atau kotak yang lain.
```

### Responsive dan accessibility

- Sesuai untuk Android/PWA/desktop.
- Filter mobile melalui bottom sheet/drawer jika sesuai.
- Touch target mencukupi.
- Keyboard navigation, focus state dan label form jelas.
- Ikut dark/light theme serta design system MyPeribadi.
- Jangan hardcode warna yang bercanggah dengan theme tokens.

---

## 9. Perpindahan dan partial quantity

Flow pindah:

1. Paparkan lokasi/container semasa.
2. Pilih destination location.
3. Pilih destination container optional.
4. Pilih kuantiti.
5. Nota optional.
6. Simpan secara atomic bersama movement record.

Jika semua kuantiti dipindahkan, kemas kini item asal. Jika hanya sebahagian dipindahkan, jangan simpan dua lokasi pada satu row. Gunakan salah satu:

- Pecahkan kepada item row baharu dengan metadata/link yang sama; atau
- Gunakan stock-location model jika project memang mempunyai pattern tersebut.

Pilih pendekatan paling selamat, document keputusan dan tambah test jumlah kuantiti kekal konsisten.

---

## 10. Integrasi Transaction dan Warranty

Pada transaksi yang sesuai, tambah action optional `Tambah ke Barang Saya`.

Prefill:

- Nama transaksi → nama barang
- Amount → harga pembelian
- Tarikh transaksi → tarikh pembelian
- `transaction_id` → relation
- Kuantiti default 1

Pengguna perlu mengesahkan sebelum item dicipta. Jangan auto-convert semua transaksi. Jangan tawarkan secara default bagi makanan, bil, petrol, subscription atau loan kecuali pengguna meminta.

Warranty dipautkan menggunakan relation ID; jangan duplicate rekod warranty. Paparkan ringkasan dan link ke butiran Warranty.

---

## 11. Media

Gunakan media/storage service sedia ada:

- Validate MIME berdasarkan kandungan, bukan filename sahaja.
- Hadkan jenis dan saiz fail.
- Nama/path fail unik dan selamat.
- Jangan dedahkan internal filesystem path.
- Preview sebelum simpan di web.
- Ikut lifecycle/cleanup media project.
- Gunakan thumbnail bagi listing jika disokong.

WhatsApp/Telegram boleh menerima gambar dengan caption `tambah barang kabel HDMI 2`. Jika caption tiada, tanya nama barang dan simpan reference media sementara dengan expiry sehingga flow selesai.

---

## 12. Shared bot command service

Sokong intent:

```text
inventory_help
inventory_create_item
inventory_search_item
inventory_get_item
inventory_find_location
inventory_list_location
inventory_list_container
inventory_move_item
inventory_update_quantity
inventory_update_status
inventory_delete_item
inventory_summary
inventory_link_transaction
inventory_confirm
inventory_cancel
```

Structured extraction contoh:

```json
{
  "intent": "inventory_create_item",
  "intent_label": "tambah barang",
  "entities": {
    "item_name": "Kabel HDMI",
    "quantity": 2,
    "unit": "unit",
    "location_name": null,
    "container_name": "Kotak Elektronik A"
  },
  "requires_confirmation": false
}
```

Confidence handling:

- Tinggi + operasi selamat: boleh teruskan.
- Sederhana: minta clarification/confirmation.
- Rendah: jangan jalankan mutation.
- Fuzzy match lemah tidak boleh digunakan untuk edit/move/delete.

Jika terdapat beberapa candidate, tunjuk pilihan bernombor dan simpan candidate IDs dalam conversation state.

---

## 13. Arahan bahasa biasa

### Bantuan

Input: `barang`, `barang help`, `inventory`, `inventory help`

```text
📦 Barang Saya

Anda boleh cuba:
• tambah barang kabel HDMI 2
• cari kabel HDMI
• kabel HDMI dekat mana
• barang dalam Kotak Elektronik A
• pindah kabel HDMI ke Kotak Elektronik B
• kabel HDMI rosak
• ringkasan barang
```

### Tambah

Sokong:

```text
tambah barang kabel HDMI
tambah barang kabel HDMI 2
barang baru charger laptop
simpan 3 bateri AA
aku beli mouse Logitech
tambah barang kabel HDMI 2 dalam Kotak Elektronik A
```

Nama wajib; kuantiti default 1. Lokasi tidak wajib.

### Cari dan tanya lokasi

```text
cari kabel
aku ada charger laptop tak?
pernah beli mouse Logitech tak?
ada bateri AA lagi?
kabel HDMI dekat mana?
mana aku letak charger?
```

Jika satu hasil:

```text
📍 Kabel HDMI berada di:
Rumah → Stor → Rak 2 → Kotak Elektronik A

Kuantiti: 2 unit
Status: Ada
```

Jika banyak hasil, senaraikan pilihan bernombor. Jika tiada lokasi, nyatakan dengan jelas. Jika tidak jumpa, tawarkan untuk tambah tetapi hanya jalankan selepas confirmation dalam context aktif.

### Kandungan lokasi/kotak

```text
apa ada dalam Kotak Elektronik A?
senarai barang dalam stor
barang dekat pejabat
```

Respons contoh:

```text
📦 Kotak Elektronik A
Lokasi: Rumah → Stor → Rak 2

1. Kabel HDMI — 2 unit
2. Charger USB-C — 1 unit
3. Adapter HDMI — 1 unit

Jumlah: 3 jenis barang · 4 unit
```

Gunakan pagination dan arahan `seterusnya` apabila panjang.

### Pindah

```text
letak kabel HDMI dalam Kotak Elektronik A
pindah kabel HDMI ke Laci Meja
charger sekarang dekat pejabat
```

Destination yang tidak wujud mesti memerlukan confirmation sebelum location/container dicipta. Setiap perubahan menghasilkan movement record.

### Kuantiti

Bezakan:

```text
tambah bateri AA 4       → increment 4
bateri AA tinggal 2     → set kepada 2
guna satu bateri AA     → decrement 1
```

Jangan benarkan negatif. Apabila menjadi 0, tanya sama ada mahu set `Sudah Habis`.

### Status

```text
kabel HDMI rosak
charger hilang
drill dipinjam
bateri AA dah habis
mouse dah buang
```

`disposed` dan `used_up` memerlukan confirmation.

### Padam

```text
padam barang kabel HDMI
```

Mesti menunjukkan item tepat dan meminta confirmation. Confirmation token terikat kepada user, channel, action dan item ID; mempunyai expiry; single-use; disimpan dalam bentuk hash jika sesuai.

### Ringkasan

```text
ringkasan barang
berapa barang aku ada?
```

```text
📦 Ringkasan Barang Saya

Jenis barang: 42
Jumlah unit: 86
Ada: 35
Dipinjam: 2
Hilang: 1
Rosak: 3
Tanpa lokasi: 5
```

---

## 14. WhatsApp Bot

- Gunakan account linking dan verified phone mapping sedia ada.
- Proses webhook secara idempotent menggunakan provider message ID.
- Sokong teks, gambar+caption, confirmation dan pagination.
- Jangan gunakan table Markdown.
- Jangan paparkan UUID.
- Jangan hantar mesej kejayaan sebelum commit database berjaya.
- Hormati had panjang dan format WhatsApp.

Selepas transaksi pembelian berjaya, bot boleh menawarkan:

```text
✅ Transaksi direkodkan

Kabel HDMI
RM25.00
Wallet: TNG

Mahu tambah pembelian ini ke Barang Saya?
1. Ya, tambah barang
2. Tidak
```

Hanya tawarkan apabila classification transaksi cukup yakin sebagai pembelian barang.

---

## 15. Telegram Bot

- Gunakan linked Telegram account sedia ada.
- Gunakan Telegram update/message ID untuk idempotency.
- Sokong text, photo+caption dan callback buttons jika pattern sedia ada menyokongnya.
- Callback data tidak boleh mempercayai user/item ID tanpa server-side ownership check.
- Flow dan hasil mesti sama dengan WhatsApp walaupun formatting channel berbeat.

---

## 16. Web Chat

- Gunakan authenticated web session.
- Sokong natural language yang sama dan quick actions:

```text
Cari barang
Tambah barang
Barang tanpa lokasi
Lihat lokasi
Ringkasan barang
```

- Web Chat boleh memaparkan rich card:

```text
[Kabel HDMI]
2 unit · Ada
Rumah → Stor → Rak 2 → Kotak Elektronik A
[Lihat Barang] [Pindahkan]
```

- Sediakan text fallback. Link mesti menggunakan route/config project, bukan production domain yang di-hardcode.

---

## 17. Authentication dan authorization

- WhatsApp: verified linked phone identity.
- Telegram: linked Telegram identity.
- Web/PWA/Web Chat: authenticated session.
- Akaun belum link tidak boleh mengakses inventory.
- Ambil user ID daripada trusted server identity.
- Setiap item, location, container, transaction, warranty dan media mesti disahkan ownership.
- Elakkan IDOR pada semua endpoint/actions/callbacks.
- Gunakan parameterized query/ORM.
- Jangan bocorkan kewujudan record milik orang lain melalui error message.

Respons akaun belum link:

```text
Akaun ini belum disambungkan dengan MyPeribadi.
Sila pautkan akaun anda terlebih dahulu sebelum menggunakan Barang Saya.
```

---

## 18. Error, ambiguity dan cancellation

Fallback:

```text
Saya tidak pasti arahan tersebut.

Untuk Barang Saya, anda boleh cuba:
• cari kabel HDMI
• tambah barang charger laptop
• kabel HDMI dekat mana
• barang dalam Kotak Elektronik A
```

Service failure:

```text
Maaf, Barang Saya tidak dapat diakses buat masa ini. Tiada perubahan dilakukan. Cuba lagi sebentar.
```

Semua multi-step flow boleh dibatalkan dengan `batal`, `cancel` atau `0`.

---

## 19. Masa dan format

Ikut timestamp convention project. Semua masa yang dipaparkan kepada pengguna mesti menggunakan timezone `Asia/Kuala_Lumpur`. Gunakan format wang Malaysia dan `RM`. Jangan paparkan internal ID, raw error atau stack trace.

---

## 20. Audit dan observability

Log minimum tanpa data sensitif berlebihan:

- Channel
- Intent
- Safe internal actor reference
- Provider request/message ID
- Success/failure dan error category
- Latency

Audit mutation:

- Create/delete item
- Quantity change
- Movement
- Status change
- Transaction/warranty link

Jangan log token, media URL bertandatangan, session data atau mesej kewangan penuh jika tidak diperlukan.

---

## 21. Migration dan backward compatibility

- Semua migration additive dan selamat.
- Jangan rename/drop table atau column lama.
- Relation baharu nullable.
- Sediakan indexes untuk `user_id`, status, location, container, timestamps dan search yang sesuai.
- Tambah foreign key/delete behaviour secara sengaja.
- Jangan cascade-delete transaksi atau warranty apabila inventory item dipadam.
- Sediakan rollback jika migration framework menyokongnya.
- Pastikan data lama serta bot command lama terus berfungsi.

---

## 22. Tests wajib

### Domain/API

- Create, read, update dan soft delete item.
- Quantity tidak boleh negatif.
- Pengguna tidak boleh membaca/mengubah record pengguna lain.
- Relation silang user ditolak.
- Search, filter, sort dan pagination berfungsi.
- Full location path betul dan cycle ditolak.
- Location/container yang digunakan tidak boleh dipadam.
- Move menghasilkan immutable history.
- Partial move mengekalkan jumlah kuantiti.
- Transaction/warranty linking berfungsi tanpa mengubah rekod asal.
- Semua mutation atomic ketika movement/audit gagal.

### Bot/channel

- WhatsApp boleh tambah/cari/pindah barang.
- Telegram boleh tambah/cari/pindah barang.
- Web Chat boleh melakukan flow yang sama.
- Duplicate webhook tidak menghasilkan duplicate item/movement.
- Ambiguous match meminta pilihan.
- Confirmation wajib untuk delete/disposed/used_up.
- Expired/reused confirmation ditolak.
- `batal`, `cancel` dan `0` membersihkan flow.
- State tidak bercampur antara user atau channel.
- Database failure tidak menghasilkan success response.
- Gambar+caption boleh mencipta item secara selamat.
- Item tanpa caption memulakan clarification flow.
- Transaction suggestion memerlukan opt-in.
- Callback/button Telegram dan Web Chat membuat ownership check.

### UI

- Dashboard dan empty state render dengan betul.
- Add/edit form validation dan duplicate-submit protection.
- Mobile layout, dark mode dan light mode.
- Keyboard/focus accessibility asas.
- Link Transaction/Warranty serta movement history boleh dibuka.
- Jalankan test suite, lint, formatter check, type-check dan production build yang relevan.

---

## 23. Acceptance criteria

Implementasi dianggap lengkap apabila:

1. Menu dan dashboard Barang Saya tersedia.
2. Pengguna boleh tambah item dengan nama sahaja; kuantiti default 1.
3. Pengguna boleh menetapkan hierarchy lokasi dan kotak.
4. Carian segera menunjukkan sama ada barang wujud dan lokasi tepatnya.
5. Isi lokasi/kotak boleh disenaraikan.
6. Quantity, status, movement dan soft delete berfungsi dengan acaudit history.
7. Transaction dan Warranty boleh dipautkan secara optional.
8. WhatsApp, Telegram dan Web Chat menggunakan shared service yang sama.
9. Natural language, numbered selection, pagination, cancellation dan confirmation berfungsi.
10. Duplicate webhook selamat.
11. Data isolation diuji dan tiada IDOR.
12. UI responsive serta konsisten dengan MyPeribadi.
13. Migration, lint, type-check, tests dan production build berjaya.
14. Tiada regression pada Transaction, Warranty, Subscription, Loan atau bot commands lama.

---

## 24. Urutan implementasi

### Fasa 1 — Foundation

- Migration/schema
- Repository/domain/application service
- Validation, authorization dan tests

### Fasa 2 — Web/PWA

- Dashboard/list/detail
- Forms
- Location/container management
- Search/filter/movement
- Transaction/Warranty integration

### Fasa 3 — Shared conversational layer

- Intent/entity schema
- Command dispatcher
- Conversation state
- Candidate resolution
- Confirmation/idempotency

### Fasa 4 — Web Chat

- Text flow
- Quick actions/rich cards
- Responsive verification

### Fasa 5 — Telegram

- Text/photo/callback integration
- Webhook idempotency
- Channel tests

### Fasa 6 — WhatsApp

- Text/photo integration
- Transaction suggestion
- Webhook idempotency
- Channel tests

### Fasa 7 — Verification

- Security review
- Regression tests
- Lint/type-check/build
- Manual mobile/PWA flow verification

Jangan mula ketiga-tiga channel dengan logic berasingan. Siapkan dan uji core inventory serta shared command service dahulu.

---

## 25. Hasil akhir yang coding agent mesti berikan

Selepas implementasi selesai, laporkan:

1. Ringkasan implementation sebenar.
2. Architecture dan keputusan teknikal penting.
3. Senarai fail ditambah/diubah.
4. Migration/schema dan cara menjalankannya.
5. Endpoint/server actions serta intent baharu.
6. Environment/config baharu jika ada, tanpa mendedahkan secret.
7. Tests, lint, type-check dan build yang dijalankan bersama keputusan.
8. Screenshot/preview UI jika persekitaran menyokongnya.
9. Known limitations.
10. Langkah deployment dan rollback yang selamat.
11. Cadangan fasa seterusnya untuk QR, OCR dan shared household inventory.

Jika terdapat ambiguity architecture selepas pemeriksaan repository, jangan membuat perubahan besar secara andaian. Nyatakan pilihan serta trade-off dan minta keputusan hanya untuk perkara yang benar-benar mengubah schema atau behaviour produk.
