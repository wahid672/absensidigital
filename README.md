# SIAKAD Absensi Digital - Fullstack Golang & IoT ESP32

Aplikasi **Fullstack All-in-One** (Backend REST API Golang + Frontend Web Admin SPA) untuk sistem absensi terintegrasi mesin mikrokontroler ESP32 (RFID / Fingerprint). 

Frontend SPA (HTML5 + Tailwind CSS + Vanilla JS) di-embed langsung ke dalam binary Golang, sehingga **hanya membutuhkan 1 container dan 1 port** saat di-deploy di VPS.

---

## 🌟 Fitur Utama

1. **Fullstack Single Binary (All-in-One):**
   - Web Server, Frontend SPA, dan Backend REST API disajikan langsung oleh satu aplikasi Golang (`main.go`).
   - Bebas masalah CORS karena frontend dan API berjalan pada domain & port yang sama.

2. **Sistem Autentikasi JWT:**
   - Standar HS256 JWT Token dengan masa aktif 24 jam.
   - Endpoint login: `POST /api/login` (Default admin: `admin` / `admin123`).
   - Token disimpan secara aman di `localStorage` pada browser.
   - Auto-login saat refresh dan auto-logout saat token expired (HTTP 401).

3. **Dashboard & Laporan Absensi:**
   - Date picker filter (default hari ini).
   - Filter tipe pengguna: **Semua**, **Siswa**, dan **Guru**.
   - Kartu statistik: Total Hadir, Tepat Waktu, Terlambat, dan Komposisi Siswa/Guru.
   - Instant Search (pencarian nama & ID mesin realtime).
   - Export rekapitulasi data ke format file **CSV / Excel**.

4. **Integrasi Mesin ESP32 IoT:**
   - Endpoint `POST /api/attendance/tap` untuk menerima data tap kartu RFID / Fingerprint secara realtime dari mikrokontroler ESP32.

---

## 📁 Struktur Proyek

```text
.
├── main.go                              # Golang Server (REST API, JWT & Static SPA handler)
├── index.html                           # Single Page Application (Tailwind CSS & Vanilla JS)
├── go.mod                               # Go Module
├── absensi_api_postman_collection.json  # Postman Collection REST API & Simulasi ESP32
├── Dockerfile                           # Multi-stage Docker Build (Golang -> Alpine)
├── docker-compose.yml                   # Docker Compose (Terkoneksi ke network: caddy_net)
├── .gitignore                           # Git ignore rules
└── README.md                            # Panduan & Dokumentasi
```

---

## 🌐 Konfigurasi Caddy Web Server di VPS

Karena web server utama VPS Anda sudah menggunakan Caddy dan berada pada network `caddy_net`, Anda hanya perlu menambahkan 1 blok `reverse_proxy` pada file `Caddyfile` Anda:

```caddy
absensi.domainanda.com {
    reverse_proxy absensi-app:8080
}
```

Kemudian reload Caddy di VPS:
```bash
docker exec -w /etc/caddy caddy caddy reload
# atau
caddy reload
```

---

## 🐳 Cara Deploy di VPS (Docker Compose)

Di VPS Anda, jalankan:

```bash
# Build dan jalankan container di background
docker compose up -d --build

# Cek status container
docker compose ps

# Cek log aplikasi
docker compose logs -f absensi-app
```

---

## 🧪 Pengujian REST API via Postman

1. Buka aplikasi **Postman**.
2. Klik tombol **Import** lalu pilih file `absensi_api_postman_collection.json`.
3. Jalankan request:
   - **`1. Login Admin`** (`POST /api/login`): Otomatis menangkap dan menyimpan token JWT ke variabel `{{jwt_token}}`.
   - **`2. Get Laporan Absensi`** (`GET /api/attendance?tanggal=2026-09-02&tipe=all`): Mengambil daftar data absensi dengan autentikasi Bearer token.
   - **`3. Simulasi Tap Mesin ESP32`** (`POST /api/attendance/tap`): Menguji pengiriman absensi dari perangkat IoT.

---

## 📤 Instruksi Push ke GitHub

Jalankan serangkaian perintah berikut di terminal Anda untuk mengunggah proyek ke GitHub:

```bash
git init
git add .
git commit -m "first commit: Fullstack Golang & SPA Absensi Digital ESP32"
git branch -M main
git remote add origin https://github.com/wahid672/absensidigital.git
git push -u origin main
```
