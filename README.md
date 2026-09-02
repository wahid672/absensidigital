# SIAKAD Absensi Digital - Fullstack Golang & IoT ESP32

Aplikasi **Fullstack All-in-One** (Backend REST API Golang + Frontend Web Admin SPA) untuk sistem absensi digital terintegrasi mesin mikrokontroler ESP32 (RFID & Fingerprint).

Docker Image resmi tersedia dan otomatis di-build melalui **GitHub Container Registry (GHCR)**:
```text
ghcr.io/wahid672/absensidigital:latest
```

---

## 🚀 Fitur Utama

1. **Fullstack Single Container:**
   - Web Server, Frontend SPA (HTML5, Tailwind CSS, Vanilla JS), dan REST API disajikan langsung oleh satu binary Golang.
   - Menggunakan port tunggal (`8080`) dan bebas kendala CORS.

2. **Autentikasi JWT (HS256):**
   - Endpoint login `POST /api/login` (Default admin: `admin` / `admin123`).
   - Sesi tersimpan di `localStorage`, auto-login, dan auto-logout saat token expired (HTTP 401).

3. **Dashboard Laporan & Rekapitulasi:**
   - Filter Tanggal & Tipe Pengguna (**Semua**, **Siswa**, **Guru**).
   - Metrik Kehadiran: Total Hadir, Tepat Waktu, Terlambat, dan Komposisi Siswa/Guru.
   - Pencarian Instan (Live search tabel berdasarkan Nama atau ID Mesin).
   - Fitur **Export CSV / Excel**.

4. **Integrasi Mesin ESP32 IoT:**
   - Endpoint `POST /api/attendance/tap` untuk mencatat absensi realtime dari perangkat IoT ESP32.

---

## 🐳 Cara Deploy di VPS (Menggunakan Image GHCR)

Pengguna di VPS **tidak perlu melakukan build kode sumber atau install Go**. Cukup gunakan file `docker-compose.yml` berikut:

### 1. Buat File `docker-compose.yml`

```yaml
version: '3.8'

services:
  absensi-app:
    image: ghcr.io/wahid672/absensidigital:latest
    container_name: absensi-app
    restart: unless-stopped
    expose:
      - "8080"
    networks:
      - caddy_net
    environment:
      - PORT=8080
      - JWT_SECRET=siakad_esp32_iot_secret_key_2026
      - ADMIN_USER=admin
      - ADMIN_PASS=admin123
      - TZ=Asia/Jakarta

networks:
  caddy_net:
    external: true
```

### 2. Jalankan Container

```bash
# Tarik image terbaru dari GHCR dan jalankan di background
docker compose pull
docker compose up -d

# Cek log aplikasi
docker compose logs -f absensi-app
```

---

## 🌐 Konfigurasi Caddy Web Server di VPS

Tambahkan konfigurasi reverse proxy pada `Caddyfile` Anda:

```caddy
absensi.domainanda.com {
    reverse_proxy absensi-app:8080
}
```

Kemudian reload Caddy:
```bash
caddy reload
```

---

## 🤖 Otomatisasi Build CI/CD (GitHub Actions)

Workflow GitHub Actions [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) telah dikonfigurasi untuk:
- Otomatis melakukan compile dan build multi-arch (`linux/amd64`, `linux/arm64`).
- Otomatis mem-push Docker Image ke `ghcr.io/wahid672/absensidigital:latest` setiap kali Anda melakukan `git push` ke branch `main`.

> [!TIP]
> **Agar Image Dapat Ditarik Publik:**
> Setelah push pertama selesai:
> 1. Buka halaman GitHub Anda: `https://github.com/wahid672/absensidigital/packages`.
> 2. Klik package `absensidigital` -> **Package Settings**.
> 3. Gulir ke bawah ke bagian **Danger Zone** -> klik **Change visibility** menjadi **Public**.

---

## 🧪 Pengujian REST API via Postman

1. Buka aplikasi **Postman**.
2. Klik tombol **Import** lalu pilih file `absensi_api_postman_collection.json`.
3. Request yang tersedia:
   - **`1. Login Admin`** (`POST /api/login`) -> Otomatis menangkap dan menyimpan token JWT ke `{{jwt_token}}`.
   - **`2. Get Laporan Absensi`** (`GET /api/attendance?tanggal=2026-09-02&tipe=all`) -> Query dengan Bearer token.
   - **`3. Simulasi Tap Mesin ESP32`** (`POST /api/attendance/tap`) -> Simulasi pengiriman data tap dari ESP32.

---

## 📤 Langkah Push ke Repository GitHub

Jalankan perintah berikut di terminal Anda untuk mengunggah proyek dan memicu build GHCR otomatis:

```bash
git init
git add .
git commit -m "feat: Fullstack Golang & SPA Absensi ESP32 with GHCR automated build"
git branch -M main
git remote add origin https://github.com/wahid672/absensidigital.git
git push -u origin main
```
