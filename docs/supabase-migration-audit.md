# AUDIT PENGGUNAAN DATABASE — MyPeribadi (READ-ONLY)

Sumber: PostgreSQL 16.14, `budgetdbwork_prod` (192.168.100.102:5432), via read-only queries sahaja. Tiada data diubah.

---

## CURRENT MyPeribadi

```
Users (registered):          650 (640 is_active)
30-day active users:         35 (guna transaksi) / 23 (akses API 5 hari)
Database size:               217.5 MB (217,521,175 bytes)
Transactions:                5,644 total
Transactions/month:          ~986 (30d) — trend MENURUN (Apr 867→May 1,719→Jun 1,443→Jul 1,033→Aug 565)
DB growth/month:             60–120 MB (didominasi access_logs; sila lihat nota)
Media storage (R2):          217 MB (852 fail, avg 255 KB)
Media growth/month:          ~50 MB
Requests:                    ~96k dalam 5 hari (normal 11–18k/hari; spike 50k hari = banjir 429)
Realtime usage:              SSE kecil utk biz orders sahaja; utama = REST + polling pendek
```

**Largest tables:**

```
1. access_logs       156.6 MB   (96,406 rows; 21MB data + 135MB INDEX = 72% DB!)
2. business_audit_logs 12.5 MB  (14,428 rows)
3. category_keywords   8.3 MB   (55,480 rows)
4. biz_inbox_messages  4.4 MB   (8,169 rows)
5. transactions        4.0 MB   (5,644 rows)
```

---

## FAKTOR PENGUBAH / KEPUTUSAN PENTING

**1. `access_logs` ialah penguasa saiz DB — dan ia fitur BARU.**
- Logging bermula **13 Ogos 2026** (5 hari lepas, selari audit keselamatan).
- 96,406 rows dalam 5 hari → 156MB, **135MB daripadanya INDEX** (7 index: id/path/user_id/created_at/status_code/is_blocked/ip_address).
- Sebelum 13 Ogos, DB sebenar **hanya ~61MB** (tanpa access_logs).
- **TANPA retention/purge**, access_logs sahaja mencapai 500MB (limit Free) dalam **~3–6 bulan**.

**2. DB teras (tanpa access_logs) = 61MB dan tumbuh sangat perlahan.**
- transactions = 201 B/row; 986 txn/bulan = hanya **0.2 MB/bulan**.
- Semua table aplikasi lain kecil.

**3. Media di object storage (R2), bukan DB.** `attachments` simpan path sahaja (230 B/row). Fail sebenar di R2. Supabase storage analog.

**4. Realtime = polling + SSE kecil.** WhatsApp page poll setiap 3s (`setInterval`). Tiada Supabase realtime-style subscription.

---

## Projeksi (formula + data sebenar)

Per-user aktif (35 pengguna kini):
- txn: 986/35 = **28 txn/user/bulan** → 5.6 KB
- media: 50/35 = **1.4 MB/user/bulan**
- access_logs: 2.4MB/hari ÷ 35 = **68 KB/user/hari** = ~2 MB/user/bulan
- requests: ~12k/hari ÷ 35 = **~340 req/user/hari** (polling-heavy)

### 500 USER PROJECTION

| Metrik | Realistik (27 aktif @5.4%) | MAU 500 worst case |
|---|---|---|
| txn/bulan | ~756 → 0.15 MB/mo | 500×28=14,000 → 2.8 MB/mo |
| DB (tanpa access_logs) 6m | ~62 MB | ~78 MB |
| DB 12m | ~63 MB | ~95 MB |
| DB 24m | ~65 MB | ~130 MB |
| Media/bulan | ~50 MB/mo | 500×1.4=**700 MB/mo** |
| access_logs (tanpa retention) | **60–120 MB/mo** → Free lewat 3–6 bulan | **~1,000 MB/mo** → Free lewat hari |
| Realtime | Polling ~340 req/user/hari | 500×340=170k req/hari |

**Supabase Free status (500):**
- Dengan access_logs retention 30 hari + polling dioptimumkan: **SAFE** (DB ~65MB, media terkawal).
- Tanpa fix access_logs: **NOT RECOMMENDED** (melebihi 500MB cepat).

### 1000 USER PROJECTION

| Metrik | MAU 1000 worst case |
|---|---|
| txn/bulan | 28,000 → 5.6 MB/mo |
| DB 12m (tanpa access_logs) | ~130 MB |
| DB 24m | ~200 MB |
| Media/bulan | **1.4 GB/mo** |
| access_logs (tanpa retention) | ~2,000 MB/mo |
| Realtime req/hari | ~340,000 |

**Supabase Free status (1000):** media (1.4 GB/mo > 1GB Free storage) + access_logs = **NOT RECOMMENDED** untuk MAU worst-case; **WATCH** jika realistik.

