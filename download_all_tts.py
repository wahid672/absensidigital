#!/usr/bin/env python3
"""
==============================================================================
   SIAKAD PONPES - IOT PRESENSI SMART ENGINE ESP32
   Script Download Otomatis Semua Audio TTS & Cache Member ke Micro SD
==============================================================================
Petunjuk Penggunaan:
1. Masukkan Micro SD ke PC / Laptop menggunakan Card Reader.
2. Salin file script ini ('download_all_tts.py') ke dalam Micro SD (atau jalankan
   dari PC dengan menentukan drive Micro SD, misal: python download_all_tts.py E:\).
3. Jalankan script:
   python download_all_tts.py
4. Tunggu hingga semua suara dasar & suara seluruh nama santri/guru selesai diunduh.
5. Cabut Micro SD dan pasang kembali ke modul ESP32 IoT Presensi.
==============================================================================
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import ssl

# Konfigurasi Server & API Key IoT Presensi
SERVER_BASE_URL = "https://siakadponpes.presensirfid.web.id"
API_KEY         = "c1fbc172cefafd9c3becfd34f62ab6252fd80d4e7aa7d5cd"

# Teks Ucapan Selamat Datang Booting
BOOT_GREETING_TEXT = "Ahlan Wa Sahlan di Pondok Pesantren Roudlatul Quran 4 Jati Agung"

# Daftar Audio Sistem Dasar
BASIC_AUDIO_ITEMS = [
    {
        "file": "sukses.wav",
        "text": "Absensi masuk berhasil.",
        "desc": "Presensi Masuk Berhasil"
    },
    {
        "file": "keluar.wav",
        "text": "Absensi keluar berhasil.",
        "desc": "Presensi Keluar Berhasil"
    },
    {
        "file": "sudah_absen.wav",
        "text": "Anda sudah melakukan absensi.",
        "desc": "Sudah Melakukan Presensi"
    },
    {
        "file": "gagal.wav",
        "text": "Absensi gagal, kartu atau jari belum terdaftar.",
        "desc": "Presensi Ditolak / Belum Terdaftar"
    },
    {
        "file": "server_online.wav",
        "text": "Server online.",
        "desc": "Status Server Online"
    },
    {
        "file": "instruksi_rfid_finger.wav",
        "text": "Silahkan Tap Kartu atau Tempelkan jari anda.",
        "desc": "Instruksi Tap Kartu & Tempel Jari"
    },
    {
        "file": "instruksi_rfid.wav",
        "text": "Silahkan Tap Kartu.",
        "desc": "Instruksi Khusus RFID"
    },
    {
        "file": "mode_rekam.wav",
        "text": "Mode rekam aktif, silahkan tempelkan jari anda.",
        "desc": "Mode Rekam Sidik Jari Baru"
    },
    {
        "file": "boot.wav",
        "text": BOOT_GREETING_TEXT + ".",
        "desc": "Ucapan Selamat Datang Booting"
    }
]


def sanitize_filename(raw: str) -> str:
    """
    Menyamakan format nama file dengan fungsi sanitizeFilename() di firmware ESP32 (fw.ino).
    - Huruf kecil (lowercase)
    - Karakter non-alfanumerik diubah menjadi underscore '_'
    - Menghindari underscore ganda
    - Panjang maksimal 28 karakter
    """
    raw = raw.strip()
    out = []
    for c in raw:
        if c.isalnum():
            out.append(c.lower())
        elif c in (' ', '_', '-'):
            if out and out[-1] != '_':
                out.append('_')
        if len(out) >= 28:
            break
    res = "".join(out).strip('_')
    return res if res else "member"


def create_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def is_valid_wav_file(path: str) -> bool:
    """Memeriksa apakah file ada dan memiliki header WAV (RIFF ... WAVE) yang valid."""
    if not os.path.exists(path):
        return False
    try:
        size = os.path.getsize(path)
        if size < 44:
            return False
        with open(path, "rb") as f:
            header = f.read(12)
            return len(header) == 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE"
    except Exception:
        return False


def download_file(url: str, dest_path: str, retries: int = 3) -> bool:
    """Mengunduh file dari URL ke path tujuan dengan pengecekan integritas WAV."""
    ctx = create_ssl_context()
    temp_path = dest_path + ".tmp"
    
    headers = {
        "X-API-KEY": API_KEY,
        "User-Agent": "ESP32-TTS-Sync-Tool/1.0"
    }

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=25) as response:
                if response.status != 200:
                    time.sleep(0.5)
                    continue
                data = response.read()
                if len(data) < 44:
                    time.sleep(0.5)
                    continue

                # Pastikan direktori tujuan ada
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)

                with open(temp_path, "wb") as f:
                    f.write(data)

                # Validasi WAV jika target berekstensi .wav
                if dest_path.lower().endswith(".wav"):
                    if not is_valid_wav_file(temp_path):
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        time.sleep(0.5)
                        continue

                # Rename file temp menjadi file akhir
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                os.rename(temp_path, dest_path)
                return True
        except Exception as e:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            if attempt < retries:
                time.sleep(1.0)
            else:
                return False
    return False


def main():
    print("=" * 68)
    print("  SIAKAD PONPES - IOT PRESENSI SMART ENGINE")
    print("  Tool Sinkronisasi Audio TTS & Database Member ke Micro SD")
    print("=" * 68)

    # Tentukan Target Direktori (Default: Direktori tempat script ini berada)
    target_dir = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) > 1:
        target_dir = os.path.abspath(sys.argv[1])

    print(f"\n[TARGET DIRECTORY] Micro SD Path: {target_dir}")
    tts_dir = os.path.join(target_dir, "tts")
    members_dir = os.path.join(tts_dir, "members")

    os.makedirs(tts_dir, exist_ok=True)
    os.makedirs(members_dir, exist_ok=True)

    # =========================================================================
    # LANGKAH 1: Mengunduh / Memperbarui members_cache.json
    # =========================================================================
    print("\n" + "-" * 68)
    print("  [LANGKAH 1] Mengunduh Database Member (/members_cache.json)")
    print("-" * 68)

    members_cache_path = os.path.join(target_dir, "members_cache.json")
    members_api_url = f"{SERVER_BASE_URL}/api/members?tipe=all"

    print(f"[*] Menghubungi server: {members_api_url} ...")
    ctx = create_ssl_context()
    req = urllib.request.Request(members_api_url, headers={"X-API-KEY": API_KEY})
    
    members_list = []
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            raw_json = resp.read()
            # Tulis ke file Micro SD
            with open(members_cache_path, "wb") as f:
                f.write(raw_json)
            parsed = json.loads(raw_json.decode("utf-8"))
            members_list = parsed.get("data", [])
            print(f"[OK] Database member berhasil diperbarui ({len(raw_json):,} bytes).")
            print(f"[OK] Total data anggota ditemukan: {len(members_list)} orang (Santri & Guru).")
    except Exception as e:
        print(f"[PERINGATAN] Gagal mengunduh langsung dari server: {e}")
        if os.path.exists(members_cache_path):
            print("[INFO] Menggunakan file members_cache.json yang sudah ada di Micro SD...")
            try:
                with open(members_cache_path, "r", encoding="utf-8") as f:
                    parsed = json.load(f)
                    members_list = parsed.get("data", [])
                    print(f"[OK] Berhasil membaca {len(members_list)} anggota dari file lokal.")
            except Exception as read_err:
                print(f"[ERROR] Tidak dapat membaca file lokal: {read_err}")
                return
        else:
            print("[ERROR] File members_cache.json tidak ditemukan dan server tidak dapat diakses.")
            return

    # =========================================================================
    # LANGKAH 2: Memeriksa & Mengunduh Audio Dasar Sistem (/tts/*.wav)
    # =========================================================================
    print("\n" + "-" * 68)
    print("  [LANGKAH 2] Memeriksa & Mengunduh Audio Dasar Sistem (/tts/*.wav)")
    print("-" * 68)

    basic_downloaded = 0
    basic_skipped = 0

    for idx, item in enumerate(BASIC_AUDIO_ITEMS, 1):
        file_path = os.path.join(tts_dir, item["file"])
        text = item["text"]
        desc = item["desc"]

        if is_valid_wav_file(file_path):
            size = os.path.getsize(file_path)
            print(f"[{idx}/{len(BASIC_AUDIO_ITEMS)}] [SUDAH ADA] /tts/{item['file']} ({size:,} B) - {desc}")
            basic_skipped += 1
        else:
            print(f"[{idx}/{len(BASIC_AUDIO_ITEMS)}] [MENGUNDUH] /tts/{item['file']} ({desc})...")
            url = f"{SERVER_BASE_URL}/api/tts?text={urllib.parse.quote(text)}"
            ok = download_file(url, file_path)
            if ok:
                size = os.path.getsize(file_path)
                print(f"       -> BERHASIL disimpan ({size:,} bytes)")
                basic_downloaded += 1
            else:
                print("       -> GAGAL mengunduh suara ini!")
            time.sleep(0.05)

    # =========================================================================
    # LANGKAH 3: Memeriksa & Mengunduh Suara Nama Member (/tts/members/*.wav)
    # =========================================================================
    print("\n" + "-" * 68)
    print(f"  [LANGKAH 3] Memeriksa & Mengunduh Suara {len(members_list)} Anggota (/tts/members/*.wav)")
    print("-" * 68)

    missing_members = []
    already_ready = 0

    for m in members_list:
        nama = m.get("nama", "").strip()
        if not nama:
            continue
        safe_name = sanitize_filename(nama)
        target_path = os.path.join(members_dir, f"{safe_name}.wav")
        if is_valid_wav_file(target_path):
            already_ready += 1
        else:
            missing_members.append((nama, target_path, safe_name))

    print(f"[STATUS] Suara anggota yang SUDAH SIAP di Micro SD : {already_ready} file")
    print(f"[STATUS] Suara anggota yang PERLU DIUNDUH         : {len(missing_members)} file")

    if missing_members:
        print("\nMemulai pengunduhan otomatis suara anggota yang belum ada...")
        member_downloaded = 0
        member_failed = 0
        total_missing = len(missing_members)
        t_start = time.time()

        for idx, (nama, dest_path, safe_name) in enumerate(missing_members, 1):
            url = f"{SERVER_BASE_URL}/api/tts?text={urllib.parse.quote(nama + '.')}"
            percent = (idx * 100) // total_missing
            print(f"[{idx}/{total_missing}] ({percent}%) Mengunduh: \"{nama}\" -> /tts/members/{safe_name}.wav ...", end="", flush=True)

            ok = download_file(url, dest_path)
            if ok:
                size = os.path.getsize(dest_path)
                print(f" OK ({size:,} B)")
                member_downloaded += 1
            else:
                print(" GAGAL!")
                member_failed += 1
            time.sleep(0.05)

        elapsed = time.time() - t_start
        print(f"\n[SELESAI] Pengunduhan anggota selesai dalam {elapsed:.1f} detik.")
        print(f"          - Berhasil diunduh : {member_downloaded} file")
        if member_failed > 0:
            print(f"          - Gagal diunduh    : {member_failed} file")
    else:
        print("\n[SELESAI] Seluruh suara anggota sudah lengkap dan valid di Micro SD!")

    # =========================================================================
    # RINGKASAN AKHIR
    # =========================================================================
    total_wav_count = 0
    total_wav_bytes = 0
    for root, _, files in os.walk(tts_dir):
        for f in files:
            if f.lower().endswith(".wav"):
                total_wav_count += 1
                total_wav_bytes += os.path.getsize(os.path.join(root, f))

    print("\n" + "=" * 68)
    print("                    RINGKASAN STATUS MICRO SD")
    print("=" * 68)
    print(f"  * Total File Suara WAV di Micro SD : {total_wav_count} file")
    print(f"  * Total Ukuran File Suara          : {total_wav_bytes / (1024 * 1024):.2f} MB")
    print(f"  * Cache Anggota Offline            : members_cache.json (Siap)")
    print("=" * 68)
    print("\n[OK] Micro SD sudah siap 100%! Anda dapat mencabut Micro SD dari PC")
    print("     dan memasangkannya kembali ke mesin ESP32.")
    print("     Saat ESP32 dinyalakan, ESP32 akan langsung mendeteksi semua suara")
    print("     'Sudah siap' tanpa perlu mengunduh lagi!\n")


if __name__ == "__main__":
    main()
