# Modul Kesihatan — Health Monitor & Medication Reminder

Modul peribadi yang simple untuk merekod bacaan kesihatan dan peringatan ubat.
**Bukan** sistem diagnosis penyakit.

## Struktur Menu

```
Kesihatan
├── Monitor   (/health/readings) — rekod & graf bacaan
├── Ubat      (/health/medications) — senarai ubat, reminder, tick
├── Reminder  (Ubat Hari Ini pada /health) — tick hari ini
└── History   (/health/history) — graf semua metrik
```

## Health Monitor

Metrik disokong: `weight` (kg), `height` (cm), `bp` (mmHg, systolic/diastolic),
`glucose` (mmol/L), `pulse` (BPM), `spo2` (%), `temperature` (°C).

- Setiap bacaan simpan `measured_at`, nilai, nota pilihan.
- **BMI** dikira automatik dari bacaan terbaru tinggi + berat.
- History/graf dengan julat `7d`, `30d`, `3m`, `1y`.

## Medication Reminder

- Setiap ubat ada nama, dos, timing (`before_meal`/`after_meal`/`anytime`),
  tarikh mula/tamat, nota, toggle reminder ON/OFF.
- Setiap waktu (schedule) boleh diaktifkan/matikan secara individu.
- **Dose log** harian auto-dicipta untuk waktu yang aktif.
- Status: `pending` (Belum Ambil), `taken` (Sudah Ambil), `skipped` (Skip),
  `missed` (⚠ Terlepas). `taken_at` disimpan bila user tick.

## Reminder Notification

Loop latar (setiap 30s) dalam API:
1. Bila waktu sampai dan dose masih `pending` → hantar reminder.
   - **Push** (FCM) sentiasa jika ada token.
   - **Telegram** dengan inline button `[✅ Sudah Ambil][⏰ Nanti][Skip]` jika
     akaun dipaut.
   - **WhatsApp** teks dengan arahan balas jika disambung.
2. Dose `pending` yang melepasi 180 minit tanpa diambil → auto `missed`.

## Tindakan Pengguna

- **Telegram callback**: `health:dose:{log_id}:{taken|later|skip}`
  - `taken` → status `taken`, simpan `taken_at`, edit mesej.
  - `skip` → status `skipped`.
  - `later` → `remind_later_at` = kini + 30 minit.
- **WhatsApp teks**: `ambil` / `taken` / `skip` / `nanti 30` — mengemas kini
  dose pending paling terbaru hari ini.
- **Web/PWA**: tick pada Ubat Hari Ini atau halaman Ubat.

Semua status sync melalui database antara Web/PWA, bot dan API.

## API Endpoints

Prefix: `/health`

| Method | Path | Penerangan |
|---|---|---|
| GET | `/readings?metric=&range=` | Senarai bacaan |
| POST | `/readings` | Tambah bacaan |
| PATCH | `/readings/{id}` | Kemas kini bacaan |
| DELETE | `/readings/{id}` | Padam bacaan |
| GET | `/dashboard` | Bacaan terkini per metrik + BMI |
| GET | `/history?metric=&range=` | Titik sejarah untuk graf |
| GET | `/medications` | Senarai ubat (dengan schedule + dose hari ini) |
| POST | `/medications` | Tambah ubat |
| GET | `/medications/today` | Senarai reminder hari ini |
| PATCH | `/medications/{id}` | Kemas kini ubat |
| DELETE | `/medications/{id}` | Padam ubat |
| POST | `/medications/{id}/toggle-reminder` | Toggle reminder |
| POST | `/medications/{id}/doses` | Tick dose (taken/skipped) |
| PATCH | `/schedules/{id}` | Toggle individu schedule |

## Table (auto-create)

- `health_readings`
- `medications`
- `medication_schedules`
- `medication_dose_logs` (termasuk `notified_at`, `remind_later_at`, `missed_at`)

**Nota deploy:** `medication_dose_logs` mendapat kolum baru selepas table pertama
dicipta — jalankan `ALTER TABLE medication_dose_logs ADD COLUMN IF NOT EXISTS
<col> TIMESTAMP` untuk `notified_at`, `remind_later_at`, `missed_at` pada
persekitaran sedia ada.