---

## Supabase Free vs Pro (limit semasa 2026)

| | **Free** | **Pro ($25/mo)** |
|---|---|---|
| Database | 500 MB | 8 GB |
| MAU | 50,000 | 100,000 |
| Storage | 1 GB | 100 GB |
| Egress/bandwidth | 5 GB/mo | 250 GB/mo |
| Realtime messages | 100,000/mo | 2 M/mo |
| Realtime peak connections | 200 | 500 |
| Edge Functions | 500k invocations/mo | 2 M invocations/mo |

---

## RECOMMENDATION

**Sesuai ke Supabase Free, TETAPI HANYA selepas 2 fix wajib:**

1. **Tambah retention access_logs (purge > 30 hari).** Ini satu-satunya benda yang meletupkan DB. Dengan purge, DB teras kekal <100MB walaupun 1000 MAU — muat Free dengan selesa.
2. **Kurangkan polling** (whatsapp page 3s → 15-30s). Ini potong ~80% requests + access_logs + bandwidth. Tanpa ini, req/hari & bandwidth jangka panjang mencecah Free egress 5GB/mo.

3. **Media kekal di object storage** (R2 → Supabase Storage), bukan DB.

**Reason:**
1. Data aplikasi teras = 61MB; muat Free (500MB) dengan margin > 60% pada 500–1000 user selepas fix access_logs.
2. MAU sekarang 35 (5.4% daripada 650 registrasi); jauh bawah 50k limit Free — ini bukan pencabar.
3. Satu-satunya risiko ialah access_logs (config) + media (storage), kedua-duanya boleh diurus; bukan masalah skala.

**Status jujur:**
- **500 user:** Free **SAFE** (selepas fix). Tanpa fix: NOT RECOMMENDED.
- **1000 user MAU worst-case:** Pro (media 1.4GB/mo + egress). **1000 user realistik:** Free **WATCH**.

**Keputusan praktikal: Supabase Free + fix access_logs retention + polling.** Pindah ke Pro hanya bila media >1GB terkumpul (≈6+ bulan pada 500 MAU aktif).

---

## ESTIMATED TIME UNTIL FREE LIMIT (500MB DB)

- **Dengan access_logs retention 30 hari:** DB terkunci ~61–130MB → **tidak pernah mencecah** Free pada 500/1000 user.
- **Tanpa fix access_logs (kadar sekarang 60–120 MB/mo):** 500MB dalam **~3–6 bulan**.
  - 500 user aktif: ~3 bulan
  - 1000 user aktif: <1 bulan

---

## CATATAN KETEPATAN
- `n_live_tup` = anggaran pg_stat; semua angka penting (count, size, growth) = **count sebenar** via `count(*)`.
- Media total = jumlah `size_bytes` dalam `attachments` (R2); saya tidak baca kandungan fail.
- Requests hanya ada 5 hari log (fitur baru) — kadar/hari = estimate linear; spike 50k (16 Ogos) = banjir 429, buang dari baseline.
- Growth DB bulanan = estimate berdasarkan access_logs (data 5 hari) + media (4 bulan sebenar).

---

## SQL READ-ONLY Utama (verifikasi)

```sql
SELECT pg_size_pretty(pg_database_size(current_database()));
SELECT relname, pg_total_relation_size(relid), pg_relation_size(relid), pg_indexes_size(relid)
  FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
SELECT count(*) FROM transactions;
SELECT count(*) FILTER (WHERE txn_date >= now()-interval '30 days'),
       count(*) FILTER (WHERE txn_date >= now()-interval '90 days') FROM transactions;
SELECT user_id, count(*), max(txn_date) FROM transactions GROUP BY 1 ORDER BY 2 DESC;
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY c)
  FROM (SELECT user_id, count(*) c FROM transactions WHERE txn_date>=now()-interval '30 days' GROUP BY 1) u;
SELECT to_char(date_trunc('month',txn_date),'YYYY-MM'), count(*) FROM transactions GROUP BY 1 ORDER BY 1;
SELECT count(*), sum(size_bytes), avg(size_bytes) FROM attachments;
SELECT to_char(date_trunc('month',created_at),'YYYY-MM'), count(*), sum(size_bytes)
  FROM attachments GROUP BY 1 ORDER BY 1;
SELECT date_trunc('day',created_at)::date, count(*) FROM access_logs GROUP BY 1 ORDER BY 1 DESC;
SELECT date_trunc('hour',created_at), count(*) FROM access_logs GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
SELECT status_code, count(*) FROM access_logs GROUP BY 1 ORDER BY 2 DESC;
SELECT pg_relation_size('transactions')/count(*) FROM transactions;
SELECT indexdef FROM pg_indexes WHERE tablename='access_logs';
```

Semua query = `SELECT` sahaja. Tiada INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/migration/restart/konfigurasi.
