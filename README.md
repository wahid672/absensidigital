# 🕌 SIAKAD Absensi Digital - Fullstack Golang & IoT ESP32

[![Docker Build and Push to GHCR](https://github.com/wahid672/absensidigital/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/wahid672/absensidigital/actions/workflows/docker-publish.yml)
[![Docker Image](https://img.shields.io/badge/Docker%20Image-GHCR-blue?logo=docker)](https://github.com/wahid672/absensidigital/pkgs/container/absensidigital)

Aplikasi **Fullstack All-in-One** (Backend REST API Golang + Frontend Web Admin Single Page Application) untuk sistem presensi dan absensi digital terintegrasi mesin mikrokontroler **ESP32** (RFID & Fingerprint) dengan database **SQLite** permanen, alur **Realtime SSE**, dukungan **Offline Sync / Backdate**, dan fitur **Cetak Dokumen PDF**.

Docker Image resmi tersedia dan otomatis di-build melalui **GitHub Container Registry (GHCR)**:
```text
ghcr.io/wahid672/absensidigital:latest
```

---

## 🌟 Fitur Unggulan

### 1. 🚀 Fullstack Single Container (All-in-One)
- Frontend SPA (HTML5, Tailwind CSS, Vanilla JS) di-embed langsung ke dalam binary Golang menggunakan `//go:embed`.
- Hanya membutuhkan **1 container dan 1 port (`8080`)** saat di-deploy di VPS.
- Bebas masalah CORS karena frontend dan backend berjalan pada origin yang sama.

### 2. 🗄️ Database SQLite Permanen
- Menggunakan pure-Go SQLite driver (`modernc.org/sqlite`) yang ringan, cepat, dan tanpa ketergantungan CGO compiler.
- Database tersimpan di `/app/data/absensi.db` dan di-mount ke host via `./data:/app/data` sehingga data **tidak akan hilang saat container di-restart atau di-update**.

### 3. ⚡ Realtime Live Stream (Server-Sent Events / SSE)
- Saat perangkat ESP32 mengirim data tap kartu (`POST /api/attendance/tap`):
  - 🔔 Suara notifikasi *chime* berbunyi di browser admin.
  - 💬 Muncul notifikasi *floating toast* instan.
  - 📊 Baris data pada tabel langsung bertambah/terupdate secara realtime dengan animasi *highlight*.
  - 📈 Angka metrik kehadiran (Hadir, Tepat, Telat, Siswa/Guru) ter-update otomatis tanpa perlu refresh halaman.

### 4. 🔄 Sinkronisasi Data Offline & Backdate (ESP32 Offline Sync)
- **Tahan Gangguan Internet:** Jika koneksi internet pada ESP32 terputus, ESP32 dapat menyimpan rekaman tap di media lokal (SD Card / Flash LittleFS).
- **Kirim Data Backdate:** Saat internet kembali aktif, ESP32 dapat mengirimkan payload tap dengan menyertakan `timestamp` (ISO8601) atau `tanggal` & `waktu` asli kejadian.
- Backend Golang akan mencatat absensi sesuai tanggal dan waktu kejadian tersebut, bukan waktu server saat menerima request.

### 5. 🛑 Deteksi Cerdas "Sudah Absen" (Anti Duplicate Tap)
- Jika kartu di-tap kembali setelah melakukan absen masuk & keluar lengkap, API merespon dengan `status: "already_attended"` dan `already_recorded: true`.
- Mesin ESP32 dapat membaca respon ini untuk menampilkan pesan **"SUDAH ABSEN"** di layar LCD/OLED atau membunyikan buzzer 2x.

### 6. 👥 Manajemen Data Master (CRUD Santri & Guru)
- Kelola data **Santri / Siswa** dan **Guru / Asatidz** secara mandiri.
- Input data: Nama Lengkap, UID Kartu RFID / Tag Fingerprint, Kelas/Jabatan, dan Nomor WhatsApp.
- Fitur pencarian instan dan filter kategori.

### 7. 📝 CRUD Presensi & Smart Auto-Fill
- **Tambah Presensi Manual:** Cukup pilih Tipe (Santri/Guru) dan pilih Nama dari Data Master, maka kolom Nama, UID, dan Kelas akan **otomatis terisi (*auto-fill*)**.
- **Edit Presensi:** Data identitas terkunci (*readonly*), administrator cukup mengedit **Jam Masuk/Keluar** dan **Status Kehadiran** (`Tepat`, `Telat`, `Izin`, `Sakit`).
- **Hapus Presensi:** Hapus baris absensi dengan konfirmasi dialog aman.

### 8. 🖨️ Cetak & Export Laporan ke PDF
- Pilihan periode: **Laporan Harian (Per Tanggal)** atau **Laporan Rekap Bulanan**.
- Desain dokumen resmi dilengkapi **Kop Surat Yayasan/Sekolah** dan lembar **Tanda Tangan Pengesahan** (Kepala Sekolah & Admin).
- Format CSS `@media print` teroptimasi untuk ukuran kertas A4 siap cetak atau simpan sebagai PDF.
- Fitur export data mentah ke format **CSV / Excel**.

### 9. ⚙️ Pengaturan Sistem & Manajemen Data
- **Import / Generate Data Dummy:** Satu klik untuk mengisi data contoh santri, guru, dan riwayat presensi demo.
- **Hapus Riwayat Absensi Saja:** Mengosongkan data log absensi tanpa menghapus data anggota.
- **Reset Total Database:** Mengosongkan seluruh database jika sistem siap digunakan secara *fresh*.
- **Pengaturan Jam & Instansi:** Kustomisasi Nama Lembaga, Alamat, Batas Jam Masuk (Telat), Batas Jam Pulang, dan Nama Kepala Sekolah.

---

## 📁 Struktur Proyek

```text
.
├── main.go                              # Fullstack Server (REST API, SQLite, SSE, Backdate Sync, Embedded SPA)
├── index.html                           # Web Admin SPA (Tailwind CSS, Icons, JS)
├── go.mod / go.sum                      # Go Module & Dependensi SQLite
├── absensi_api_postman_collection.json  # Koleksi Postman Lengkap
├── Dockerfile                           # Multi-Stage Build (golang:alpine -> alpine)
├── docker-compose.yml                   # Docker Compose (Terkoneksi ke network: caddy_net)
├── .github/workflows/docker-publish.yml # CI/CD Pipeline GHCR Otomatis
├── .gitignore                           # Git ignore rules
└── README.md                            # Dokumentasi Panduan
```

---

## 🐳 Cara Deploy di VPS (Hanya dengan `docker-compose.yml`)

Pengguna di VPS **tidak perlu meng-install Go atau meng-compile source code**. Cukup siapkan file `docker-compose.yml` berikut:

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
    volumes:
      - ./data:/app/data
    environment:
      - PORT=8080
      - DB_PATH=/app/data/absensi.db
      - JWT_SECRET=siakad_esp32_iot_secret_key_2026
      - ADMIN_USER=admin
      - ADMIN_PASS=admin123
      - TZ=Asia/Jakarta

networks:
  caddy_net:
    external: true
```

### Jalankan Container:

```bash
# 1. Tarik image terbaru dari GHCR
docker compose pull

# 2. Jalankan di background
docker compose up -d

# 3. Cek log jika diperlukan
docker compose logs -f absensi-app
```

---

## 🌐 Konfigurasi Caddy Web Server di VPS

Tambahkan 1 blok `reverse_proxy` pada file `Caddyfile` VPS Anda:

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

## 🔌 Dokumentasi REST API

| Method | Endpoint | Deskripsi | Auth |
|---|---|---|---|
| `POST` | `/api/login` | Login admin & mendapatkan JWT Token | Public |
| `GET` | `/api/attendance` | Query data absensi (`?tanggal=YYYY-MM-DD` atau `?bulan=YYYY-MM` & `?tipe=all/siswa/guru`) | Bearer Token |
| `POST` | `/api/attendance` | Tambah data absensi manual | Bearer Token |
| `PUT` | `/api/attendance` | Edit jam/status absensi | Bearer Token |
| `DELETE` | `/api/attendance?id={id}` | Hapus data absensi | Bearer Token |
| `POST` | `/api/attendance/tap` | Menerima tap RFID / Fingerprint (Realtime & Backdate Sync) | Public (IoT) |
| `GET` | `/api/members` | Ambil daftar data Santri / Guru | Bearer Token |
| `POST` | `/api/members` | Tambah Santri / Guru baru | Bearer Token |
| `PUT` | `/api/members` | Update data Santri / Guru | Bearer Token |
| `DELETE` | `/api/members?id={id}` | Hapus data anggota | Bearer Token |
| `GET` | `/api/settings` | Ambil pengaturan instansi & jam presensi | Bearer Token |
| `POST` | `/api/settings` | Simpan pengaturan instansi & jam presensi | Bearer Token |
| `POST` | `/api/settings/seed-dummy` | Generate data contoh (dummy) | Bearer Token |
| `POST` | `/api/settings/reset-attendance`| Kosongkan seluruh riwayat absensi | Bearer Token |
| `POST` | `/api/settings/reset-all` | Reset total database (absensi + anggota) | Bearer Token |
| `GET` | `/api/realtime` | Server-Sent Events (SSE) Live Stream | Public |
| `GET` | `/api/health` | Health check endpoint | Public |

### Format Payload `POST /api/attendance/tap`:

#### 1. Tap Realtime (Menggunakan Waktu Server Saat Ini):
```json
{
  "device_id": "ESP32-GATE-01",
  "rfid_uid": "A1B2C301",
  "tipe_scan": "auto"
}
```

#### 2. Sync Offline / Backdate (Saat Internet ESP32 Pulih):
```json
{
  "device_id": "ESP32-GATE-01",
  "rfid_uid": "A1B2C301",
  "timestamp": "2026-09-02T06:45:30+07:00",
  "tipe_scan": "auto"
}
```
*Atau menggunakan format tanggal & waktu terpisah:*
```json
{
  "device_id": "ESP32-GATE-01",
  "rfid_uid": "A1B2C301",
  "tanggal": "2026-09-02",
  "waktu": "06:45:30",
  "tipe_scan": "auto"
}
```

#### Contoh Respon API:
- **Absen Masuk Berhasil:**
  ```json
  {
    "status": "success",
    "action": "check_in",
    "message": "Absen Masuk Berhasil (Muhammad Rizky Pratama - tepat)",
    "already_recorded": false,
    "data": { ... }
  }
  ```
- **Absen Keluar Berhasil:**
  ```json
  {
    "status": "success",
    "action": "check_out",
    "message": "Absen Keluar Berhasil (Muhammad Rizky Pratama - tepat)",
    "already_recorded": false,
    "data": { ... }
  }
  ```
- **Sudah Pernah Absen (Already Attended):**
  ```json
  {
    "status": "already_attended",
    "action": "already_completed",
    "message": "Muhammad Rizky Pratama sudah lengkap absen masuk (06:45:12) & keluar (15:05:30) pada tgl 2026-09-02",
    "already_recorded": true,
    "data": { ... }
  }
  ```

---

## 📟 Contoh Kode ESP32 (Arduino C++)

Contoh kode ESP32 dengan modul RFID RC522:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

const char* ssid = "NAMA_WIFI";
const char* password = "PASSWORD_WIFI";
const char* serverUrl = "https://absensi.domainanda.com/api/attendance/tap";

#define SS_PIN  5
#define RST_PIN 22
MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Terhubung!");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();
  Serial.println("UID Kartu: " + uidStr);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"device_id\":\"ESP32-GATE-01\",\"rfid_uid\":\"" + uidStr + "\",\"tipe_scan\":\"auto\"}";
    int httpCode = http.POST(jsonPayload);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.println("Respon Server: " + response);

      // Parse status respon
      StaticJsonDocument<512> doc;
      deserializeJson(doc, response);
      const char* status = doc["status"];
      const char* message = doc["message"];

      if (strcmp(status, "already_attended") == 0) {
        Serial.println("⚠️ NOTIFIKASI: SUDAH ABSEN HARI INI!");
      } else {
        Serial.println("✅ " + String(message));
      }
    }
    http.end();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500);
}
```

---

## 🧪 Pengujian via Postman

1. Buka aplikasi **Postman**.
2. Klik tombol **Import** lalu pilih file `absensi_api_postman_collection.json`.
3. Jalankan request **`1. Login Admin`** untuk otomatis menyimpan token JWT ke variabel `{{jwt_token}}`.
4. Buka folder **`2. Integrasi Mesin ESP32 & Sync Offline`** untuk mencoba simulasi:
   - Tap Masuk Realtime
   - Tap Keluar Realtime
   - Tap Saat Sudah Absen Lengkap (*Already Attended Response*)
   - Sync Backdate Offline Data (ISO8601 & Tanggal/Jam Manual)

---

## 🔐 Akun Default

- **URL Web Admin:** `https://absensi.domainanda.com`
- **Username:** `admin`
- **Password:** `admin123`

*(Dapat dikonfigurasi melalui environment variable `ADMIN_USER` dan `ADMIN_PASS` pada `docker-compose.yml`)*
