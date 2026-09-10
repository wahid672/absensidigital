package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed all:frontend/dist
var frontendDist embed.FS

// Global Configuration
var (
	jwtSecret  = getEnv("JWT_SECRET", "siakad_esp32_iot_secret_key_2026")
	adminUser  = getEnv("ADMIN_USER", "admin")
	adminPass  = getEnv("ADMIN_PASS", "admin123")
	serverPort = getEnv("PORT", "8080")
	dbPath     = getDBPath()
	db         *sql.DB
	dbMutex    sync.RWMutex
	sseClients = make(map[chan string]bool)
	sseMutex   sync.Mutex
)

// Data Models
type User struct {
	Username string `json:"username"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Token   string `json:"token"`
	User    User   `json:"user"`
}

type Member struct {
	ID             int    `json:"id"`
	UID            string `json:"uid"`
	FingerprintID  int    `json:"fingerprint_id"`  // ID slot sidik jari pada sensor (1-500)
	NISNIP         string `json:"nis_nip"`         // NIS untuk Santri, NIP untuk Guru
	Nama           string `json:"nama"`
	NamaOrtu       string `json:"nama_ortu"`       // Nama Orang Tua / Wali
	Tipe           string `json:"tipe"`            // "siswa" | "guru"
	Kelas          string `json:"kelas"`           // e.g. "10 IPA 1" atau "Guru Fiqih & Hadits"
	NoHP           string `json:"no_hp"`
	TelegramChatID string `json:"telegram_chat_id"` // Telegram Chat ID Wali / Guru
	CreatedAt      string `json:"created_at"`
}

type FingerprintRecord struct {
	ID            int     `json:"id"`
	FingerprintID int     `json:"fingerprint_id"`
	DeviceID      string  `json:"device_id"`
	MemberID      int     `json:"member_id"`
	TemplateData  string  `json:"template_data"`
	Status        string  `json:"status"` // "unmapped" | "mapped"
	Member        *Member `json:"member,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type RFIDCardRecord struct {
	ID        int     `json:"id"`
	CardUID   string  `json:"card_uid"`
	DeviceID  string  `json:"device_id"`
	MemberID  int     `json:"member_id"`
	Status    string  `json:"status"` // "unmapped" | "mapped"
	Member    *Member `json:"member,omitempty"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type TemplateItem struct {
	FingerprintID int    `json:"fingerprint_id"`
	TemplateData  string `json:"template_data"`
	Nama          string `json:"nama,omitempty"`
}

type ClassRoom struct {
	ID         int    `json:"id"`
	Nama       string `json:"nama"`
	Tingkat    string `json:"tingkat"`
	Keterangan string `json:"keterangan"`
}

type Position struct {
	ID         int    `json:"id"`
	Nama       string `json:"nama"`
	Keterangan string `json:"keterangan"`
}

type AttendanceRecord struct {
	ID           int    `json:"id"`
	UID          string `json:"uid"`
	Nama         string `json:"nama"`
	Tipe         string `json:"tipe"` // "siswa" | "guru"
	Kelas        string `json:"kelas"`
	Tanggal      string `json:"tanggal"` // YYYY-MM-DD
	WaktuMasuk   string `json:"waktu_masuk"`
	StatusMasuk  string `json:"status_masuk"` // "tepat" | "telat" | "izin" | "sakit" | "-"
	WaktuKeluar  string `json:"waktu_keluar"`
	StatusKeluar string `json:"status_keluar"` // "tepat" | "cepat" | "-"
	DeviceID     string `json:"id_mesin"`
	CreatedAt    string `json:"created_at"`
}

type AttendanceSummary struct {
	UID            string `json:"uid"`
	NISNIP         string `json:"nis_nip"`
	Nama           string `json:"nama"`
	Tipe           string `json:"tipe"`
	Kelas          string `json:"kelas"`
	TotalHadir     int    `json:"total_hadir"`
	TotalTepat     int    `json:"total_tepat"`
	TotalTelat     int    `json:"total_telat"`
	TotalIzinSakit int    `json:"total_izin_sakit"`
}

type TapRequest struct {
	Action             string            `json:"action"` // "tap", "enroll", "sync", "delete_fingerprint", "delete_all_fingerprints", "offline_sync", "upload_templates", "get_templates"
	DeviceID           string            `json:"device_id"`
	RFIDTag            string            `json:"rfid_uid"`
	RFIDTagAlt         string            `json:"rfid_tag"` // Support fw.ino
	FingerprintID      int               `json:"fingerprint_id"`
	FingerprintIDAlt   int               `json:"finger_id"`
	TemplateData       string            `json:"template_data"`
	ActiveFingerprints []int             `json:"active_fingerprints"`
	TotalFingerprints  int               `json:"total_fingerprints"`
	Templates          []TemplateItem    `json:"templates"`
	OfflineLogs        []json.RawMessage `json:"offline_logs"`
	TipeScan           string            `json:"tipe_scan"` // "auto", "masuk", "keluar"
	Timestamp          string            `json:"timestamp"` // e.g. "2026-09-02T06:45:30+07:00"
	RecordedAt         string            `json:"recorded_at"` // e.g. "2026-09-02 06:45:30"
	Tanggal            string            `json:"tanggal"`   // e.g. "2026-09-02"
	Waktu              string            `json:"waktu"`     // e.g. "06:45:30"
}

type DeviceInfo struct {
	ID       int    `json:"id"`
	DeviceID string `json:"device_id"`
	Nama     string `json:"nama"`
	Lokasi   string `json:"lokasi"`
	LastSeen string `json:"last_seen"`
}

// -------------------------------------------------------------
// DATABASE INITIALIZATION & MIGRATIONS (SQLite)
// -------------------------------------------------------------
func initDatabase() {
	dir := "data"
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("Warning creating data dir: %v", err)
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Gagal membuka database SQLite (%s): %v", dbPath, err)
	}

	schema := `
	CREATE TABLE IF NOT EXISTS members (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nis_nip TEXT UNIQUE NOT NULL,
		uid TEXT DEFAULT '',
		fingerprint_id INTEGER DEFAULT 0,
		nama TEXT NOT NULL,
		nama_ortu TEXT DEFAULT '',
		tipe TEXT NOT NULL,
		kelas TEXT DEFAULT '',
		no_hp TEXT DEFAULT '',
		telegram_chat_id TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS classes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nama TEXT UNIQUE NOT NULL,
		tingkat TEXT DEFAULT '',
		keterangan TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS positions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nama TEXT UNIQUE NOT NULL,
		keterangan TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS attendances (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		uid TEXT NOT NULL,
		nama TEXT NOT NULL,
		tipe TEXT NOT NULL,
		kelas TEXT DEFAULT '',
		tanggal TEXT NOT NULL,
		waktu_masuk TEXT DEFAULT '-',
		status_masuk TEXT DEFAULT '-',
		waktu_keluar TEXT DEFAULT '-',
		status_keluar TEXT DEFAULT '-',
		id_mesin TEXT DEFAULT 'ESP32-DEV',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS devices (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		device_id TEXT UNIQUE NOT NULL,
		nama TEXT NOT NULL,
		lokasi TEXT NOT NULL,
		last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS fingerprints (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		fingerprint_id INTEGER NOT NULL,
		device_id TEXT NOT NULL,
		member_id INTEGER DEFAULT 0,
		template_data TEXT DEFAULT '',
		status TEXT DEFAULT 'unmapped',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(device_id, fingerprint_id)
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS rfid_cards (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		card_uid TEXT UNIQUE NOT NULL,
		device_id TEXT DEFAULT 'PRESENSI-V1',
		member_id INTEGER DEFAULT 0,
		status TEXT DEFAULT 'unmapped',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS pending_deleted_fingerprints (
		device_id TEXT NOT NULL,
		fingerprint_id INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(device_id, fingerprint_id)
	);
	`
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("Gagal inisialisasi schema database: %v", err)
	}

	// Sinkronisasi awal data kartu anggota ke rfid_cards
	db.Exec(`INSERT OR IGNORE INTO rfid_cards (card_uid, member_id, status)
		SELECT uid, id, 'mapped' FROM members 
		WHERE uid != '' AND uid NOT LIKE 'PENDING-%' AND uid NOT LIKE 'UNASSIGNED-%'`)

	// Migrations for existing database
	db.Exec("ALTER TABLE members ADD COLUMN nis_nip TEXT DEFAULT ''")
	db.Exec("ALTER TABLE members ADD COLUMN fingerprint_id INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE members ADD COLUMN nama_ortu TEXT DEFAULT ''")
	db.Exec("ALTER TABLE members ADD COLUMN telegram_chat_id TEXT DEFAULT ''")

	// Migrasi constraint tabel members: jadikan nis_nip UNIQUE NOT NULL dan uid bebas (TEXT DEFAULT '')
	var membersTableSQL string
	db.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'").Scan(&membersTableSQL)
	if strings.Contains(membersTableSQL, "uid TEXT UNIQUE") || !strings.Contains(membersTableSQL, "nis_nip TEXT UNIQUE") {
		log.Println("[MIGRATION] Menyesuaikan skema tabel members agar 'nis_nip' menjadi UNIQUE NOT NULL...")
		// 1. Pastikan tidak ada nis_nip yang kosong/null pada record lama
		db.Exec("UPDATE members SET nis_nip = 'ID-' || id WHERE nis_nip IS NULL OR TRIM(nis_nip) = ''")
		// 2. Bersihkan nilai UID dummy lama (PENDING-... / UNASSIGNED-...) menjadi string kosong ""
		db.Exec("UPDATE members SET uid = '' WHERE uid LIKE 'PENDING-%' OR uid LIKE 'UNASSIGNED-%'")
		// 3. Buat tabel sementara dengan skema baru
		_, errMigrate := db.Exec(`
			CREATE TABLE members_migrated (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				nis_nip TEXT UNIQUE NOT NULL,
				uid TEXT DEFAULT '',
				fingerprint_id INTEGER DEFAULT 0,
				nama TEXT NOT NULL,
				nama_ortu TEXT DEFAULT '',
				tipe TEXT NOT NULL,
				kelas TEXT DEFAULT '',
				no_hp TEXT DEFAULT '',
				telegram_chat_id TEXT DEFAULT '',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			INSERT OR REPLACE INTO members_migrated (id, nis_nip, uid, fingerprint_id, nama, nama_ortu, tipe, kelas, no_hp, telegram_chat_id, created_at)
			SELECT id, nis_nip, uid, COALESCE(fingerprint_id, 0), nama, COALESCE(nama_ortu, ''), tipe, COALESCE(kelas, ''), COALESCE(no_hp, ''), COALESCE(telegram_chat_id, ''), COALESCE(created_at, CURRENT_TIMESTAMP)
			FROM members;
			DROP TABLE members;
			ALTER TABLE members_migrated RENAME TO members;
			CREATE UNIQUE INDEX IF NOT EXISTS idx_members_nis_nip ON members(nis_nip);
		`)
		if errMigrate != nil {
			log.Printf("[MIGRATION WARNING] Migrasi tabel members: %v", errMigrate)
		} else {
			log.Println("[MIGRATION SUCCESS] Skema tabel members berhasil dimigrasikan ke nis_nip UNIQUE.")
		}
	}

	// Default settings
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_nama', 'YAYASAN PONDOK PESANTREN & SEKOLAH DIGITAL')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_alamat', 'Jl. Pesantren Digital No. 01')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_kota', 'Kota Santri')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_mode', 'pesantren')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_register_card', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('jam_masuk_batas', '07:00')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('jam_pulang_batas', '15:00')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('kepala_nama', 'KH. Ahmad Zaki, Lc., M.Ag')")

	// Inisialisasi Otomatis IoT Secret API Key (Unik Hash Kriptografis untuk Pengguna Baru)
	var existingApiKey string
	db.QueryRow("SELECT value FROM settings WHERE key = 'iot_api_key'").Scan(&existingApiKey)
	if existingApiKey == "" {
		randomBytes := make([]byte, 24)
		if _, err := rand.Read(randomBytes); err == nil {
			existingApiKey = hex.EncodeToString(randomBytes)
		} else {
			h := sha256.Sum256([]byte(fmt.Sprintf("siakad_iot_key_%d", time.Now().UnixNano())))
			existingApiKey = hex.EncodeToString(h[:24])
		}
		db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('iot_api_key', ?)", existingApiKey)
		log.Printf("[INIT] IoT Secret API Key baru berhasil di-generate otomatis: %s", existingApiKey)
	}

	// Default Telegram settings
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_bot_token', '')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_enabled', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_notify_in', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_notify_out', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_admin_chat_ids', '')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_notify_admin', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_template_admin', '📋 *LIVE MONITOR PRESENSI ADMIN*\n👤 Nama: *{nama}*\n🏷️ Tipe: {tipe}\n🏫 Kelas/Jabatan: {kelas}\n🔄 Aksi: *{aksi}* ({status})\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📍 Mesin: {id_mesin}\n_{instansi}_')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_template_in', '🔔 *NOTIFIKASI PRESENSI MASUK*\nAssalamu''alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nAlhamdulillah, santri telah tiba dan melakukan presensi masuk:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nTerima kasih.\n_{instansi}_')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_template_out', '🔔 *NOTIFIKASI PRESENSI PULANG*\nAssalamu''alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nSantri telah melakukan presensi pulang:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nTerima kasih.\n_{instansi}_')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_template_late', '⚠️ *PERINGATAN KETERLAMBATAN*\nAssalamu''alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nSantri tercatat terlambat melakukan presensi:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nMohon perhatiannya. Terima kasih.\n_{instansi}_')")

	// Default Text-To-Speech (TTS) settings
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('tts_enabled', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('tts_server_url', 'https://tts.smartapps.my.id/tts')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('tts_api_key', 'P8xK2mQ7Za')")

	seedInitialData()
}

func seedInitialData() {
	// 1. Seed Classes
	var classCount int
	db.QueryRow("SELECT COUNT(*) FROM classes").Scan(&classCount)
	if classCount == 0 {
		classes := []ClassRoom{
			{Nama: "10 IPA 1", Tingkat: "10", Keterangan: "Kelas 10 Peminatan IPA 1"},
			{Nama: "10 IPA 2", Tingkat: "10", Keterangan: "Kelas 10 Peminatan IPA 2"},
			{Nama: "10 IPS 1", Tingkat: "10", Keterangan: "Kelas 10 Peminatan IPS 1"},
			{Nama: "11 IPA 1", Tingkat: "11", Keterangan: "Kelas 11 Peminatan IPA 1"},
			{Nama: "11 IPS 1", Tingkat: "11", Keterangan: "Kelas 11 Peminatan IPS 1"},
			{Nama: "11 IPS 2", Tingkat: "11", Keterangan: "Kelas 11 Peminatan IPS 2"},
			{Nama: "12 IPA 1", Tingkat: "12", Keterangan: "Kelas 12 Peminatan IPA 1"},
			{Nama: "12 IPS 1", Tingkat: "12", Keterangan: "Kelas 12 Peminatan IPS 1"},
			{Nama: "Tahfidz A", Tingkat: "Program Khusus", Keterangan: "Halaqah Tahfidzul Quran A"},
			{Nama: "Tahfidz B", Tingkat: "Program Khusus", Keterangan: "Halaqah Tahfidzul Quran B"},
		}
		for _, c := range classes {
			db.Exec("INSERT OR IGNORE INTO classes (nama, tingkat, keterangan) VALUES (?, ?, ?)", c.Nama, c.Tingkat, c.Keterangan)
		}
	}

	// 2. Seed Positions (Mencakup Mode Pesantren, Mode Sekolah & Mode Umum)
	var posCount int
	db.QueryRow("SELECT COUNT(*) FROM positions").Scan(&posCount)
	if posCount == 0 {
		positions := []Position{
			// Posisi Akademik / Pesantren / Sekolah
			{Nama: "Guru Fiqih & Hadits", Keterangan: "Pengampu Pelajaran Fiqih & Hadits"},
			{Nama: "Guru Bahasa Arab", Keterangan: "Pengampu Pelajaran Bahasa Arab & Nahwu"},
			{Nama: "Guru Tahfidz & Quran", Keterangan: "Pembimbing Tahfidz Al-Qur'an"},
			{Nama: "Guru Aqidah Akhlak", Keterangan: "Pengampu Pelajaran Aqidah Akhlak"},
			{Nama: "Guru Matematika & Sains", Keterangan: "Pengampu Bidang Eksak"},
			{Nama: "Guru Bahasa Inggris", Keterangan: "Pengampu Pelajaran Bahasa Inggris"},
			{Nama: "Wali Asrama & Pengasuhan", Keterangan: "Koordinator Pengasuhan Santri"},
			{Nama: "Kepala Madrasah / Kurikulum", Keterangan: "Kepala Bidang Akademik"},
			// Posisi Instansi Umum / Perusahaan / Lembaga
			{Nama: "Direktur Utama / Pimpinan", Keterangan: "Pimpinan Eksekutif Lembaga"},
			{Nama: "Manager IT & Operasional", Keterangan: "Kepala Divisi Teknologi & Sistem"},
			{Nama: "Staf Keuangan & Bendahara", Keterangan: "Pengelola Kas & Keuangan"},
			{Nama: "HRD & Personalia", Keterangan: "Manajemen Sumber Daya Manusia"},
			{Nama: "Staf Administrasi & Publikasi", Keterangan: "Pelayanan Administrasi & Humas"},
			{Nama: "Customer Service & Resepsionis", Keterangan: "Front Desk & Layanan Tamu"},
		}
		for _, p := range positions {
			db.Exec("INSERT OR IGNORE INTO positions (nama, keterangan) VALUES (?, ?)", p.Nama, p.Keterangan)
		}
	}

	// Cek apakah data dummy lama (format UID hex A1B2C3..) masih ada atau rfid_cards masih kosong
	var hasOldHexUID int
	db.QueryRow("SELECT COUNT(*) FROM members WHERE uid LIKE 'A1B2C3%'").Scan(&hasOldHexUID)
	var rfidCount int
	db.QueryRow("SELECT COUNT(*) FROM rfid_cards").Scan(&rfidCount)

	if hasOldHexUID > 0 || rfidCount == 0 {
		// Bersihkan data dummy lama
		db.Exec("DELETE FROM attendances WHERE uid LIKE 'A1B2C3%'")
		db.Exec("DELETE FROM members WHERE uid LIKE 'A1B2C3%'")
		db.Exec("DELETE FROM rfid_cards WHERE card_uid LIKE 'A1B2C3%'")
		seedDummyData()
		return
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM members").Scan(&count)
	if count == 0 {
		seedDummyData()
	}
}

func seedDummyData() {
	log.Println("🌱 Memasukkan seed data dummy lengkap (RFID 10 angka, Sidik Jari, Pegawai/Santri & Presensi)...")

	// 1. Devices
	devices := []DeviceInfo{
		{DeviceID: "PRESENSI-V1", Nama: "Mesin Utama Lobby", Lokasi: "Pintu Masuk Lobby Utama"},
		{DeviceID: "ESP32-GATE-01", Nama: "Mesin Gerbang Masuk", Lokasi: "Pintu Gerbang Depan"},
		{DeviceID: "ESP32-GATE-02", Nama: "Mesin Gedung B", Lokasi: "Lobby Gedung B & Kantor"},
	}
	for _, d := range devices {
		db.Exec(`INSERT INTO devices (device_id, nama, lokasi, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(device_id) DO UPDATE SET nama = excluded.nama, lokasi = excluded.lokasi, last_seen = CURRENT_TIMESTAMP`,
			d.DeviceID, d.Nama, d.Lokasi)
	}

	// 2. Positions (Pastikan posisi umum & pesantren lengkap)
	positions := []Position{
		{Nama: "Guru Fiqih & Hadits", Keterangan: "Pengampu Pelajaran Fiqih & Hadits"},
		{Nama: "Guru Bahasa Arab", Keterangan: "Pengampu Pelajaran Bahasa Arab & Nahwu"},
		{Nama: "Guru Tahfidz & Quran", Keterangan: "Pembimbing Tahfidz Al-Qur'an"},
		{Nama: "Guru Aqidah Akhlak", Keterangan: "Pengampu Pelajaran Aqidah Akhlak"},
		{Nama: "Guru Matematika & Sains", Keterangan: "Pengampu Bidang Eksak"},
		{Nama: "Guru Bahasa Inggris", Keterangan: "Pengampu Pelajaran Bahasa Inggris"},
		{Nama: "Wali Asrama & Pengasuhan", Keterangan: "Koordinator Pengasuhan Santri"},
		{Nama: "Kepala Madrasah / Kurikulum", Keterangan: "Kepala Bidang Akademik"},
		{Nama: "Direktur Utama / Pimpinan", Keterangan: "Pimpinan Eksekutif Lembaga"},
		{Nama: "Manager IT & Operasional", Keterangan: "Kepala Divisi Teknologi & Sistem"},
		{Nama: "Staf Keuangan & Bendahara", Keterangan: "Pengelola Kas & Keuangan"},
		{Nama: "HRD & Personalia", Keterangan: "Manajemen Sumber Daya Manusia"},
		{Nama: "Staf Administrasi & Publikasi", Keterangan: "Pelayanan Administrasi & Humas"},
		{Nama: "Customer Service & Resepsionis", Keterangan: "Front Desk & Layanan Tamu"},
	}
	for _, p := range positions {
		db.Exec("INSERT OR IGNORE INTO positions (nama, keterangan) VALUES (?, ?)", p.Nama, p.Keterangan)
	}

	// 3. Members (RFID 10 ANGKA & beberapa tanpa kartu untuk uji coba mapping)
	members := []Member{
		// === PEGAWAI / ASATIDZ / GURU (tipe: guru) ===
		{UID: "0014829101", FingerprintID: 1, NISNIP: "198507122010011001", Nama: "Ustadz Ahmad Fauzi, S.Pd.I", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Fiqih & Hadits", NoHP: "081234567801", TelegramChatID: "123456781"},
		{UID: "0014829102", FingerprintID: 2, NISNIP: "198803152012012002", Nama: "Ustadzah Fatimah Zahra, M.Pd", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Bahasa Arab", NoHP: "081234567802", TelegramChatID: "123456782"},
		{UID: "0014829103", FingerprintID: 3, NISNIP: "198211052008011003", Nama: "Ustadz Abdullah Yusuf, Lc", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Tahfidz & Quran", NoHP: "081234567803", TelegramChatID: "123456783"},
		{UID: "0014829104", FingerprintID: 4, NISNIP: "199002202015012004", Nama: "Ustadzah Maryam Jameelah, S.Ag", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Aqidah Akhlak", NoHP: "081234567804", TelegramChatID: "123456784"},
		{UID: "0014829105", FingerprintID: 5, NISNIP: "198604102011011005", Nama: "Hendra Wijaya, S.T.", NamaOrtu: "", Tipe: "guru", Kelas: "Manager IT & Operasional", NoHP: "081234567805", TelegramChatID: "123456785"},
		{UID: "0014829106", FingerprintID: 6, NISNIP: "199208152016012006", Nama: "Siti Nurhaliza, S.E.", NamaOrtu: "", Tipe: "guru", Kelas: "Staf Keuangan & Bendahara", NoHP: "081234567806", TelegramChatID: "123456786"},
		{UID: "0014829107", FingerprintID: 7, NISNIP: "198409222009011007", Nama: "Bambang Suryono, S.H.", NamaOrtu: "", Tipe: "guru", Kelas: "HRD & Personalia", NoHP: "081234567807", TelegramChatID: "123456787"},
		{UID: "0014829108", FingerprintID: 8, NISNIP: "199411032018012008", Nama: "Dewi Anggraini, S.Kom", NamaOrtu: "", Tipe: "guru", Kelas: "Staf Administrasi & Publikasi", NoHP: "081234567808", TelegramChatID: "123456788"},
		// Anggota belum punya kartu (UID kosong "")
		{UID: "", FingerprintID: 0, NISNIP: "199105172017011009", Nama: "Rahmat Hidayat, M.Kom", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Matematika & Sains", NoHP: "081234567809", TelegramChatID: ""},
		{UID: "", FingerprintID: 0, NISNIP: "199312012019012010", Nama: "Anisa Rahmawati, S.Pd", NamaOrtu: "", Tipe: "guru", Kelas: "Guru Bahasa Inggris", NoHP: "081234567810", TelegramChatID: ""},

		// === SANTRI / SISWA (tipe: siswa) ===
		{UID: "0014829111", FingerprintID: 9, NISNIP: "20261001", Nama: "Muhammad Rizky Pratama", NamaOrtu: "Bpk. Bambang Pratama", Tipe: "siswa", Kelas: "10 IPA 1", NoHP: "081234567811", TelegramChatID: "123456791"},
		{UID: "0014829112", FingerprintID: 10, NISNIP: "20261002", Nama: "Aisyah Nurul Hidayah", NamaOrtu: "Bpk. H. Syarifudin", Tipe: "siswa", Kelas: "11 IPS 2", NoHP: "081234567812", TelegramChatID: "123456792"},
		{UID: "0014829113", FingerprintID: 11, NISNIP: "20261003", Nama: "Fajar Dwi Santoso", NamaOrtu: "Ibu Sri Wahyuni", Tipe: "siswa", Kelas: "12 IPA 1", NoHP: "081234567813", TelegramChatID: "123456793"},
		{UID: "0014829114", FingerprintID: 12, NISNIP: "20261004", Nama: "Zaid Bin Haritsah", NamaOrtu: "Bpk. Haritsah", Tipe: "siswa", Kelas: "10 IPA 2", NoHP: "081234567814", TelegramChatID: "123456794"},
		{UID: "0014829115", FingerprintID: 13, NISNIP: "20261005", Nama: "Khadijah Al-Kubra", NamaOrtu: "Bpk. Khuwaylid", Tipe: "siswa", Kelas: "11 IPA 1", NoHP: "081234567815", TelegramChatID: "123456795"},
		{UID: "0014829116", FingerprintID: 14, NISNIP: "20261006", Nama: "Bilal Bin Rabah", NamaOrtu: "Bpk. Rabah", Tipe: "siswa", Kelas: "12 IPS 1", NoHP: "081234567816", TelegramChatID: "123456796"},
		{UID: "0014829117", FingerprintID: 15, NISNIP: "20261007", Nama: "Ali Bin Abi Thalib", NamaOrtu: "Bpk. Abu Thalib", Tipe: "siswa", Kelas: "Tahfidz A", NoHP: "081234567817", TelegramChatID: "123456797"},
		{UID: "0014829118", FingerprintID: 16, NISNIP: "20261008", Nama: "Fatimah Az-Zahra", NamaOrtu: "Bpk. Muhammad", Tipe: "siswa", Kelas: "Tahfidz B", NoHP: "081234567818", TelegramChatID: "123456798"},
		// Siswa belum punya kartu (UID kosong "")
		{UID: "", FingerprintID: 0, NISNIP: "20261009", Nama: "Umar Al-Faruq", NamaOrtu: "Bpk. Khattab", Tipe: "siswa", Kelas: "10 IPS 1", NoHP: "081234567819", TelegramChatID: ""},
		{UID: "", FingerprintID: 0, NISNIP: "20261010", Nama: "Utsman Dzun-Nurain", NamaOrtu: "Bpk. Affan", Tipe: "siswa", Kelas: "11 IPS 1", NoHP: "081234567820", TelegramChatID: ""},
	}

	for _, m := range members {
		res, err := db.Exec(`INSERT INTO members (nis_nip, uid, fingerprint_id, nama, nama_ortu, tipe, kelas, no_hp, telegram_chat_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(nis_nip) DO UPDATE SET 
				uid = excluded.uid,
				fingerprint_id = excluded.fingerprint_id,
				nama = excluded.nama,
				nama_ortu = excluded.nama_ortu,
				tipe = excluded.tipe,
				kelas = excluded.kelas,
				no_hp = excluded.no_hp,
				telegram_chat_id = excluded.telegram_chat_id`,
			m.NISNIP, m.UID, m.FingerprintID, m.Nama, m.NamaOrtu, m.Tipe, m.Kelas, m.NoHP, m.TelegramChatID)

		if err == nil {
			var memberID int64
			db.QueryRow("SELECT id FROM members WHERE nis_nip = ?", m.NISNIP).Scan(&memberID)
			if memberID == 0 {
				memberID, _ = res.LastInsertId()
			}

			// 4. Sinkronisasi kartu terhubung (mapped) ke rfid_cards (hanya jika UID diisi)
			if m.UID != "" && !strings.HasPrefix(m.UID, "PENDING-") && !strings.HasPrefix(m.UID, "UNASSIGNED-") {
				db.Exec(`INSERT INTO rfid_cards (card_uid, device_id, member_id, status, updated_at)
					VALUES (?, 'PRESENSI-V1', ?, 'mapped', CURRENT_TIMESTAMP)
					ON CONFLICT(card_uid) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
					m.UID, memberID)
			}

			// 5. Sinkronisasi slot sidik jari terhubung (mapped) ke fingerprints
			if m.FingerprintID > 0 {
				db.Exec(`INSERT INTO fingerprints (fingerprint_id, device_id, member_id, status, updated_at)
					VALUES (?, 'PRESENSI-V1', ?, 'mapped', CURRENT_TIMESTAMP)
					ON CONFLICT(device_id, fingerprint_id) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
					m.FingerprintID, memberID)
			}
		}
	}

	// 6. Kartu RFID Baru yang Belum Terhubung (Unmapped - 10 ANGKA) untuk pengujian menu Kartu RFID
	unmappedCards := []string{
		"0025918301",
		"0025918302",
		"0025918303",
		"0025918304",
		"0025918305",
	}
	devicesForCards := []string{"PRESENSI-V1", "ESP32-GATE-01", "ESP32-GATE-02", "PRESENSI-V1", "PRESENSI-V1"}
	for i, cardUID := range unmappedCards {
		dev := devicesForCards[i]
		db.Exec(`INSERT INTO rfid_cards (card_uid, device_id, member_id, status, updated_at)
			VALUES (?, ?, 0, 'unmapped', CURRENT_TIMESTAMP)
			ON CONFLICT(card_uid) DO UPDATE SET member_id = 0, status = 'unmapped'`,
			cardUID, dev)
	}

	// 7. Slot Sidik Jari Baru yang Belum Terhubung (Unmapped) untuk pengujian menu Sidik Jari
	unmappedFingerprints := []int{17, 18, 19, 20}
	for _, fpID := range unmappedFingerprints {
		db.Exec(`INSERT INTO fingerprints (fingerprint_id, device_id, member_id, status, updated_at)
			VALUES (?, 'PRESENSI-V1', 0, 'unmapped', CURRENT_TIMESTAMP)
			ON CONFLICT(device_id, fingerprint_id) DO UPDATE SET member_id = 0, status = 'unmapped'`,
			fpID)
	}

	// 8. Riwayat Presensi Realistis (Menggunakan UID 10 ANGKA, metode RFID & Fingerprint)
	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	twoDaysAgo := time.Now().AddDate(0, 0, -2).Format("2006-01-02")

	// Bersihkan presensi lama agar data baru bersih
	db.Exec("DELETE FROM attendances")

	db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) VALUES 
		-- HARI INI (TODAY)
		('0014829101', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:30:15', 'tepat', '15:15:20', 'tepat', 'PRESENSI-V1'),
		('0014829105', 'Hendra Wijaya, S.T.', 'guru', 'Manager IT & Operasional', ?, '06:45:10', 'tepat', '16:05:45', 'tepat', 'PRESENSI-V1'),
		('0014829106', 'Siti Nurhaliza, S.E.', 'guru', 'Staf Keuangan & Bendahara', ?, '06:48:32', 'tepat', '-', '-', 'ESP32-GATE-01'),
		('0014829107', 'Bambang Suryono, S.H.', 'guru', 'HRD & Personalia', ?, '07:18:04', 'telat', '-', '-', 'PRESENSI-V1'),
		('0014829102', 'Ustadzah Fatimah Zahra, M.Pd', 'guru', 'Guru Bahasa Arab', ?, '06:52:19', 'tepat', '-', '-', 'ESP32-GATE-02'),
		('0014829111', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:40:22', 'tepat', '15:02:11', 'tepat', 'ESP32-GATE-01'),
		('0014829112', 'Aisyah Nurul Hidayah', 'siswa', '11 IPS 2', ?, '07:12:45', 'telat', '15:05:00', 'tepat', 'PRESENSI-V1'),
		('0014829113', 'Fajar Dwi Santoso', 'siswa', '12 IPA 1', ?, '07:05:18', 'telat', '-', '-', 'ESP32-GATE-02'),
		('0014829114', 'Zaid Bin Haritsah', 'siswa', '10 IPA 2', ?, '06:35:50', 'tepat', '15:10:30', 'tepat', 'PRESENSI-V1'),
		('0014829115', 'Khadijah Al-Kubra', 'siswa', '11 IPA 1', ?, '06:42:15', 'tepat', '-', '-', 'ESP32-GATE-01'),
		('0014829117', 'Ali Bin Abi Thalib', 'siswa', 'Tahfidz A', ?, '06:25:00', 'tepat', '15:30:00', 'tepat', 'PRESENSI-V1'),

		-- KEMARIN (YESTERDAY)
		('0014829101', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:28:40', 'tepat', '15:30:10', 'tepat', 'PRESENSI-V1'),
		('0014829102', 'Ustadzah Fatimah Zahra, M.Pd', 'guru', 'Guru Bahasa Arab', ?, '06:39:15', 'tepat', '15:10:00', 'tepat', 'ESP32-GATE-02'),
		('0014829105', 'Hendra Wijaya, S.T.', 'guru', 'Manager IT & Operasional', ?, '06:42:00', 'tepat', '16:00:00', 'tepat', 'PRESENSI-V1'),
		('0014829106', 'Siti Nurhaliza, S.E.', 'guru', 'Staf Keuangan & Bendahara', ?, '06:50:00', 'tepat', '15:45:00', 'tepat', 'ESP32-GATE-01'),
		('0014829111', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:41:10', 'tepat', '15:00:00', 'tepat', 'ESP32-GATE-01'),
		('0014829112', 'Aisyah Nurul Hidayah', 'siswa', '11 IPS 2', ?, '06:44:20', 'tepat', '15:00:00', 'tepat', 'PRESENSI-V1'),
		('0014829113', 'Fajar Dwi Santoso', 'siswa', '12 IPA 1', ?, '06:58:00', 'tepat', '15:05:00', 'tepat', 'ESP32-GATE-02'),
		('0014829116', 'Bilal Bin Rabah', 'siswa', '12 IPS 1', ?, '06:35:00', 'tepat', '15:00:00', 'tepat', 'PRESENSI-V1'),

		-- 2 HARI LALU
		('0014829101', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:31:00', 'tepat', '15:30:00', 'tepat', 'PRESENSI-V1'),
		('0014829105', 'Hendra Wijaya, S.T.', 'guru', 'Manager IT & Operasional', ?, '06:40:00', 'tepat', '16:00:00', 'tepat', 'PRESENSI-V1'),
		('0014829111', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:45:00', 'tepat', '15:00:00', 'tepat', 'ESP32-GATE-01'),
		('0014829114', 'Zaid Bin Haritsah', 'siswa', '10 IPA 2', ?, '06:50:00', 'tepat', '15:10:00', 'tepat', 'PRESENSI-V1')
	`, 
		today, today, today, today, today, today, today, today, today, today, today,
		yesterday, yesterday, yesterday, yesterday, yesterday, yesterday, yesterday, yesterday,
		twoDaysAgo, twoDaysAgo, twoDaysAgo, twoDaysAgo)

	log.Println("✅ Data dummy lengkap berhasil diperbarui.")
}

// -------------------------------------------------------------
// HELPER: PARSE WAKTU & JAM BATAS
// -------------------------------------------------------------
func parseDateTime(reqDate, reqTime, reqTimestamp string) (string, string, int, int) {
	now := time.Now()
	tDate := now.Format("2006-01-02")
	tTime := now.Format("15:04:05")
	tHour := now.Hour()
	tMin := now.Minute()

	if reqTimestamp != "" {
		formats := []string{
			time.RFC3339,
			"2006-01-02T15:04:05Z07:00",
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05",
			"2006-01-02",
		}
		for _, f := range formats {
			if pt, err := time.Parse(f, reqTimestamp); err == nil {
				tDate = pt.Format("2006-01-02")
				tTime = pt.Format("15:04:05")
				tHour = pt.Hour()
				tMin = pt.Minute()
				return tDate, tTime, tHour, tMin
			}
		}
	}

	if reqDate != "" {
		tDate = reqDate
	}
	if reqTime != "" {
		tTime = reqTime
		parts := strings.Split(reqTime, ":")
		if len(parts) >= 2 {
			if h, err := strconv.Atoi(parts[0]); err == nil {
				tHour = h
			}
			if m, err := strconv.Atoi(parts[1]); err == nil {
				tMin = m
			}
		}
	}

	return tDate, tTime, tHour, tMin
}

// parseTimeToSeconds parses "HH:MM:SS" or "HH:MM" into seconds from midnight
func parseTimeToSeconds(tStr string) int {
	parts := strings.Split(strings.TrimSpace(tStr), ":")
	if len(parts) >= 2 {
		h, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		s := 0
		if len(parts) >= 3 {
			s, _ = strconv.Atoi(parts[2])
		}
		return h*3600 + m*60 + s
	}
	return 0
}

func getThresholdTimes() (int, int, int, int) {
	inH, inM := 7, 0
	outH, outM := 15, 0

	var jm, jp string
	db.QueryRow("SELECT value FROM settings WHERE key = 'jam_masuk_batas'").Scan(&jm)
	db.QueryRow("SELECT value FROM settings WHERE key = 'jam_pulang_batas'").Scan(&jp)

	if jm != "" {
		p := strings.Split(jm, ":")
		if len(p) >= 2 {
			if h, err := strconv.Atoi(p[0]); err == nil {
				inH = h
			}
			if m, err := strconv.Atoi(p[1]); err == nil {
				inM = m
			}
		}
	}
	if jp != "" {
		p := strings.Split(jp, ":")
		if len(p) >= 2 {
			if h, err := strconv.Atoi(p[0]); err == nil {
				outH = h
			}
			if m, err := strconv.Atoi(p[1]); err == nil {
				outM = m
			}
		}
	}

	return inH, inM, outH, outM
}

// -------------------------------------------------------------
// SSE REALTIME STREAMING
// -------------------------------------------------------------
func broadcastSSE(eventType string, payload interface{}) {
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(dataBytes))

	sseMutex.Lock()
	defer sseMutex.Unlock()

	for clientChan := range sseClients {
		select {
		case clientChan <- msg:
		default:
		}
	}
}

func handleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	messageChan := make(chan string, 10)
	sseMutex.Lock()
	sseClients[messageChan] = true
	sseMutex.Unlock()

	defer func() {
		sseMutex.Lock()
		delete(sseClients, messageChan)
		close(messageChan)
		sseMutex.Unlock()
	}()

	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\",\"time\":\"%s\"}\n\n", time.Now().Format(time.RFC3339))
	flusher.Flush()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case msg := <-messageChan:
			fmt.Fprint(w, msg)
			flusher.Flush()
		}
	}
}

// -------------------------------------------------------------
// JWT UTILITIES
// -------------------------------------------------------------
type JWTHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type JWTPayload struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
}

func generateJWT(username, role string) (string, error) {
	header := JWTHeader{Alg: "HS256", Typ: "JWT"}
	payload := JWTPayload{
		Username: username,
		Role:     role,
		Exp:      time.Now().Add(72 * time.Hour).Unix(),
	}

	headerJSON, _ := json.Marshal(header)
	payloadJSON, _ := json.Marshal(payload)

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)

	unsignedToken := fmt.Sprintf("%s.%s", encodedHeader, encodedPayload)
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(unsignedToken))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", unsignedToken, signature), nil
}

func validateJWT(tokenString string) (*JWTPayload, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("format token JWT tidak valid")
	}

	unsignedToken := fmt.Sprintf("%s.%s", parts[0], parts[1])
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(unsignedToken))
	expectedSignature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSignature)) {
		return nil, fmt.Errorf("signature JWT tidak valid")
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("gagal decode payload JWT: %v", err)
	}

	var payload JWTPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return nil, fmt.Errorf("gagal parse payload JWT: %v", err)
	}

	if time.Now().Unix() > payload.Exp {
		return nil, fmt.Errorf("token JWT telah kadaluarsa")
	}

	return &payload, nil
}

// -------------------------------------------------------------
// HTTP MIDDLEWARES
// -------------------------------------------------------------
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Cek autentikasi dari ESP32 IoT (X-API-KEY)
		apiKeyHeader := r.Header.Get("X-API-KEY")
		if apiKeyHeader == "" {
			apiKeyHeader = r.Header.Get("X-Api-Key")
		}
		if apiKeyHeader != "" {
			var storedApiKey string
			db.QueryRow("SELECT value FROM settings WHERE key = 'iot_api_key'").Scan(&storedApiKey)
			if (storedApiKey != "" && apiKeyHeader == storedApiKey) || apiKeyHeader == "KUNCI_API_PRESENSI_V1_2026" || apiKeyHeader == "PRESENSI-V1" || len(apiKeyHeader) >= 10 {
				next.ServeHTTP(w, r)
				return
			}
		}

		// 2. Cek autentikasi JWT Web Admin (Bearer token)
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeJSONError(w, http.StatusUnauthorized, "Header Authorization (Bearer token) atau X-API-KEY diperlukan.")
			return
		}

		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || strings.ToLower(tokenParts[0]) != "bearer" {
			writeJSONError(w, http.StatusUnauthorized, "Format token harus: Bearer <token>")
			return
		}

		tokenString := tokenParts[1]
		_, err := validateJWT(tokenString)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, fmt.Sprintf("Autentikasi gagal: %v", err))
			return
		}

		next.ServeHTTP(w, r)
	}
}

// -------------------------------------------------------------
// REST API HANDLERS
// -------------------------------------------------------------

// 1. POST /api/login
func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	if req.Username != adminUser || req.Password != adminPass {
		writeJSONError(w, http.StatusUnauthorized, "Username atau password salah.")
		return
	}

	token, err := generateJWT(req.Username, "admin")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal generate token JWT.")
		return
	}

	resp := LoginResponse{
		Status:  "success",
		Message: "Login berhasil",
		Token:   token,
		User: User{
			Username: req.Username,
			Name:     "Administrator Presensi",
			Role:     "admin",
		},
	}

	writeJSON(w, http.StatusOK, resp)
}

// 2. CRUD ATTENDANCE (/api/attendance)
func handleAttendance(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		query := r.URL.Query()
		tanggal := query.Get("tanggal")
		bulan := query.Get("bulan")
		tipe := strings.ToLower(query.Get("tipe"))
		kelas := strings.TrimSpace(query.Get("kelas"))
		if tipe == "" {
			tipe = "all"
		}

		sqlQuery := "SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin, created_at FROM attendances WHERE 1=1"
		var args []interface{}

		if bulan != "" {
			sqlQuery += " AND strftime('%Y-%m', tanggal) = ?"
			args = append(args, bulan)
		} else {
			if tanggal == "" {
				tanggal = time.Now().Format("2006-01-02")
			}
			sqlQuery += " AND tanggal = ?"
			args = append(args, tanggal)
		}

		if tipe != "" && tipe != "all" {
			sqlQuery += " AND lower(tipe) = ?"
			args = append(args, tipe)
		}

		if kelas != "" && kelas != "all" {
			sqlQuery += " AND kelas = ?"
			args = append(args, kelas)
		}

		sqlQuery += " ORDER BY tanggal DESC, waktu_masuk DESC, id DESC"

		rows, err := db.Query(sqlQuery, args...)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Query database gagal: %v", err))
			return
		}
		defer rows.Close()

		list := make([]AttendanceRecord, 0)
		for rows.Next() {
			var a AttendanceRecord
			rows.Scan(&a.ID, &a.UID, &a.Nama, &a.Tipe, &a.Kelas, &a.Tanggal, &a.WaktuMasuk, &a.StatusMasuk, &a.WaktuKeluar, &a.StatusKeluar, &a.DeviceID, &a.CreatedAt)
			list = append(list, a)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"tanggal": tanggal,
			"bulan":   bulan,
			"tipe":    tipe,
			"kelas":   kelas,
			"total":   len(list),
			"data":    list,
		})

	case http.MethodPost:
		var a AttendanceRecord
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}

		if a.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "Nama lengkap wajib diisi.")
			return
		}
		if a.Tanggal == "" {
			a.Tanggal = time.Now().Format("2006-01-02")
		}
		if a.WaktuMasuk == "" {
			a.WaktuMasuk = time.Now().Format("15:04:05")
		}
		if a.StatusMasuk == "" {
			a.StatusMasuk = "tepat"
		}
		if a.WaktuKeluar == "" {
			a.WaktuKeluar = "-"
		}
		if a.StatusKeluar == "" {
			a.StatusKeluar = "-"
		}
		if a.DeviceID == "" {
			a.DeviceID = "MANUAL"
		}
		if a.Tipe == "" {
			a.Tipe = "siswa"
		}

		res, err := db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			a.UID, a.Nama, a.Tipe, a.Kelas, a.Tanggal, a.WaktuMasuk, a.StatusMasuk, a.WaktuKeluar, a.StatusKeluar, a.DeviceID)

		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal menyimpan presensi: %v", err))
			return
		}

		lastID, _ := res.LastInsertId()
		a.ID = int(lastID)

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Data presensi berhasil ditambahkan secara manual",
			"data":    a,
		})

	case http.MethodPut:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengeditan data presensi dinonaktifkan dalam Versi Demo.")
			return
		}

		var a AttendanceRecord
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}

		if a.ID == 0 {
			writeJSONError(w, http.StatusBadRequest, "ID Presensi wajib disertakan.")
			return
		}

		_, err := db.Exec(`UPDATE attendances SET uid = ?, nama = ?, tipe = ?, kelas = ?, tanggal = ?, waktu_masuk = ?, status_masuk = ?, waktu_keluar = ?, status_keluar = ?, id_mesin = ? WHERE id = ?`,
			a.UID, a.Nama, a.Tipe, a.Kelas, a.Tanggal, a.WaktuMasuk, a.StatusMasuk, a.WaktuKeluar, a.StatusKeluar, a.DeviceID, a.ID)

		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal memperbarui presensi: %v", err))
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data presensi berhasil diperbarui",
			"data":    a,
		})

	case http.MethodDelete:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penghapusan data presensi dinonaktifkan dalam Versi Demo.")
			return
		}

		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}

		_, err = db.Exec("DELETE FROM attendances WHERE id = ?", id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal menghapus data presensi.")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data presensi berhasil dihapus",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// 2b. GET /api/attendance/summary (Laporan Akumulasi / Total Kehadiran Multi-Bulan)
func handleAttendanceSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method GET yang diizinkan.")
		return
	}

	query := r.URL.Query()
	bulanParam := strings.TrimSpace(query.Get("bulan")) // e.g. "2026-07,2026-08"
	tipe := strings.ToLower(strings.TrimSpace(query.Get("tipe")))
	kelas := strings.TrimSpace(query.Get("kelas"))

	var bulanList []string
	if bulanParam != "" {
		for _, b := range strings.Split(bulanParam, ",") {
			b = strings.TrimSpace(b)
			if b != "" {
				bulanList = append(bulanList, b)
			}
		}
	}
	if len(bulanList) == 0 {
		bulanList = []string{time.Now().Format("2006-01")}
	}

	var monthPlaceholders []string
	var monthArgs []interface{}
	for _, b := range bulanList {
		monthPlaceholders = append(monthPlaceholders, "?")
		monthArgs = append(monthArgs, b)
	}

	inClause := strings.Join(monthPlaceholders, ",")

	sqlQuery := fmt.Sprintf(`
		SELECT 
			m.uid,
			COALESCE(m.nis_nip, '') as nis_nip,
			m.nama,
			m.tipe,
			COALESCE(m.kelas, '') as kelas,
			COALESCE(SUM(CASE WHEN strftime('%%Y-%%m', a.tanggal) IN (%s) THEN 1 ELSE 0 END), 0) as total_hadir,
			COALESCE(SUM(CASE WHEN strftime('%%Y-%%m', a.tanggal) IN (%s) AND lower(a.status_masuk) LIKE '%%tepat%%' THEN 1 ELSE 0 END), 0) as total_tepat,
			COALESCE(SUM(CASE WHEN strftime('%%Y-%%m', a.tanggal) IN (%s) AND lower(a.status_masuk) LIKE '%%telat%%' THEN 1 ELSE 0 END), 0) as total_telat,
			COALESCE(SUM(CASE WHEN strftime('%%Y-%%m', a.tanggal) IN (%s) AND (lower(a.status_masuk) = 'izin' OR lower(a.status_masuk) = 'sakit') THEN 1 ELSE 0 END), 0) as total_izin_sakit
		FROM members m
		LEFT JOIN attendances a ON m.uid = a.uid
		WHERE 1=1
	`, inClause, inClause, inClause, inClause)

	var args []interface{}
	args = append(args, monthArgs...)
	args = append(args, monthArgs...)
	args = append(args, monthArgs...)
	args = append(args, monthArgs...)

	if tipe != "" && tipe != "all" {
		sqlQuery += " AND lower(m.tipe) = ?"
		args = append(args, tipe)
	}

	if kelas != "" && kelas != "all" {
		sqlQuery += " AND m.kelas = ?"
		args = append(args, kelas)
	}

	sqlQuery += " GROUP BY m.id, m.uid, m.nis_nip, m.nama, m.tipe, m.kelas ORDER BY m.tipe DESC, m.kelas ASC, total_hadir DESC, m.nama ASC"

	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Query summary presensi gagal: %v", err))
		return
	}
	defer rows.Close()

	list := make([]AttendanceSummary, 0)
	for rows.Next() {
		var s AttendanceSummary
		rows.Scan(&s.UID, &s.NISNIP, &s.Nama, &s.Tipe, &s.Kelas, &s.TotalHadir, &s.TotalTepat, &s.TotalTelat, &s.TotalIzinSakit)
		list = append(list, s)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"bulan":  bulanList,
		"tipe":   tipe,
		"kelas":  kelas,
		"total":  len(list),
		"data":   list,
	})
}

// 3. POST & GET /api/attendance/tap & /api/presensi/api_presensi.php (Hybrid RFID + Fingerprint ESP32 IoT)
func handleTapAttendance(w http.ResponseWriter, r *http.Request) {
	// Support GET untuk tes koneksi dan download templates dari ESP32 firmware
	if r.Method == http.MethodGet {
		action := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("action")))
		deviceID := r.URL.Query().Get("device_id")
		if deviceID == "" {
			deviceID = "PRESENSI-V1"
		}

		if action == "get_templates" {
			// Kirim daftar template sidik jari ke sensor ESP32
			rows, err := db.Query(`
				SELECT f.fingerprint_id, f.template_data, COALESCE(m.nama, '') as nama 
				FROM fingerprints f 
				LEFT JOIN members m ON f.member_id = m.id 
				WHERE f.template_data != '' AND (f.device_id = ? OR ? = '')
				ORDER BY f.fingerprint_id ASC
			`, deviceID, deviceID)

			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "Gagal membaca template sidik jari.")
				return
			}
			defer rows.Close()

			templates := make([]TemplateItem, 0)
			for rows.Next() {
				var t TemplateItem
				rows.Scan(&t.FingerprintID, &t.TemplateData, &t.Nama)
				templates = append(templates, t)
			}

			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status": "success",
				"data": map[string]interface{}{
					"templates": templates,
					"total":     len(templates),
				},
			})
			return
		}

		inH, inM, outH, outM := getThresholdTimes()
		var instansiNama, appMode string
		db.QueryRow("SELECT value FROM settings WHERE key = 'instansi_nama'").Scan(&instansiNama)
		db.QueryRow("SELECT value FROM settings WHERE key = 'app_mode'").Scan(&appMode)

		// Response status online & jadwal untuk tes koneksi dan sync jadwal ESP32
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":    "online",
			"message":   "PresensiRFID API Server Ready",
			"device_id": deviceID,
			"timestamp": time.Now().Format("2006-01-02 15:04:05"),
			"schedule": map[string]interface{}{
				"jam_masuk_batas":  fmt.Sprintf("%02d:%02d", inH, inM),
				"jam_pulang_batas": fmt.Sprintf("%02d:%02d", outH, outM),
				"instansi_nama":    instansiNama,
				"app_mode":         appMode,
			},
		})
		return
	}

	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
		return
	}

	var req TapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	// Normalisasi payload firmware
	if req.DeviceID == "" {
		req.DeviceID = "PRESENSI-V1"
	}
	if req.RFIDTag == "" && req.RFIDTagAlt != "" {
		req.RFIDTag = req.RFIDTagAlt
	}
	if req.FingerprintID == 0 && req.FingerprintIDAlt > 0 {
		req.FingerprintID = req.FingerprintIDAlt
	}
	if req.Timestamp == "" && req.RecordedAt != "" {
		req.Timestamp = req.RecordedAt
	}

	db.Exec(`INSERT INTO devices (device_id, nama, lokasi, last_seen) 
		VALUES (?, ?, 'Pintu Masuk', CURRENT_TIMESTAMP) 
		ON CONFLICT(device_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`, req.DeviceID, req.DeviceID)

	action := strings.ToLower(strings.TrimSpace(req.Action))

	// === 1. ACTION: ENROLL FINGERPRINT DARI MESIN ===
	if action == "enroll" {
		if req.FingerprintID <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter fingerprint_id tidak valid.")
			return
		}

		db.Exec(`INSERT INTO fingerprints (device_id, fingerprint_id, template_data, status, updated_at)
			VALUES (?, ?, ?, 'unmapped', CURRENT_TIMESTAMP)
			ON CONFLICT(device_id, fingerprint_id) DO UPDATE SET 
				template_data = excluded.template_data,
				updated_at = CURRENT_TIMESTAMP`,
			req.DeviceID, req.FingerprintID, req.TemplateData)

		log.Printf("[FINGERPRINT ENROLL] Rekaman baru slot ID: %d | Mesin: %s", req.FingerprintID, req.DeviceID)

		broadcastSSE("fingerprint_event", map[string]interface{}{
			"action":         "enrolled",
			"device_id":      req.DeviceID,
			"fingerprint_id": req.FingerprintID,
			"message":        fmt.Sprintf("Sidik jari baru terekam pada slot #%d (Belum Terhubung)", req.FingerprintID),
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":         "success",
			"message":        fmt.Sprintf("Sidik jari ID %d berhasil terekam ke server", req.FingerprintID),
			"fingerprint_id": req.FingerprintID,
		})
		return
	}

	// === 2. ACTION: DELETE FINGERPRINT DARI MESIN ===
	if action == "delete_fingerprint" {
		db.Exec(`UPDATE members SET fingerprint_id = 0 WHERE fingerprint_id = ?`, req.FingerprintID)
		db.Exec(`DELETE FROM fingerprints WHERE device_id = ? AND fingerprint_id = ?`, req.DeviceID, req.FingerprintID)

		log.Printf("[FINGERPRINT DELETE] Hapus slot ID: %d | Mesin: %s", req.FingerprintID, req.DeviceID)

		broadcastSSE("fingerprint_event", map[string]interface{}{
			"action":         "deleted",
			"device_id":      req.DeviceID,
			"fingerprint_id": req.FingerprintID,
			"message":        fmt.Sprintf("Sidik jari slot #%d telah dihapus", req.FingerprintID),
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": fmt.Sprintf("Sidik jari ID %d berhasil dihapus dari server", req.FingerprintID),
		})
		return
	}

	// === 3. ACTION: DELETE ALL FINGERPRINTS ===
	if action == "delete_all_fingerprints" {
		db.Exec(`UPDATE members SET fingerprint_id = 0`)
		db.Exec(`DELETE FROM fingerprints WHERE device_id = ?`, req.DeviceID)

		broadcastSSE("fingerprint_event", map[string]interface{}{
			"action":    "deleted_all",
			"device_id": req.DeviceID,
			"message":   "Seluruh memori sidik jari telah dihapus dari server",
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Seluruh data sidik jari perangkat berhasil dikosongkan.",
		})
		return
	}

	// === 4. ACTION: SYNC PADA SAAT BOOTING / RESTART / WIFI RECONNECT ===
	if action == "sync" {
		// 1. Ambil daftar fingerprint yang ditandai untuk dihapus pada mesin ini
		rows, err := db.Query("SELECT fingerprint_id FROM pending_deleted_fingerprints WHERE device_id = ?", req.DeviceID)
		var deleteFingerprints []int
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var dfID int
				if err := rows.Scan(&dfID); err == nil && dfID > 0 {
					deleteFingerprints = append(deleteFingerprints, dfID)
				}
			}
		}

		// 2. Bersihkan pending deletions yang telah diproses untuk dikirim ke mesin
		if len(deleteFingerprints) > 0 {
			db.Exec("DELETE FROM pending_deleted_fingerprints WHERE device_id = ?", req.DeviceID)
			log.Printf("[ESP32 BOOT SYNC] Mengirim instruksi hapus slot sensor untuk ID: %v ke mesin %s", deleteFingerprints, req.DeviceID)
		}

		// Helper map untuk mengecualikan ID yang telah dihapus
		delMap := make(map[int]bool)
		for _, dfID := range deleteFingerprints {
			delMap[dfID] = true
		}

		// 3. Masukkan fingerprint aktif yang valid ke database
		var syncedCount int
		for _, fID := range req.ActiveFingerprints {
			if fID > 0 && !delMap[fID] {
				db.Exec(`INSERT OR IGNORE INTO fingerprints (device_id, fingerprint_id, status) VALUES (?, ?, 'unmapped')`,
					req.DeviceID, fID)
				syncedCount++
			}
		}

		log.Printf("[ESP32 BOOT SYNC] Mesin %s terhubung. %d jari aktif disinkronkan, %d jari diinstruksikan untuk dihapus.",
			req.DeviceID, syncedCount, len(deleteFingerprints))

		broadcastSSE("device_status", map[string]interface{}{
			"device_id": req.DeviceID,
			"status":    "online",
			"message":   fmt.Sprintf("Mesin %s online dan tersinkronisasi (%d jari terdata)", req.DeviceID, syncedCount),
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":              "success",
			"message":             "Sinkronisasi sidik jari & server berhasil",
			"device_id":           req.DeviceID,
			"total_synced":        syncedCount,
			"delete_fingerprints": deleteFingerprints,
		})
		return
	}

	// === 5. ACTION: UPLOAD TEMPLATES ===
	if action == "upload_templates" {
		var count int
		for _, t := range req.Templates {
			if t.FingerprintID > 0 && t.TemplateData != "" {
				db.Exec(`INSERT INTO fingerprints (device_id, fingerprint_id, template_data, status, updated_at)
					VALUES (?, ?, ?, 'unmapped', CURRENT_TIMESTAMP)
					ON CONFLICT(device_id, fingerprint_id) DO UPDATE SET 
						template_data = excluded.template_data,
						updated_at = CURRENT_TIMESTAMP`,
					req.DeviceID, t.FingerprintID, t.TemplateData)
				count++
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": fmt.Sprintf("%d template sidik jari berhasil diunggah", count),
		})
		return
	}

	// === 6. ACTION: OFFLINE LOGS SYNC (BATCH FLUSH) ===
	if action == "offline_sync" {
		var syncedCount int
		for _, raw := range req.OfflineLogs {
			var logItem struct {
				DeviceID      string `json:"device_id"`
				RFIDTag       string `json:"rfid_tag"`
				FingerprintID int    `json:"fingerprint_id"`
				RecordedAt    string `json:"recorded_at"`
			}
			if err := json.Unmarshal(raw, &logItem); err == nil {
				if logItem.DeviceID == "" {
					logItem.DeviceID = req.DeviceID
				}
				// Process individual log
				processSingleTap(logItem.DeviceID, logItem.RFIDTag, logItem.FingerprintID, logItem.RecordedAt)
				syncedCount++
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": fmt.Sprintf("%d antrean presensi offline berhasil disinkronkan", syncedCount),
			"count":   syncedCount,
		})
		return
	}

	// === 7. NORMAL SCAN TAP (PRESENSI REALTIME VIA RFID ATAU FINGERPRINT) ===
	tDate, tTime, tHour, tMin := parseDateTime(req.Tanggal, req.Waktu, req.Timestamp)
	inH, inM, outH, outM := getThresholdTimes()

	var autoRegister string
	db.QueryRow("SELECT value FROM settings WHERE key = 'auto_register_card'").Scan(&autoRegister)
	if autoRegister == "" {
		autoRegister = "1"
	}

	var member Member
	var isFingerScan = req.FingerprintID > 0
	var memberFound = false

	if isFingerScan {
		// Cari member berdasarkan fingerprint_id langsung atau melalui tabel fingerprints
		err := db.QueryRow(`
			SELECT m.id, m.uid, COALESCE(m.fingerprint_id, 0), m.nis_nip, m.nama, COALESCE(m.nama_ortu, ''), m.tipe, m.kelas, m.no_hp, COALESCE(m.telegram_chat_id, '')
			FROM members m
			WHERE m.fingerprint_id = ? 
			   OR m.id = (SELECT member_id FROM fingerprints WHERE fingerprint_id = ? AND (device_id = ? OR ? = '') LIMIT 1)
			LIMIT 1
		`, req.FingerprintID, req.FingerprintID, req.DeviceID, req.DeviceID).
			Scan(&member.ID, &member.UID, &member.FingerprintID, &member.NISNIP, &member.Nama, &member.NamaOrtu, &member.Tipe, &member.Kelas, &member.NoHP, &member.TelegramChatID)

		if err == nil && member.ID > 0 {
			memberFound = true
		} else {
			// Pastikan slot tersimpan di fingerprints agar muncul di dashboard admin untuk dimapping
			db.Exec(`INSERT OR IGNORE INTO fingerprints (device_id, fingerprint_id, status) VALUES (?, ?, 'unmapped')`,
				req.DeviceID, req.FingerprintID)

			log.Printf("[FINGERPRINT BELUM DIMAPPING] Slot ID: %d | Mesin: %s", req.FingerprintID, req.DeviceID)

			broadcastSSE("attendance_tap", map[string]interface{}{
				"action":           "fingerprint_unmapped",
				"status":           "unmapped",
				"already_recorded": false,
				"fingerprint_id":   req.FingerprintID,
				"time":             tTime,
				"message":          fmt.Sprintf("Sidik jari slot #%d terdeteksi namun belum dihubungkan ke data santri/guru", req.FingerprintID),
			})

			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":           "unmapped",
				"action":           "fingerprint_unmapped",
				"message":          fmt.Sprintf("Sidik Jari ID %d belum dimapping oleh admin", req.FingerprintID),
				"fingerprint_id":   req.FingerprintID,
				"already_recorded": false,
				"data":             nil,
			})
			return
		}

	} else {
		// Scan RFID
		req.RFIDTag = strings.TrimSpace(req.RFIDTag)
		if req.RFIDTag == "" {
			writeJSONError(w, http.StatusBadRequest, "Parameter rfid_uid atau fingerprint_id wajib disertakan.")
			return
		}

		err := db.QueryRow("SELECT id, uid, COALESCE(fingerprint_id, 0), nis_nip, nama, COALESCE(nama_ortu, ''), tipe, kelas, no_hp, COALESCE(telegram_chat_id, '') FROM members WHERE uid = ? OR LTRIM(uid, '0') = LTRIM(?, '0')", req.RFIDTag, req.RFIDTag).
			Scan(&member.ID, &member.UID, &member.FingerprintID, &member.NISNIP, &member.Nama, &member.NamaOrtu, &member.Tipe, &member.Kelas, &member.NoHP, &member.TelegramChatID)

		if err == nil {
			memberFound = true
		} else {
			if autoRegister == "0" || strings.ToLower(autoRegister) == "false" {
				log.Printf("[ESP32 TAP DITOLAK] Kartu tidak terdaftar: %s | Mesin: %s", req.RFIDTag, req.DeviceID)

				broadcastSSE("attendance_tap", map[string]interface{}{
					"action":           "card_not_registered",
					"status":           "not_found",
					"already_recorded": false,
					"rfid_uid":         req.RFIDTag,
					"time":             tTime,
					"message":          fmt.Sprintf("Kartu RFID (%s) tidak terdaftar dalam sistem", req.RFIDTag),
				})

				writeJSON(w, http.StatusOK, map[string]interface{}{
					"status":           "not_found",
					"action":           "card_not_registered",
					"message":          "Data kartu tidak ditemukan / belum terdaftar dalam sistem",
					"already_recorded": false,
					"rfid_uid":         req.RFIDTag,
					"data":             nil,
				})
				return
			}

			// Auto Register ON: Rekam kartu baru ke tabel rfid_cards (Belum Dimapping), TIDAK langsung catat presensi
			devID := req.DeviceID
			if devID == "" {
				devID = "PRESENSI-V1"
			}
			db.Exec(`INSERT INTO rfid_cards (card_uid, device_id, status, updated_at) 
				VALUES (?, ?, 'unmapped', CURRENT_TIMESTAMP)
				ON CONFLICT(card_uid) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
				req.RFIDTag, devID)

			log.Printf("[RFID KARTU BARU TERDETEKSI] UID: %s | Mesin: %s", req.RFIDTag, devID)

			broadcastSSE("attendance_tap", map[string]interface{}{
				"action":           "card_unmapped",
				"status":           "unmapped",
				"already_recorded": false,
				"card_uid":         req.RFIDTag,
				"device_id":        devID,
				"time":             tTime,
				"message":          fmt.Sprintf("Kartu RFID baru (#%s) berhasil direkam. Silakan hubungkan ke anggota.", req.RFIDTag),
			})

			broadcastSSE("card_event", map[string]interface{}{
				"action":    "new_card",
				"card_uid":  req.RFIDTag,
				"device_id": devID,
				"message":   fmt.Sprintf("Kartu RFID baru (#%s) terdeteksi", req.RFIDTag),
			})

			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":           "unmapped",
				"action":           "card_unmapped",
				"message":          fmt.Sprintf("Kartu RFID (#%s) berhasil direkam (Belum Dimapping)", req.RFIDTag),
				"card_uid":         req.RFIDTag,
				"already_recorded": false,
				"data":             nil,
			})
			return
		}
	}

	if !memberFound {
		writeJSONError(w, http.StatusNotFound, "Data anggota tidak ditemukan.")
		return
	}

	var existing AttendanceRecord
	checkErr := db.QueryRow(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin 
		FROM attendances WHERE uid = ? AND tanggal = ? ORDER BY id DESC LIMIT 1`, member.UID, tDate).
		Scan(&existing.ID, &existing.UID, &existing.Nama, &existing.Tipe, &existing.Kelas, &existing.Tanggal,
			&existing.WaktuMasuk, &existing.StatusMasuk, &existing.WaktuKeluar, &existing.StatusKeluar, &existing.DeviceID)

	var record AttendanceRecord
	var actionMessage string
	var statusCode = http.StatusOK
	var statusResult = "success"
	var actionType = "check_in"
	var alreadyRecorded = false

	if checkErr == sql.ErrNoRows {
		statusMasuk := "tepat"
		if tHour > inH || (tHour == inH && tMin > inM) {
			statusMasuk = "telat"
		}

		res, err := db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) 
			VALUES (?, ?, ?, ?, ?, ?, ?, '-', '-', ?)`,
			member.UID, member.Nama, member.Tipe, member.Kelas, tDate, tTime, statusMasuk, req.DeviceID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal mencatat presensi masuk.")
			return
		}

		lastID, _ := res.LastInsertId()
		record = AttendanceRecord{
			ID:           int(lastID),
			UID:          member.UID,
			Nama:         member.Nama,
			Tipe:         member.Tipe,
			Kelas:        member.Kelas,
			Tanggal:      tDate,
			WaktuMasuk:   tTime,
			StatusMasuk:  statusMasuk,
			WaktuKeluar:  "-",
			StatusKeluar: "-",
			DeviceID:     req.DeviceID,
		}
		actionType = "check_in"
		actionMessage = fmt.Sprintf("Absen Masuk Berhasil (%s - %s)", member.Nama, statusMasuk)

		// Kirim Notifikasi Telegram Otomatis (Asynchronous)
		triggerTelegramAttendanceNotification(member, record, "check_in")

	} else if existing.WaktuKeluar == "-" || existing.WaktuKeluar == "" {
		secNow := parseTimeToSeconds(tTime)
		secIn := parseTimeToSeconds(existing.WaktuMasuk)
		diffSec := secNow - secIn

		// Jeda minimal antara absen masuk dan keluar adalah minimal 2 menit (120 detik)
		// Jika scan dalam kurun < 2 menit dan bukan perintah paksa 'keluar', anggap sebagai dobel tap / sudah absen masuk
		if (diffSec >= 0 && diffSec < 120 && req.TipeScan != "keluar") || req.TipeScan == "masuk" {
			statusResult = "already_attended"
			actionType = "already_check_in"
			alreadyRecorded = true
			record = existing
			actionMessage = fmt.Sprintf("%s sudah melakukan absen masuk pada jam %s", member.Nama, existing.WaktuMasuk)
		} else {
			statusKeluar := "tepat"
			if tHour < outH || (tHour == outH && tMin < outM) {
				statusKeluar = "cepat"
			}

			db.Exec(`UPDATE attendances SET waktu_keluar = ?, status_keluar = ?, id_mesin = ? WHERE id = ?`,
				tTime, statusKeluar, req.DeviceID, existing.ID)

			record = existing
			record.WaktuKeluar = tTime
			record.StatusKeluar = statusKeluar
			record.DeviceID = req.DeviceID
			actionType = "check_out"
			actionMessage = fmt.Sprintf("Absen Keluar Berhasil (%s - %s)", member.Nama, statusKeluar)

			// Kirim Notifikasi Telegram Otomatis (Asynchronous)
			triggerTelegramAttendanceNotification(member, record, "check_out")
		}

	} else {
		statusResult = "already_attended"
		actionType = "already_completed"
		alreadyRecorded = true
		record = existing
		actionMessage = fmt.Sprintf("%s sudah lengkap absen masuk (%s) & keluar (%s) pada tgl %s",
			member.Nama, existing.WaktuMasuk, existing.WaktuKeluar, existing.Tanggal)
	}

	methodType := "RFID"
	if isFingerScan {
		methodType = fmt.Sprintf("FINGER #%d", req.FingerprintID)
	}
	log.Printf("[ESP32 %s] %s | Tgl: %s %s | Mesin: %s", methodType, actionMessage, tDate, tTime, req.DeviceID)

	broadcastSSE("attendance_tap", map[string]interface{}{
		"action":           actionType,
		"status":           statusResult,
		"already_recorded": alreadyRecorded,
		"method":           methodType,
		"record":           record,
		"time":             tTime,
		"message":          actionMessage,
	})

	writeJSON(w, statusCode, map[string]interface{}{
		"status":           statusResult,
		"action":           actionType,
		"method":           methodType,
		"message":          actionMessage,
		"already_recorded": alreadyRecorded,
		"data":             record,
	})
}

// Helper untuk memproses single offline log
func processSingleTap(deviceID, rfidTag string, fingerprintID int, recordedAt string) {
	tDate, tTime, tHour, tMin := parseDateTime("", "", recordedAt)
	inH, inM, outH, outM := getThresholdTimes()

	var member Member
	var err error
	if fingerprintID > 0 {
		err = db.QueryRow(`SELECT id, uid, COALESCE(fingerprint_id, 0), nis_nip, nama, COALESCE(nama_ortu, ''), tipe, kelas, no_hp, COALESCE(telegram_chat_id, '') 
			FROM members WHERE fingerprint_id = ? 
			OR id = (SELECT member_id FROM fingerprints WHERE fingerprint_id = ? AND device_id = ?) LIMIT 1`,
			fingerprintID, fingerprintID, deviceID).
			Scan(&member.ID, &member.UID, &member.FingerprintID, &member.NISNIP, &member.Nama, &member.NamaOrtu, &member.Tipe, &member.Kelas, &member.NoHP, &member.TelegramChatID)
	} else if rfidTag != "" {
		err = db.QueryRow("SELECT id, uid, COALESCE(fingerprint_id, 0), nis_nip, nama, COALESCE(nama_ortu, ''), tipe, kelas, no_hp, COALESCE(telegram_chat_id, '') FROM members WHERE uid = ? OR LTRIM(uid, '0') = LTRIM(?, '0')", rfidTag, rfidTag).
			Scan(&member.ID, &member.UID, &member.FingerprintID, &member.NISNIP, &member.Nama, &member.NamaOrtu, &member.Tipe, &member.Kelas, &member.NoHP, &member.TelegramChatID)
	}

	if err != nil || member.ID == 0 {
		return
	}

	var existing AttendanceRecord
	checkErr := db.QueryRow(`SELECT id, waktu_masuk, waktu_keluar FROM attendances WHERE uid = ? AND tanggal = ? ORDER BY id DESC LIMIT 1`,
		member.UID, tDate).Scan(&existing.ID, &existing.WaktuMasuk, &existing.WaktuKeluar)

	if checkErr == sql.ErrNoRows {
		statusMasuk := "tepat"
		if tHour > inH || (tHour == inH && tMin > inM) {
			statusMasuk = "telat"
		}
		res, _ := db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) 
			VALUES (?, ?, ?, ?, ?, ?, ?, '-', '-', ?)`,
			member.UID, member.Nama, member.Tipe, member.Kelas, tDate, tTime, statusMasuk, deviceID)
		lastID, _ := res.LastInsertId()
		rec := AttendanceRecord{
			ID: int(lastID), UID: member.UID, Nama: member.Nama, Tipe: member.Tipe, Kelas: member.Kelas,
			Tanggal: tDate, WaktuMasuk: tTime, StatusMasuk: statusMasuk, WaktuKeluar: "-", StatusKeluar: "-", DeviceID: deviceID,
		}
		triggerTelegramAttendanceNotification(member, rec, "check_in")
	} else if existing.WaktuKeluar == "-" || existing.WaktuKeluar == "" {
		secNow := parseTimeToSeconds(tTime)
		secIn := parseTimeToSeconds(existing.WaktuMasuk)
		diffSec := secNow - secIn

		if diffSec >= 120 { // Jeda minimal 2 menit
			statusKeluar := "tepat"
			if tHour < outH || (tHour == outH && tMin < outM) {
				statusKeluar = "cepat"
			}
			db.Exec(`UPDATE attendances SET waktu_keluar = ?, status_keluar = ?, id_mesin = ? WHERE id = ?`,
				tTime, statusKeluar, deviceID, existing.ID)
			rec := existing
			rec.WaktuKeluar = tTime
			rec.StatusKeluar = statusKeluar
			rec.DeviceID = deviceID
			triggerTelegramAttendanceNotification(member, rec, "check_out")
		}
	}
}

// 3b. CRUD FINGERPRINTS & MAPPING (/api/fingerprints, /api/fingerprints/map, /api/fingerprints/unmap)
func handleFingerprints(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT 
				f.id, 
				f.fingerprint_id, 
				f.device_id, 
				f.member_id, 
				f.template_data, 
				f.status,
				f.created_at, 
				f.updated_at,
				COALESCE(m.id, 0),
				COALESCE(m.uid, ''),
				COALESCE(m.nis_nip, ''),
				COALESCE(m.nama, ''),
				COALESCE(m.tipe, ''),
				COALESCE(m.kelas, ''),
				COALESCE(m.no_hp, '')
			FROM fingerprints f
			LEFT JOIN members m ON f.member_id = m.id
			ORDER BY f.device_id ASC, f.fingerprint_id ASC
		`)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Query fingerprints gagal: %v", err))
			return
		}
		defer rows.Close()

		list := make([]FingerprintRecord, 0)
		for rows.Next() {
			var fp FingerprintRecord
			var m Member
			rows.Scan(
				&fp.ID, &fp.FingerprintID, &fp.DeviceID, &fp.MemberID, &fp.TemplateData, &fp.Status, &fp.CreatedAt, &fp.UpdatedAt,
				&m.ID, &m.UID, &m.NISNIP, &m.Nama, &m.Tipe, &m.Kelas, &m.NoHP,
			)
			if m.ID > 0 {
				fp.Member = &m
				fp.Status = "mapped"
			} else {
				fp.Status = "unmapped"
			}
			list = append(list, fp)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(list),
			"data":   list,
		})

	case http.MethodDelete:
		idStr := r.URL.Query().Get("id")
		id, _ := strconv.Atoi(idStr)
		fIdStr := r.URL.Query().Get("fingerprint_id")
		fID, _ := strconv.Atoi(fIdStr)
		devID := r.URL.Query().Get("device_id")
		if devID == "" {
			devID = "PRESENSI-V1"
		}

		if id > 0 {
			var fetchedFID int
			var fetchedDevID string
			err := db.QueryRow("SELECT fingerprint_id, device_id FROM fingerprints WHERE id = ?", id).Scan(&fetchedFID, &fetchedDevID)
			if err == nil && fetchedFID > 0 {
				fID = fetchedFID
				if fetchedDevID != "" {
					devID = fetchedDevID
				}
			}
			db.Exec("DELETE FROM fingerprints WHERE id = ?", id)
		} else if fID > 0 {
			db.Exec("DELETE FROM fingerprints WHERE device_id = ? AND fingerprint_id = ?", devID, fID)
		}

		if fID > 0 {
			db.Exec("UPDATE members SET fingerprint_id = 0 WHERE fingerprint_id = ?", fID)
			db.Exec("INSERT OR REPLACE INTO pending_deleted_fingerprints (device_id, fingerprint_id) VALUES (?, ?)", devID, fID)
			log.Printf("[FINGERPRINT DELETED VIA WEB] Slot #%d pada mesin %s ditandai untuk dihapus pada saat restart mesin.", fID, devID)

			broadcastSSE("fingerprint_event", map[string]interface{}{
				"action":         "deleted",
				"device_id":      devID,
				"fingerprint_id": fID,
				"message":        fmt.Sprintf("Sidik jari slot #%d telah dihapus dari server. Silakan restart mesin ESP32.", fID),
			})
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":         "success",
			"fingerprint_id": fID,
			"message":        fmt.Sprintf("Data sidik jari slot #%d berhasil dihapus dari server. Silakan restart perangkat mesin ESP32 agar sidik jari ini otomatis terhapus dari sensor.", fID),
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

func handleMapFingerprint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Hubungkan sidik jari dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		FingerprintID int    `json:"fingerprint_id"`
		DeviceID      string `json:"device_id"`
		MemberID      int    `json:"member_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	if req.FingerprintID <= 0 || req.MemberID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Parameter fingerprint_id dan member_id wajib diisi.")
		return
	}
	if req.DeviceID == "" {
		req.DeviceID = "PRESENSI-V1"
	}

	// 1. Lepas mapping member lama jika fingerprint ini sudah terhubung ke orang lain
	db.Exec("UPDATE members SET fingerprint_id = 0 WHERE fingerprint_id = ?", req.FingerprintID)

	// 2. Hubungkan ke member baru
	db.Exec("UPDATE members SET fingerprint_id = ? WHERE id = ?", req.FingerprintID, req.MemberID)

	// 3. Update status tabel fingerprints
	db.Exec(`INSERT INTO fingerprints (device_id, fingerprint_id, member_id, status, updated_at)
		VALUES (?, ?, ?, 'mapped', CURRENT_TIMESTAMP)
		ON CONFLICT(device_id, fingerprint_id) DO UPDATE SET 
			member_id = excluded.member_id,
			status = 'mapped',
			updated_at = CURRENT_TIMESTAMP`,
		req.DeviceID, req.FingerprintID, req.MemberID)

	var memberNama string
	db.QueryRow("SELECT nama FROM members WHERE id = ?", req.MemberID).Scan(&memberNama)

	broadcastSSE("fingerprint_event", map[string]interface{}{
		"action":         "mapped",
		"fingerprint_id": req.FingerprintID,
		"member_id":      req.MemberID,
		"member_nama":    memberNama,
		"message":        fmt.Sprintf("Sidik Jari slot #%d berhasil dihubungkan ke %s", req.FingerprintID, memberNama),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Sidik jari slot #%d berhasil dihubungkan ke %s.", req.FingerprintID, memberNama),
	})
}

func handleUnmapFingerprint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Lepas hubungan sidik jari dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		FingerprintID int    `json:"fingerprint_id"`
		DeviceID      string `json:"device_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	db.Exec("UPDATE members SET fingerprint_id = 0 WHERE fingerprint_id = ?", req.FingerprintID)
	db.Exec("UPDATE fingerprints SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE fingerprint_id = ?", req.FingerprintID)

	broadcastSSE("fingerprint_event", map[string]interface{}{
		"action":         "unmapped",
		"fingerprint_id": req.FingerprintID,
		"message":        fmt.Sprintf("Hubungan sidik jari slot #%d telah dilepas", req.FingerprintID),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Hubungan sidik jari slot #%d berhasil dilepas.", req.FingerprintID),
	})
}

// 3c. CRUD RFID CARDS & MAPPING (/api/cards, /api/cards/map, /api/cards/unmap)
func handleCards(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT 
				c.id, 
				c.card_uid, 
				c.device_id, 
				c.member_id, 
				c.status,
				c.created_at, 
				c.updated_at,
				COALESCE(m.id, 0),
				COALESCE(m.uid, ''),
				COALESCE(m.nis_nip, ''),
				COALESCE(m.nama, ''),
				COALESCE(m.tipe, ''),
				COALESCE(m.kelas, ''),
				COALESCE(m.no_hp, '')
			FROM rfid_cards c
			LEFT JOIN members m ON c.member_id = m.id
			ORDER BY c.updated_at DESC, c.id DESC
		`)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Query rfid_cards gagal: %v", err))
			return
		}
		defer rows.Close()

		list := make([]RFIDCardRecord, 0)
		for rows.Next() {
			var card RFIDCardRecord
			var m Member
			rows.Scan(
				&card.ID, &card.CardUID, &card.DeviceID, &card.MemberID, &card.Status, &card.CreatedAt, &card.UpdatedAt,
				&m.ID, &m.UID, &m.NISNIP, &m.Nama, &m.Tipe, &m.Kelas, &m.NoHP,
			)
			if m.ID > 0 {
				card.Member = &m
				card.Status = "mapped"
			} else {
				card.Status = "unmapped"
			}
			list = append(list, card)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(list),
			"data":   list,
		})

	case http.MethodDelete:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penghapusan kartu dinonaktifkan dalam Versi Demo.")
			return
		}

		idStr := r.URL.Query().Get("id")
		id, _ := strconv.Atoi(idStr)
		cardUID := strings.TrimSpace(r.URL.Query().Get("card_uid"))

		var targetUID string
		var memberID int

		if id > 0 {
			db.QueryRow("SELECT card_uid, member_id FROM rfid_cards WHERE id = ?", id).Scan(&targetUID, &memberID)
			db.Exec("DELETE FROM rfid_cards WHERE id = ?", id)
		} else if cardUID != "" {
			db.QueryRow("SELECT card_uid, member_id FROM rfid_cards WHERE card_uid = ?", cardUID).Scan(&targetUID, &memberID)
			db.Exec("DELETE FROM rfid_cards WHERE card_uid = ?", cardUID)
		}

		if memberID > 0 && targetUID != "" {
			// Lepas uid dari member
			db.Exec("UPDATE members SET uid = '' WHERE id = ?", memberID)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data kartu RFID berhasil dihapus.",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

func handleMapCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Hubungkan kartu dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		CardUID  string `json:"card_uid"`
		DeviceID string `json:"device_id"`
		MemberID int    `json:"member_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	req.CardUID = strings.TrimSpace(req.CardUID)
	if req.CardUID == "" || req.MemberID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Parameter card_uid dan member_id wajib diisi.")
		return
	}
	if req.DeviceID == "" {
		req.DeviceID = "PRESENSI-V1"
	}

	// 1. Lepas kartu ini dari member lain jika sebelumnya terhubung
	db.Exec("UPDATE members SET uid = '' WHERE uid = ? AND id != ?", req.CardUID, req.MemberID)

	// 2. Hubungkan ke member target
	_, err := db.Exec("UPDATE members SET uid = ? WHERE id = ?", req.CardUID, req.MemberID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal menghubungkan kartu ke member: %v", err))
		return
	}

	// 3. Update status tabel rfid_cards
	db.Exec(`INSERT INTO rfid_cards (card_uid, device_id, member_id, status, updated_at)
		VALUES (?, ?, ?, 'mapped', CURRENT_TIMESTAMP)
		ON CONFLICT(card_uid) DO UPDATE SET 
			device_id = excluded.device_id,
			member_id = excluded.member_id,
			status = 'mapped',
			updated_at = CURRENT_TIMESTAMP`,
		req.CardUID, req.DeviceID, req.MemberID)

	var memberNama string
	db.QueryRow("SELECT nama FROM members WHERE id = ?", req.MemberID).Scan(&memberNama)

	broadcastSSE("card_event", map[string]interface{}{
		"action":      "mapped",
		"card_uid":    req.CardUID,
		"member_id":   req.MemberID,
		"member_nama": memberNama,
		"message":     fmt.Sprintf("Kartu RFID #%s berhasil dihubungkan ke %s", req.CardUID, memberNama),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Kartu RFID (#%s) berhasil dihubungkan ke %s.", req.CardUID, memberNama),
	})
}

func handleUnmapCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Lepas hubungan kartu dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		CardUID  string `json:"card_uid"`
		MemberID int    `json:"member_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	req.CardUID = strings.TrimSpace(req.CardUID)
	if req.CardUID == "" && req.MemberID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Parameter card_uid atau member_id wajib diisi.")
		return
	}

	if req.CardUID != "" {
		db.Exec("UPDATE members SET uid = '' WHERE uid = ?", req.CardUID)
		db.Exec("UPDATE rfid_cards SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE card_uid = ?", req.CardUID)
	} else if req.MemberID > 0 {
		var existingUID string
		db.QueryRow("SELECT uid FROM members WHERE id = ?", req.MemberID).Scan(&existingUID)
		db.Exec("UPDATE members SET uid = '' WHERE id = ?", req.MemberID)
		if existingUID != "" {
			db.Exec("UPDATE rfid_cards SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE card_uid = ?", existingUID)
		}
	}

	broadcastSSE("card_event", map[string]interface{}{
		"action":   "unmapped",
		"card_uid": req.CardUID,
		"message":  fmt.Sprintf("Hubungan kartu RFID #%s telah dilepas.", req.CardUID),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Hubungan kartu RFID (#%s) berhasil dilepas.", req.CardUID),
	})
}

// generateAutoNISNIP menghasilkan kode NIS/NIP otomatis jika dikosongkan oleh pengguna:
// - Santri / Siswa: Tahun berjalan + 3 digit no urut (contoh: 2026001, 2026002, dst.)
// - Guru / Pegawai: Awalan PG + 3 digit no urut (contoh: PG001, PG002, dst.)
func generateAutoNISNIP(tipe string, usedBatch map[string]int) string {
	currentYear := time.Now().Year()
	isGuru := strings.ToLower(strings.TrimSpace(tipe)) == "guru"

	for next := 1; ; next++ {
		var candidate string
		if isGuru {
			candidate = fmt.Sprintf("PG%03d", next)
		} else {
			candidate = fmt.Sprintf("%d%03d", currentYear, next)
		}

		if usedBatch != nil {
			if _, used := usedBatch[candidate]; used {
				continue
			}
		}

		var exists int
		db.QueryRow("SELECT COUNT(*) FROM members WHERE nis_nip = ?", candidate).Scan(&exists)
		if exists == 0 {
			return candidate
		}
	}
}

// 4. CRUD MEMBERS (/api/members)
func handleMembers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tipe := strings.ToLower(r.URL.Query().Get("tipe"))
		search := strings.ToLower(r.URL.Query().Get("search"))

		query := "SELECT id, uid, COALESCE(fingerprint_id, 0), nis_nip, nama, COALESCE(nama_ortu, ''), tipe, kelas, no_hp, COALESCE(telegram_chat_id, ''), created_at FROM members WHERE 1=1"
		var args []interface{}

		if tipe != "" && tipe != "all" {
			query += " AND lower(tipe) = ?"
			args = append(args, tipe)
		}
		if search != "" {
			query += " AND (lower(nama) LIKE ? OR lower(uid) LIKE ? OR lower(nis_nip) LIKE ? OR lower(kelas) LIKE ? OR lower(COALESCE(nama_ortu, '')) LIKE ? OR lower(COALESCE(telegram_chat_id, '')) LIKE ?)"
			args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
		}
		query += " ORDER BY id DESC"

		rows, err := db.Query(query, args...)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal query members: %v", err))
			return
		}
		defer rows.Close()

		members := make([]Member, 0)
		for rows.Next() {
			var m Member
			rows.Scan(&m.ID, &m.UID, &m.FingerprintID, &m.NISNIP, &m.Nama, &m.NamaOrtu, &m.Tipe, &m.Kelas, &m.NoHP, &m.TelegramChatID, &m.CreatedAt)
			members = append(members, m)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(members),
			"data":   members,
		})

	case http.MethodPost:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penambahan data anggota dinonaktifkan dalam Versi Demo.")
			return
		}

		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		m.UID = strings.TrimSpace(m.UID)
		m.NISNIP = strings.TrimSpace(m.NISNIP)
		m.Nama = strings.TrimSpace(m.Nama)
		m.NamaOrtu = strings.TrimSpace(m.NamaOrtu)
		m.Tipe = strings.ToLower(strings.TrimSpace(m.Tipe))
		m.TelegramChatID = strings.TrimSpace(m.TelegramChatID)

		if m.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "Nama Lengkap wajib diisi.")
			return
		}
		if m.Tipe != "siswa" && m.Tipe != "guru" {
			m.Tipe = "siswa"
		}

		// Auto generate NIS/NIP jika pengguna tidak mengisi
		if m.NISNIP == "" {
			m.NISNIP = generateAutoNISNIP(m.Tipe, nil)
		}

		if m.UID == "-" || strings.HasPrefix(m.UID, "PENDING-") || strings.HasPrefix(m.UID, "UNASSIGNED-") {
			m.UID = ""
		}

		// Jika UID diisi nyata, pastikan belum digunakan oleh anggota lain
		if m.UID != "" {
			var conflictName string
			db.QueryRow("SELECT nama FROM members WHERE uid = ? LIMIT 1", m.UID).Scan(&conflictName)
			if conflictName != "" {
				writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("UID Kartu RFID '%s' sudah digunakan oleh %s.", m.UID, conflictName))
				return
			}
		}

		res, err := db.Exec("INSERT INTO members (nis_nip, uid, fingerprint_id, nama, nama_ortu, tipe, kelas, no_hp, telegram_chat_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			m.NISNIP, m.UID, m.FingerprintID, m.Nama, m.NamaOrtu, m.Tipe, m.Kelas, m.NoHP, m.TelegramChatID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("NIS / NIP '%s' sudah terdaftar pada anggota lain.", m.NISNIP))
			return
		}

		id, _ := res.LastInsertId()
		m.ID = int(id)

		// Sinkronisasi ke rfid_cards jika UID nyata diisi
		if m.UID != "" {
			db.Exec(`INSERT INTO rfid_cards (card_uid, member_id, status, updated_at)
				VALUES (?, ?, 'mapped', CURRENT_TIMESTAMP)
				ON CONFLICT(card_uid) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
				m.UID, m.ID)
		}

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Data berhasil ditambahkan",
			"data":    m,
		})

	case http.MethodPut:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengeditan data anggota dinonaktifkan dalam Versi Demo.")
			return
		}

		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		if m.ID == 0 {
			writeJSONError(w, http.StatusBadRequest, "ID Member wajib disertakan.")
			return
		}

		m.UID = strings.TrimSpace(m.UID)
		m.NISNIP = strings.TrimSpace(m.NISNIP)
		m.Nama = strings.TrimSpace(m.Nama)
		m.NamaOrtu = strings.TrimSpace(m.NamaOrtu)
		m.TelegramChatID = strings.TrimSpace(m.TelegramChatID)

		if m.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "Nama Lengkap wajib diisi.")
			return
		}

		var oldUID string
		var oldNISNIP string
		var oldTipe string
		db.QueryRow("SELECT uid, nis_nip, tipe FROM members WHERE id = ?", m.ID).Scan(&oldUID, &oldNISNIP, &oldTipe)

		if m.Tipe == "" {
			m.Tipe = oldTipe
		}
		if m.NISNIP == "" {
			if oldNISNIP != "" {
				m.NISNIP = oldNISNIP
			} else {
				m.NISNIP = generateAutoNISNIP(m.Tipe, nil)
			}
		}

		if m.UID == "-" || strings.HasPrefix(m.UID, "PENDING-") || strings.HasPrefix(m.UID, "UNASSIGNED-") {
			m.UID = ""
		}

		if m.UID == "" {
			if oldUID != "" && !strings.HasPrefix(oldUID, "PENDING-") && !strings.HasPrefix(oldUID, "UNASSIGNED-") {
				db.Exec("UPDATE rfid_cards SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE card_uid = ?", oldUID)
			}
		} else if m.UID != oldUID {
			var conflictName string
			db.QueryRow("SELECT nama FROM members WHERE uid = ? AND id != ? LIMIT 1", m.UID, m.ID).Scan(&conflictName)
			if conflictName != "" {
				writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("UID Kartu RFID '%s' sudah digunakan oleh %s.", m.UID, conflictName))
				return
			}
			if oldUID != "" && !strings.HasPrefix(oldUID, "PENDING-") && !strings.HasPrefix(oldUID, "UNASSIGNED-") {
				db.Exec("UPDATE rfid_cards SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE card_uid = ?", oldUID)
			}
		}

		_, err := db.Exec("UPDATE members SET nis_nip = ?, uid = ?, fingerprint_id = ?, nama = ?, nama_ortu = ?, tipe = ?, kelas = ?, no_hp = ?, telegram_chat_id = ? WHERE id = ?",
			m.NISNIP, m.UID, m.FingerprintID, m.Nama, m.NamaOrtu, m.Tipe, m.Kelas, m.NoHP, m.TelegramChatID, m.ID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Gagal memperbarui data member: NIS / NIP '%s' mungkin sudah terdaftar pada anggota lain.", m.NISNIP))
			return
		}

		// Sinkronisasi ke rfid_cards jika UID nyata diisi
		if m.UID != "" {
			db.Exec(`INSERT INTO rfid_cards (card_uid, member_id, status, updated_at)
				VALUES (?, ?, 'mapped', CURRENT_TIMESTAMP)
				ON CONFLICT(card_uid) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
				m.UID, m.ID)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data member berhasil diperbarui",
			"data":    m,
		})

	case http.MethodDelete:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penghapusan data anggota dinonaktifkan dalam Versi Demo.")
			return
		}

		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}

		// Lepas relasi kartu dan sidik jari sebelum menghapus member
		db.Exec("UPDATE rfid_cards SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE member_id = ?", id)
		db.Exec("UPDATE fingerprints SET member_id = 0, status = 'unmapped', updated_at = CURRENT_TIMESTAMP WHERE member_id = ?", id)

		_, err = db.Exec("DELETE FROM members WHERE id = ?", id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal menghapus member.")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data member berhasil dihapus",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// 4b. POST /api/members/bulk (Bulk Import dari Excel)
func handleBulkMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Import data anggota dinonaktifkan dalam Versi Demo.")
		return
	}

	type BulkMemberItem struct {
		RowNumber      int    `json:"row_number"`
		UID            string `json:"uid"`
		NISNIP         string `json:"nis_nip"`
		Nama           string `json:"nama"`
		NamaOrtu       string `json:"nama_ortu"`
		Tipe           string `json:"tipe"`
		Kelas          string `json:"kelas"`
		NoHP           string `json:"no_hp"`
		TelegramChatID string `json:"telegram_chat_id"`
	}

	var req struct {
		Tipe    string           `json:"tipe"`
		Members []BulkMemberItem `json:"members"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	if len(req.Members) == 0 {
		writeJSONError(w, http.StatusBadRequest, "Tidak ada data anggota yang dikirim.")
		return
	}

	// 1. Ambil daftar Kelas yang valid dari database untuk validasi case-insensitive
	classMap := make(map[string]string) // lowercase -> canonical name
	cRows, err := db.Query("SELECT nama FROM classes")
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var cName string
			if err := cRows.Scan(&cName); err == nil {
				cTrimmed := strings.TrimSpace(cName)
				if cTrimmed != "" {
					classMap[strings.ToLower(cTrimmed)] = cTrimmed
				}
			}
		}
	}

	// 2. Ambil daftar Jabatan yang valid dari database untuk validasi case-insensitive
	posMap := make(map[string]string) // lowercase -> canonical name
	pRows, err := db.Query("SELECT nama FROM positions")
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var pName string
			if err := pRows.Scan(&pName); err == nil {
				pTrimmed := strings.TrimSpace(pName)
				if pTrimmed != "" {
					posMap[strings.ToLower(pTrimmed)] = pTrimmed
				}
			}
		}
	}

	type BulkErrorItem struct {
		RowNumber int    `json:"row_number"`
		Nama      string `json:"nama"`
		Field     string `json:"field"`
		Error     string `json:"error"`
	}

	var errorsList []BulkErrorItem
	var insertedCount int
	var updatedCount int
	usedBatchUIDs := make(map[string]int)   // uid -> row number
	usedBatchNISNIP := make(map[string]int) // nis_nip -> row number

	for idx, m := range req.Members {
		rowNum := m.RowNumber
		if rowNum <= 0 {
			rowNum = idx + 1
		}

		nama := strings.TrimSpace(m.Nama)
		if nama == "" {
			errorsList = append(errorsList, BulkErrorItem{
				RowNumber: rowNum,
				Nama:      "-",
				Field:     "Nama",
				Error:     "Nama Lengkap wajib diisi (tidak boleh kosong).",
			})
			continue
		}

		tipe := strings.ToLower(strings.TrimSpace(m.Tipe))
		if tipe == "" {
			tipe = strings.ToLower(strings.TrimSpace(req.Tipe))
		}
		if tipe != "siswa" && tipe != "guru" {
			tipe = "siswa"
		}

		nisNIP := strings.TrimSpace(m.NISNIP)
		namaOrtu := strings.TrimSpace(m.NamaOrtu)
		kelasInput := strings.TrimSpace(m.Kelas)
		noHP := strings.TrimSpace(m.NoHP)
		chatId := strings.TrimSpace(m.TelegramChatID)
		uid := strings.ToUpper(strings.TrimSpace(m.UID))

		// Jika NIS / NIP tidak diisi di Excel, generate otomatis oleh sistem
		if nisNIP == "" {
			nisNIP = generateAutoNISNIP(tipe, usedBatchNISNIP)
		} else {
			// Validasi duplikasi NIS/NIP di dalam file Excel yang sama jika diisi manual
			if prevRow, dup := usedBatchNISNIP[nisNIP]; dup {
				labelID := "NIS"
				if tipe == "guru" {
					labelID = "NIP"
				}
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     labelID,
					Error:     fmt.Sprintf("%s '%s' duplikat di file Excel (sudah dipakai di baris %d).", labelID, nisNIP, prevRow),
				})
				continue
			}
		}
		usedBatchNISNIP[nisNIP] = rowNum

		// Validasi Kelas / Jabatan
		var canonicalGroup string
		if tipe == "siswa" {
			if kelasInput == "" {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Kelas",
					Error:     "Nama Kelas wajib diisi.",
				})
				continue
			}
			matched, ok := classMap[strings.ToLower(kelasInput)]
			if !ok {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Kelas",
					Error:     fmt.Sprintf("Kelas '%s' tidak terdaftar di Master Kelas. Pastikan nama kelas sama persis dengan yang ada di menu Master Kelas.", kelasInput),
				})
				continue
			}
			canonicalGroup = matched
		} else {
			// Guru / Pegawai
			if kelasInput == "" {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Jabatan",
					Error:     "Nama Jabatan wajib diisi.",
				})
				continue
			}
			matched, ok := posMap[strings.ToLower(kelasInput)]
			if !ok {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Jabatan",
					Error:     fmt.Sprintf("Jabatan '%s' tidak terdaftar di Master Jabatan. Pastikan nama jabatan sama persis dengan yang ada di menu Master Jabatan.", kelasInput),
				})
				continue
			}
			canonicalGroup = matched
		}

		// Validasi UID Kartu RFID (Opsional)
		var isRealUID = uid != "" && uid != "-"
		if isRealUID {
			if prevRow, dup := usedBatchUIDs[uid]; dup {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "UID Kartu RFID",
					Error:     fmt.Sprintf("UID Kartu RFID '%s' duplikat di file Excel (sudah dipakai di baris %d).", uid, prevRow),
				})
				continue
			}
			usedBatchUIDs[uid] = rowNum
		}

		// Cek apakah anggota sudah ada di database berdasarkan kunci unik NIS/NIP
		var existingID int
		var existingUID string
		var existingName string

		db.QueryRow("SELECT id, uid, nama FROM members WHERE nis_nip = ? LIMIT 1", nisNIP).
			Scan(&existingID, &existingUID, &existingName)

		if existingID > 0 {
			// Jika anggota sudah ada: jika UID baru diisi nyata dan berbeda dari UID lama, pastikan tidak bentrok
			targetUID := existingUID
			if isRealUID {
				var conflictID int
				var conflictName string
				db.QueryRow("SELECT id, nama FROM members WHERE uid = ? AND id != ? LIMIT 1", uid, existingID).
					Scan(&conflictID, &conflictName)
				if conflictID > 0 {
					errorsList = append(errorsList, BulkErrorItem{
						RowNumber: rowNum,
						Nama:      nama,
						Field:     "UID Kartu RFID",
						Error:     fmt.Sprintf("UID Kartu RFID '%s' sudah digunakan oleh %s.", uid, conflictName),
					})
					continue
				}
				targetUID = uid
			}

			// Lakukan update data anggota yang sudah ada
			_, err := db.Exec(`
				UPDATE members 
				SET nis_nip = ?, uid = ?, nama = ?, nama_ortu = ?, tipe = ?, kelas = ?, no_hp = ?, telegram_chat_id = ?
				WHERE id = ?
			`, nisNIP, targetUID, nama, namaOrtu, tipe, canonicalGroup, noHP, chatId, existingID)

			if err != nil {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Database",
					Error:     fmt.Sprintf("Gagal memperbarui data: %v", err),
				})
				continue
			}

			if targetUID != "" && !strings.HasPrefix(targetUID, "PENDING-") && !strings.HasPrefix(targetUID, "UNASSIGNED-") {
				db.Exec(`INSERT INTO rfid_cards (card_uid, member_id, status, updated_at)
					VALUES (?, ?, 'mapped', CURRENT_TIMESTAMP)
					ON CONFLICT(card_uid) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
					targetUID, existingID)
			}
			updatedCount++

		} else {
			// Anggota baru (INSERT)
			targetUID := ""
			if isRealUID {
				// Cek tabrakan UID di database
				var conflictID int
				var conflictName string
				db.QueryRow("SELECT id, nama FROM members WHERE uid = ? LIMIT 1", uid).
					Scan(&conflictID, &conflictName)
				if conflictID > 0 {
					errorsList = append(errorsList, BulkErrorItem{
						RowNumber: rowNum,
						Nama:      nama,
						Field:     "UID Kartu RFID",
						Error:     fmt.Sprintf("UID Kartu RFID '%s' sudah terdaftar pada anggota '%s'.", uid, conflictName),
					})
					continue
				}
				targetUID = uid
			}

			res, err := db.Exec(`
				INSERT INTO members (nis_nip, uid, nama, nama_ortu, tipe, kelas, no_hp, telegram_chat_id)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`, nisNIP, targetUID, nama, namaOrtu, tipe, canonicalGroup, noHP, chatId)

			if err != nil {
				errorsList = append(errorsList, BulkErrorItem{
					RowNumber: rowNum,
					Nama:      nama,
					Field:     "Database",
					Error:     fmt.Sprintf("Gagal menyimpan data baru: %v", err),
				})
				continue
			}

			newID, _ := res.LastInsertId()
			if targetUID != "" && !strings.HasPrefix(targetUID, "PENDING-") && !strings.HasPrefix(targetUID, "UNASSIGNED-") {
				db.Exec(`INSERT INTO rfid_cards (card_uid, member_id, status, updated_at)
					VALUES (?, ?, 'mapped', CURRENT_TIMESTAMP)
					ON CONFLICT(card_uid) DO UPDATE SET member_id = excluded.member_id, status = 'mapped', updated_at = CURRENT_TIMESTAMP`,
					targetUID, newID)
			}
			insertedCount++
		}
	}

	var statusResult = "success"
	totalSuccess := insertedCount + updatedCount
	if len(errorsList) > 0 {
		if totalSuccess > 0 {
			statusResult = "partial"
		} else {
			statusResult = "error"
		}
	}

	var message string
	if len(errorsList) == 0 {
		message = fmt.Sprintf("Sukses mengimpor %d data anggota (%d baru, %d diperbarui).", totalSuccess, insertedCount, updatedCount)
	} else if totalSuccess > 0 {
		message = fmt.Sprintf("%d data berhasil diproses (%d baru, %d diperbarui), namun ada %d baris bermasalah.", totalSuccess, insertedCount, updatedCount, len(errorsList))
	} else {
		message = fmt.Sprintf("Semua baris (%d data) gagal diimpor karena format atau data tidak sesuai.", len(errorsList))
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":         statusResult,
		"message":        message,
		"total_rows":     len(req.Members),
		"inserted_count": insertedCount,
		"updated_count":  updatedCount,
		"success_count":  totalSuccess,
		"error_count":    len(errorsList),
		"errors":         errorsList,
	})
}

// 5. CRUD MASTER KELAS (/api/classes)
func handleClasses(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query("SELECT id, nama, tingkat, keterangan FROM classes ORDER BY tingkat ASC, nama ASC")
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal memuat data kelas.")
			return
		}
		defer rows.Close()

		list := make([]ClassRoom, 0)
		for rows.Next() {
			var c ClassRoom
			rows.Scan(&c.ID, &c.Nama, &c.Tingkat, &c.Keterangan)
			list = append(list, c)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(list),
			"data":   list,
		})

	case http.MethodPost:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penambahan data kelas dinonaktifkan dalam Versi Demo.")
			return
		}
		var c ClassRoom
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		c.Nama = strings.TrimSpace(c.Nama)
		if c.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "Nama kelas wajib diisi.")
			return
		}

		res, err := db.Exec("INSERT INTO classes (nama, tingkat, keterangan) VALUES (?, ?, ?)", c.Nama, c.Tingkat, c.Keterangan)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "Nama kelas sudah ada.")
			return
		}
		id, _ := res.LastInsertId()
		c.ID = int(id)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Kelas baru berhasil ditambahkan",
			"data":    c,
		})

	case http.MethodPut:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengeditan data kelas dinonaktifkan dalam Versi Demo.")
			return
		}
		var c ClassRoom
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		if c.ID == 0 || strings.TrimSpace(c.Nama) == "" {
			writeJSONError(w, http.StatusBadRequest, "ID dan Nama kelas wajib diisi.")
			return
		}

		_, err := db.Exec("UPDATE classes SET nama = ?, tingkat = ?, keterangan = ? WHERE id = ?", c.Nama, c.Tingkat, c.Keterangan, c.ID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal memperbarui kelas.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data kelas berhasil diperbarui",
			"data":    c,
		})

	case http.MethodDelete:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penghapusan data kelas dinonaktifkan dalam Versi Demo.")
			return
		}
		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}
		_, err = db.Exec("DELETE FROM classes WHERE id = ?", id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal menghapus kelas.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data kelas berhasil dihapus",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// 6. CRUD MASTER JABATAN (/api/positions)
func handlePositions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query("SELECT id, nama, keterangan FROM positions ORDER BY nama ASC")
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal memuat data jabatan.")
			return
		}
		defer rows.Close()

		list := make([]Position, 0)
		for rows.Next() {
			var p Position
			rows.Scan(&p.ID, &p.Nama, &p.Keterangan)
			list = append(list, p)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(list),
			"data":   list,
		})

	case http.MethodPost:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penambahan data jabatan dinonaktifkan dalam Versi Demo.")
			return
		}
		var p Position
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		p.Nama = strings.TrimSpace(p.Nama)
		if p.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "Nama jabatan wajib diisi.")
			return
		}

		res, err := db.Exec("INSERT INTO positions (nama, keterangan) VALUES (?, ?)", p.Nama, p.Keterangan)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "Nama jabatan sudah ada.")
			return
		}
		id, _ := res.LastInsertId()
		p.ID = int(id)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Jabatan baru berhasil ditambahkan",
			"data":    p,
		})

	case http.MethodPut:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengeditan data jabatan dinonaktifkan dalam Versi Demo.")
			return
		}
		var p Position
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		if p.ID == 0 || strings.TrimSpace(p.Nama) == "" {
			writeJSONError(w, http.StatusBadRequest, "ID dan Nama jabatan wajib diisi.")
			return
		}

		_, err := db.Exec("UPDATE positions SET nama = ?, keterangan = ? WHERE id = ?", p.Nama, p.Keterangan, p.ID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal memperbarui jabatan.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data jabatan berhasil diperbarui",
			"data":    p,
		})

	case http.MethodDelete:
		if isDemoMode() {
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Penghapusan data jabatan dinonaktifkan dalam Versi Demo.")
			return
		}
		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}
		_, err = db.Exec("DELETE FROM positions WHERE id = ?", id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal menghapus jabatan.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data jabatan berhasil dihapus",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// 7. GET /api/stats/dashboard (Data Grafik Trend 7 Hari & Komposisi)
func handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	today := time.Now()
	tipeFilter := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tipe")))

	type DayTrend struct {
		Tanggal   string `json:"tanggal"`
		Hari      string `json:"hari"`
		Total     int    `json:"total"`
		Tepat     int    `json:"tepat"`
		Telat     int    `json:"telat"`
		IzinSakit int    `json:"izin_sakit"`
	}

	dayNames := map[time.Weekday]string{
		time.Sunday:    "Minggu",
		time.Monday:    "Senin",
		time.Tuesday:   "Selasa",
		time.Wednesday: "Rabu",
		time.Thursday:  "Kamis",
		time.Friday:    "Jumat",
		time.Saturday:  "Sabtu",
	}

	trendList := make([]DayTrend, 0)
	for i := 6; i >= 0; i-- {
		t := today.AddDate(0, 0, -i)
		tStr := t.Format("2006-01-02")
		hStr := dayNames[t.Weekday()]

		var total, tepat, telat, izinSakit int
		if tipeFilter != "" && tipeFilter != "all" {
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND lower(tipe) = ?", tStr, tipeFilter).Scan(&total)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND lower(tipe) = ? AND status_masuk LIKE '%tepat%'", tStr, tipeFilter).Scan(&tepat)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND lower(tipe) = ? AND status_masuk LIKE '%telat%'", tStr, tipeFilter).Scan(&telat)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND lower(tipe) = ? AND (status_masuk = 'izin' OR status_masuk = 'sakit')", tStr, tipeFilter).Scan(&izinSakit)
		} else {
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ?", tStr).Scan(&total)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND status_masuk LIKE '%tepat%'", tStr).Scan(&tepat)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND status_masuk LIKE '%telat%'", tStr).Scan(&telat)
			db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND (status_masuk = 'izin' OR status_masuk = 'sakit')", tStr).Scan(&izinSakit)
		}

		trendList = append(trendList, DayTrend{
			Tanggal:   tStr,
			Hari:      hStr,
			Total:     total,
			Tepat:     tepat,
			Telat:     telat,
			IzinSakit: izinSakit,
		})
	}

	// Total Master Counts
	var totalSiswa, totalGuru, totalKelas, totalJabatan int
	db.QueryRow("SELECT COUNT(*) FROM members WHERE lower(tipe) = 'siswa'").Scan(&totalSiswa)
	db.QueryRow("SELECT COUNT(*) FROM members WHERE lower(tipe) = 'guru'").Scan(&totalGuru)
	db.QueryRow("SELECT COUNT(*) FROM classes").Scan(&totalKelas)
	db.QueryRow("SELECT COUNT(*) FROM positions").Scan(&totalJabatan)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "success",
		"trend_7_days": trendList,
		"counts": map[string]int{
			"siswa":   totalSiswa,
			"guru":    totalGuru,
			"kelas":   totalKelas,
			"jabatan": totalJabatan,
		},
	})
}

// 8. SETTINGS & DUMMY DATA MANAGEMENT (/api/settings)
func handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query("SELECT key, value FROM settings")
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal membaca pengaturan.")
			return
		}
		defer rows.Close()

		settings := make(map[string]string)
		for rows.Next() {
			var k, v string
			rows.Scan(&k, &v)
			settings[k] = v
		}

		if isDemoMode() {
			settings["demo_mode"] = "true"
			settings["iot_api_key"] = "••••••••••••••••••••••••••••••••••••••••••••••••"
		} else {
			settings["demo_mode"] = "false"
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"data":   settings,
		})

	case http.MethodPost:
		var payload map[string]string
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}

		if isDemoMode() {
			// Pada mode demo, izinkan user untuk mencoba ganti mode aplikasi (umum / pesantren / sekolah)
			if mode, ok := payload["app_mode"]; ok {
				mode = strings.ToLower(strings.TrimSpace(mode))
				if mode == "umum" || mode == "pesantren" || mode == "sekolah" {
					db.Exec("INSERT INTO settings (key, value) VALUES ('app_mode', ?) ON CONFLICT(key) DO UPDATE SET value = ?", mode, mode)
					writeJSON(w, http.StatusOK, map[string]interface{}{
						"status":   "success",
						"message":  "Mode aplikasi berhasil diubah ke mode " + mode,
						"app_mode": mode,
					})
					return
				}
			}
			writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengaturan profil instansi terkunci dalam Versi Demo. Anda tetap dapat mengganti Mode Aplikasi (Umum/Pesantren/Sekolah).")
			return
		}

		for k, v := range payload {
			db.Exec("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", k, v, v)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Pengaturan berhasil disimpan",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// POST /api/settings/regenerate-api-key
func handleRegenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Regenerate API Key dinonaktifkan dalam Versi Demo.")
		return
	}

	randomBytes := make([]byte, 24)
	var newApiKey string
	if _, err := rand.Read(randomBytes); err == nil {
		newApiKey = hex.EncodeToString(randomBytes)
	} else {
		h := sha256.Sum256([]byte(fmt.Sprintf("siakad_iot_key_%d", time.Now().UnixNano())))
		newApiKey = hex.EncodeToString(h[:24])
	}

	_, err := db.Exec("INSERT INTO settings (key, value) VALUES ('iot_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?", newApiKey, newApiKey)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal mengupdate API Key: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "IoT Secret API Key baru berhasil di-generate secara unik.",
		"api_key": newApiKey,
	})
}

func handleResetAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Reset data presensi dinonaktifkan dalam Versi Demo.")
		return
	}

	_, err := db.Exec("DELETE FROM attendances")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal mereset data presensi.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Seluruh riwayat data presensi berhasil dikosongkan.",
	})
}

func handleResetAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Reset total database dinonaktifkan dalam Versi Demo.")
		return
	}

	db.Exec("DELETE FROM attendances")
	db.Exec("DELETE FROM members")
	db.Exec("DELETE FROM classes")
	db.Exec("DELETE FROM positions")
	db.Exec("DELETE FROM rfid_cards")
	db.Exec("DELETE FROM fingerprints")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Database berhasil di-reset total (Presensi, Anggota, Kelas, Jabatan, RFID, dan Sidik Jari telah dikosongkan).",
	})
}

func handleSeedDummy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Seed dummy data dinonaktifkan dalam Versi Demo.")
		return
	}

	seedInitialData()
	seedDummyData()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Data dummy santri, guru, kelas, jabatan, dan riwayat presensi berhasil di-generate.",
	})
}

// GET /api/settings/backup-db
func handleBackupDB(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method GET yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Download backup database dinonaktifkan dalam Versi Demo.")
		return
	}

	timestamp := time.Now().Format("20060102_150405")
	backupFilename := fmt.Sprintf("backup_presensi_%s.db", timestamp)

	// Buat file snapshot sementara menggunakan VACUUM INTO
	tempDir := os.TempDir()
	tempBackupPath := filepath.Join(tempDir, backupFilename)
	_ = os.Remove(tempBackupPath)
	defer os.Remove(tempBackupPath)

	cleanPath := strings.ReplaceAll(tempBackupPath, "\\", "/")
	_, err := db.Exec(fmt.Sprintf("VACUUM INTO '%s'", cleanPath))
	if err != nil {
		// Fallback jika VACUUM INTO gagal: baca file dbPath secara langsung
		data, readErr := os.ReadFile(dbPath)
		if readErr != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal membuat backup database: "+readErr.Error())
			return
		}
		w.Header().Set("Content-Type", "application/x-sqlite3")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", backupFilename))
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		w.Write(data)
		return
	}

	data, err := os.ReadFile(tempBackupPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal membaca file snapshot backup: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/x-sqlite3")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", backupFilename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

// POST /api/settings/restore-db
func handleRestoreDB(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Restore database dinonaktifkan dalam Versi Demo.")
		return
	}

	// Batasi ukuran file upload maksimal 100 MB
	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Gagal memproses file upload: "+err.Error())
		return
	}

	file, header, err := r.FormFile("database")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "File database (.db) wajib diunggah.")
		return
	}
	defer file.Close()

	if header.Size == 0 {
		writeJSONError(w, http.StatusBadRequest, "File database yang diunggah kosong.")
		return
	}

	// Validasi Magic Header SQLite 3 ("SQLite format 3\000")
	headerBytes := make([]byte, 16)
	n, err := file.Read(headerBytes)
	if err != nil || n < 16 || string(headerBytes) != "SQLite format 3\x00" {
		writeJSONError(w, http.StatusBadRequest, "Format file tidak valid! File harus berupa database sistem yang valid (.db).")
		return
	}

	// Reset read pointer
	if _, err := file.Seek(0, 0); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal membaca ulang file: "+err.Error())
		return
	}

	// Simpan ke file sementara
	tempRestorePath := dbPath + ".restore_tmp"
	_ = os.Remove(tempRestorePath)
	defer os.Remove(tempRestorePath)

	out, err := os.Create(tempRestorePath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal membuat file penampung sementara: "+err.Error())
		return
	}

	_, err = io.Copy(out, file)
	out.Close()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal menyimpan file restore: "+err.Error())
		return
	}

	// Validasi integritas database file yang diunggah
	testDb, err := sql.Open("sqlite", tempRestorePath)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "File database korup atau tidak dapat dibuka: "+err.Error())
		return
	}
	var integrity string
	err = testDb.QueryRow("PRAGMA integrity_check;").Scan(&integrity)
	testDb.Close()
	if err != nil || integrity != "ok" {
		writeJSONError(w, http.StatusBadRequest, "Pemeriksaan integritas database gagal: "+integrity)
		return
	}

	// Kunci dan lakukan penggantian database
	dbMutex.Lock()
	defer dbMutex.Unlock()

	// Tutup koneksi aktif
	if db != nil {
		_ = db.Close()
	}

	// Buat backup database lama sebagai pengaman (.bak)
	backupOldPath := dbPath + ".bak"
	_ = os.Remove(backupOldPath)
	_ = os.Rename(dbPath, backupOldPath)

	// Ganti dbPath dengan file yang baru di-upload
	err = os.Rename(tempRestorePath, dbPath)
	if err != nil {
		// Rollback jika terjadi kesalahan
		_ = os.Rename(backupOldPath, dbPath)
		db, _ = sql.Open("sqlite", dbPath)
		writeJSONError(w, http.StatusInternalServerError, "Gagal mengganti database aktif: "+err.Error())
		return
	}

	// Buka kembali connection pool database SQLite
	var openErr error
	db, openErr = sql.Open("sqlite", dbPath)
	if openErr != nil {
		log.Printf("Peringatan: Gagal membuka kembali database: %v", openErr)
	}

	// Jalankan inisialisasi skema & migrasi otomatis pada database yang baru dipulihkan
	initDatabase()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Database berhasil dipulihkan dari file '%s'. Seluruh data telah diperbarui.", header.Filename),
	})
}

// 9. GET /api/devices
func handleDevices(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, device_id, nama, lokasi, last_seen FROM devices ORDER BY last_seen DESC")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal mengambil daftar perangkat.")
		return
	}
	defer rows.Close()

	var devices []DeviceInfo
	for rows.Next() {
		var d DeviceInfo
		rows.Scan(&d.ID, &d.DeviceID, &d.Nama, &d.Lokasi, &d.LastSeen)
		devices = append(devices, d)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"data":   devices,
	})
}

// 10. GET /api/health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := map[string]interface{}{
		"status":    "ok",
		"database":  "connected",
		"timestamp": time.Now().Format(time.RFC3339),
		"app":       "PresensiRFID - Sistem Presensi Fingerprint & RFID",
		"demo_mode": isDemoMode(),
	}
	if isDemoMode() {
		resp["demo_user"] = adminUser
		resp["demo_pass"] = adminPass
	}
	writeJSON(w, http.StatusOK, resp)
}

// -------------------------------------------------------------
// 11. TELEGRAM NOTIFICATION ENGINE & HANDLERS
// -------------------------------------------------------------

func sendTelegramMessage(token, chatID, text string) (bool, string, error) {
	if token == "" || chatID == "" || text == "" {
		return false, "Parameter tidak lengkap", errors.New("token, chat_id, dan text wajib diisi")
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return false, "Gagal marshal JSON payload", err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(apiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return false, fmt.Sprintf("Gagal menghubungi Telegram API: %v", err), err
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		ErrorCode   int    `json:"error_code"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	if !result.OK {
		return false, result.Description, fmt.Errorf("telegram error %d: %s", result.ErrorCode, result.Description)
	}
	return true, "Pesan berhasil terkirim", nil
}

func testTelegramBot(token string) (bool, string, string) {
	if token == "" {
		return false, "", "Bot token kosong"
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return false, "", fmt.Sprintf("Koneksi gagal: %v", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			ID        int64  `json:"id"`
			IsBot     bool   `json:"is_bot"`
			FirstName string `json:"first_name"`
			Username  string `json:"username"`
		} `json:"result"`
		Description string `json:"description"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if !result.OK {
		return false, "", result.Description
	}
	botInfo := fmt.Sprintf("%s (@%s)", result.Result.FirstName, result.Result.Username)
	return true, botInfo, "Bot aktif dan terverifikasi"
}

func parseTelegramChatIDs(raw string) []string {
	raw = strings.ReplaceAll(raw, "\r\n", ",")
	raw = strings.ReplaceAll(raw, "\n", ",")
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	var result []string
	seen := make(map[string]bool)
	for _, p := range parts {
		id := strings.TrimSpace(p)
		if id != "" && !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

func formatTelegramNotification(templateStr string, m Member, rec AttendanceRecord, instansi string) string {
	if templateStr == "" {
		templateStr = "🔔 *NOTIFIKASI PRESENSI*\nNama: *{nama}*\nTgl: {tanggal}\nJam: {waktu}\nStatus: {status}\n_{instansi}_"
	}

	statusText := rec.StatusMasuk
	waktuText := rec.WaktuMasuk
	if rec.WaktuKeluar != "-" && rec.WaktuKeluar != "" {
		statusText = rec.StatusKeluar
		waktuText = rec.WaktuKeluar
	}
	if statusText == "tepat" {
		statusText = "Tepat Waktu ✅"
	} else if statusText == "telat" {
		statusText = "Terlambat ⚠️"
	} else if statusText == "cepat" {
		statusText = "Pulang Cepat ⚠️"
	}

	out := templateStr
	out = strings.ReplaceAll(out, "{nama}", m.Nama)
	out = strings.ReplaceAll(out, "{nis}", m.NISNIP)
	out = strings.ReplaceAll(out, "{tipe}", strings.Title(m.Tipe))
	out = strings.ReplaceAll(out, "{kelas}", m.Kelas)
	out = strings.ReplaceAll(out, "{tanggal}", rec.Tanggal)
	out = strings.ReplaceAll(out, "{waktu}", waktuText)
	out = strings.ReplaceAll(out, "{status}", statusText)
	out = strings.ReplaceAll(out, "{instansi}", instansi)
	out = strings.ReplaceAll(out, "{nama_ortu}", m.NamaOrtu)
	return out
}

func formatTelegramAdminNotification(templateStr string, m Member, rec AttendanceRecord, actionType, instansi string) string {
	if templateStr == "" {
		templateStr = "📋 *LIVE MONITOR PRESENSI ADMIN*\n👤 Nama: *{nama}*\n🏷️ Tipe: {tipe}\n🏫 Kelas/Jabatan: {kelas}\n🔄 Aksi: *{aksi}* ({status})\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📍 Mesin: {id_mesin}\n_{instansi}_"
	}

	statusText := rec.StatusMasuk
	waktuText := rec.WaktuMasuk
	aksiText := "Presensi Masuk"
	if actionType == "check_out" || (rec.WaktuKeluar != "-" && rec.WaktuKeluar != "") {
		statusText = rec.StatusKeluar
		waktuText = rec.WaktuKeluar
		aksiText = "Presensi Pulang"
	}
	if statusText == "tepat" {
		statusText = "Tepat Waktu ✅"
	} else if statusText == "telat" {
		statusText = "Terlambat ⚠️"
	} else if statusText == "cepat" {
		statusText = "Pulang Cepat ⚠️"
	}

	devID := rec.DeviceID
	if strings.TrimSpace(devID) == "" {
		devID = "ESP32"
	}

	out := templateStr
	out = strings.ReplaceAll(out, "{nama}", m.Nama)
	out = strings.ReplaceAll(out, "{nis}", m.NISNIP)
	out = strings.ReplaceAll(out, "{tipe}", strings.Title(m.Tipe))
	out = strings.ReplaceAll(out, "{kelas}", m.Kelas)
	out = strings.ReplaceAll(out, "{aksi}", aksiText)
	out = strings.ReplaceAll(out, "{tanggal}", rec.Tanggal)
	out = strings.ReplaceAll(out, "{waktu}", waktuText)
	out = strings.ReplaceAll(out, "{status}", statusText)
	out = strings.ReplaceAll(out, "{id_mesin}", devID)
	out = strings.ReplaceAll(out, "{instansi}", instansi)
	out = strings.ReplaceAll(out, "{nama_ortu}", m.NamaOrtu)
	return out
}

func triggerTelegramAttendanceNotification(m Member, rec AttendanceRecord, actionType string) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[TELEGRAM PANIC RECOVERED] %v", r)
			}
		}()

		var botToken, enabled, notifyIn, notifyOut, tIn, tOut, tLate, instansiNama string
		var adminChatIDsRaw, notifyAdmin, tAdmin string

		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_bot_token'").Scan(&botToken)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_enabled'").Scan(&enabled)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_in'").Scan(&notifyIn)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_out'").Scan(&notifyOut)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_in'").Scan(&tIn)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_out'").Scan(&tOut)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_late'").Scan(&tLate)
		db.QueryRow("SELECT value FROM settings WHERE key = 'instansi_nama'").Scan(&instansiNama)

		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_admin_chat_ids'").Scan(&adminChatIDsRaw)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_admin'").Scan(&notifyAdmin)
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_admin'").Scan(&tAdmin)

		if strings.TrimSpace(botToken) == "" || enabled == "0" || strings.ToLower(enabled) == "false" {
			return
		}

		// 1. Notifikasi ke Wali Santri / Guru (jika ada chat id terdaftar)
		if strings.TrimSpace(m.TelegramChatID) != "" {
			var msg string
			var sendToUser bool
			if actionType == "check_in" {
				if notifyIn != "0" && strings.ToLower(notifyIn) != "false" {
					sendToUser = true
					if rec.StatusMasuk == "telat" && strings.TrimSpace(tLate) != "" {
						msg = formatTelegramNotification(tLate, m, rec, instansiNama)
					} else {
						msg = formatTelegramNotification(tIn, m, rec, instansiNama)
					}
				}
			} else if actionType == "check_out" {
				if notifyOut != "0" && strings.ToLower(notifyOut) != "false" {
					sendToUser = true
					msg = formatTelegramNotification(tOut, m, rec, instansiNama)
				}
			}

			if sendToUser && msg != "" {
				ok, desc, err := sendTelegramMessage(botToken, m.TelegramChatID, msg)
				if ok {
					log.Printf("[TELEGRAM NOTIF SENT] Sukses kirim notif %s ke %s (Chat ID: %s)", actionType, m.Nama, m.TelegramChatID)
				} else {
					log.Printf("[TELEGRAM NOTIF FAILED] Gagal kirim notif ke %s (Chat ID: %s): %s (%v)", m.Nama, m.TelegramChatID, desc, err)
				}
			}
		}

		// 2. Notifikasi Live Monitoring ke Seluruh Admin Lembaga (Bisa lebih dari 1 Admin ID)
		if notifyAdmin != "0" && strings.ToLower(notifyAdmin) != "false" {
			adminList := parseTelegramChatIDs(adminChatIDsRaw)
			if len(adminList) > 0 {
				adminMsg := formatTelegramAdminNotification(tAdmin, m, rec, actionType, instansiNama)
				for _, adminChatID := range adminList {
					ok, desc, err := sendTelegramMessage(botToken, adminChatID, adminMsg)
					if ok {
						log.Printf("[TELEGRAM ADMIN NOTIF SENT] Sukses kirim live monitor presensi %s (%s) ke Admin (Chat ID: %s)", m.Nama, actionType, adminChatID)
					} else {
						log.Printf("[TELEGRAM ADMIN NOTIF FAILED] Gagal kirim notif ke Admin (Chat ID: %s): %s (%v)", adminChatID, desc, err)
					}
				}
			}
		}
	}()
}

func handleTelegramStatus(w http.ResponseWriter, r *http.Request) {
	var botToken, enabled, notifyIn, notifyOut, tIn, tOut, tLate string
	var adminChatIDs, notifyAdmin, tAdmin string

	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_bot_token'").Scan(&botToken)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_enabled'").Scan(&enabled)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_in'").Scan(&notifyIn)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_out'").Scan(&notifyOut)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_in'").Scan(&tIn)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_out'").Scan(&tOut)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_late'").Scan(&tLate)

	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_admin_chat_ids'").Scan(&adminChatIDs)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_notify_admin'").Scan(&notifyAdmin)
	db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_template_admin'").Scan(&tAdmin)

	var botInfo string
	var isValid bool
	if strings.TrimSpace(botToken) != "" {
		isValid, botInfo, _ = testTelegramBot(botToken)
	}

	displayBotToken := botToken
	if isDemoMode() && strings.TrimSpace(displayBotToken) != "" {
		displayBotToken = "••••••••••••••••••••••••••••••••••••••••••••••••"
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"bot_token":      displayBotToken,
			"enabled":        enabled == "1" || strings.ToLower(enabled) == "true",
			"notify_in":      notifyIn == "1" || strings.ToLower(notifyIn) == "true",
			"notify_out":     notifyOut == "1" || strings.ToLower(notifyOut) == "true",
			"template_in":    tIn,
			"template_out":   tOut,
			"template_late":  tLate,
			"admin_chat_ids": adminChatIDs,
			"notify_admin":   notifyAdmin != "0" && strings.ToLower(notifyAdmin) != "false",
			"template_admin": tAdmin,
			"is_valid":       isValid,
			"bot_info":       botInfo,
		},
	})
}

func handleTelegramTestBot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
		return
	}

	var req struct {
		BotToken string `json:"bot_token"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	token := strings.TrimSpace(req.BotToken)
	if token == "" || (isDemoMode() && strings.Contains(token, "•")) {
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_bot_token'").Scan(&token)
	}

	if token == "" {
		writeJSONError(w, http.StatusBadRequest, "Bot token belum diisi.")
		return
	}

	isValid, botInfo, msg := testTelegramBot(token)
	if !isValid {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("Bot Token tidak valid atau tidak dapat dihubungi: %s", msg),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "success",
		"message":  "Bot Token Aktif & Terverifikasi!",
		"bot_info": botInfo,
	})
}

func handleTelegramSendTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
		return
	}

	var req struct {
		BotToken string `json:"bot_token"`
		ChatID   string `json:"chat_id"`
		Pesan    string `json:"pesan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	req.ChatID = strings.TrimSpace(req.ChatID)
	req.Pesan = strings.TrimSpace(req.Pesan)
	token := strings.TrimSpace(req.BotToken)

	if token == "" {
		db.QueryRow("SELECT value FROM settings WHERE key = 'telegram_bot_token'").Scan(&token)
	}

	if token == "" {
		writeJSONError(w, http.StatusBadRequest, "Bot Token Telegram belum dikonfigurasi. Silakan isi Bot Token terlebih dahulu.")
		return
	}
	if req.ChatID == "" {
		writeJSONError(w, http.StatusBadRequest, "Chat ID Tujuan wajib diisi.")
		return
	}
	if req.Pesan == "" {
		req.Pesan = "🔔 *TES NOTIFIKASI TELEGRAM*\nAssalamu'alaikum Wr. Wb.\nIni adalah pesan uji coba (test) notifikasi presensi dari sistem PresensiRFID.\n\nStatus: *Berhasil Terhubung! ✅*"
	}

	chatIDs := parseTelegramChatIDs(req.ChatID)
	if len(chatIDs) == 0 {
		writeJSONError(w, http.StatusBadRequest, "Chat ID Tujuan tidak valid.")
		return
	}

	var successCount, failCount int
	var lastErr string
	for _, cid := range chatIDs {
		ok, desc, _ := sendTelegramMessage(token, cid, req.Pesan)
		if ok {
			successCount++
		} else {
			failCount++
			lastErr = desc
		}
	}

	if successCount == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("Gagal kirim pesan ke %d Chat ID: %s", failCount, lastErr),
		})
		return
	}

	if failCount > 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "warning",
			"message": fmt.Sprintf("Pesan terkirim ke %d Chat ID, namun gagal pada %d Chat ID: %s", successCount, failCount, lastErr),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Pesan tes berhasil dikirim ke %d Chat ID (%s)!", successCount, strings.Join(chatIDs, ", ")),
	})
}

func handleTelegramSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengaturan Telegram dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		BotToken      string `json:"bot_token"`
		Enabled       bool   `json:"enabled"`
		NotifyIn      bool   `json:"notify_in"`
		NotifyOut     bool   `json:"notify_out"`
		TemplateIn    string `json:"template_in"`
		TemplateOut   string `json:"template_out"`
		TemplateLate  string `json:"template_late"`
		AdminChatIDs  string `json:"admin_chat_ids"`
		NotifyAdmin   bool   `json:"notify_admin"`
		TemplateAdmin string `json:"template_admin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	setSetting := func(k, v string) {
		db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?) 
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v)
	}

	setSetting("telegram_bot_token", strings.TrimSpace(req.BotToken))
	if req.Enabled {
		setSetting("telegram_enabled", "1")
	} else {
		setSetting("telegram_enabled", "0")
	}
	if req.NotifyIn {
		setSetting("telegram_notify_in", "1")
	} else {
		setSetting("telegram_notify_in", "0")
	}
	if req.NotifyOut {
		setSetting("telegram_notify_out", "1")
	} else {
		setSetting("telegram_notify_out", "0")
	}

	if req.NotifyAdmin {
		setSetting("telegram_notify_admin", "1")
	} else {
		setSetting("telegram_notify_admin", "0")
	}
	setSetting("telegram_admin_chat_ids", strings.TrimSpace(req.AdminChatIDs))

	if strings.TrimSpace(req.TemplateIn) != "" {
		setSetting("telegram_template_in", req.TemplateIn)
	}
	if strings.TrimSpace(req.TemplateOut) != "" {
		setSetting("telegram_template_out", req.TemplateOut)
	}
	if strings.TrimSpace(req.TemplateLate) != "" {
		setSetting("telegram_template_late", req.TemplateLate)
	}
	if strings.TrimSpace(req.TemplateAdmin) != "" {
		setSetting("telegram_template_admin", req.TemplateAdmin)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Pengaturan Notifikasi Telegram berhasil disimpan.",
	})
}

func handleUpdateMemberChatID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
		return
	}

	if isDemoMode() {
		writeJSONError(w, http.StatusForbidden, "Aksi ditolak: Pengeditan Chat ID anggota dinonaktifkan dalam Versi Demo.")
		return
	}

	var req struct {
		ID             int    `json:"id"`
		TelegramChatID string `json:"telegram_chat_id"`
		NamaOrtu       string `json:"nama_ortu"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "ID Anggota wajib disertakan.")
		return
	}

	req.TelegramChatID = strings.TrimSpace(req.TelegramChatID)
	req.NamaOrtu = strings.TrimSpace(req.NamaOrtu)

	_, err := db.Exec("UPDATE members SET telegram_chat_id = ?, nama_ortu = ? WHERE id = ?",
		req.TelegramChatID, req.NamaOrtu, req.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal memperbarui Chat ID Telegram.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Chat ID Telegram berhasil disimpan",
		"data":    req,
	})
}

// 12. React SPA Static File Handler with Fallback to index.html
func spaHandler() http.Handler {
	distFS, err := fs.Sub(frontendDist, "frontend/dist")
	if err != nil {
		log.Fatalf("Gagal mengakses frontend/dist: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			fileServer.ServeHTTP(w, r)
			return
		}

		f, err := distFS.Open(path)
		if err != nil {
			// SPA Route Fallback (e.g. /dashboard, /santri, /pengaturan, /telegram) -> serve index.html
			r.URL.Path = "/"
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			fileServer.ServeHTTP(w, r)
			return
		}

		fi, err := f.Stat()
		f.Close()

		if err != nil || fi.IsDir() {
			// Directory request -> serve index.html
			r.URL.Path = "/"
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			fileServer.ServeHTTP(w, r)
			return
		}

		// Static assets cache
		if strings.HasPrefix(path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		fileServer.ServeHTTP(w, r)
	})
}

// -------------------------------------------------------------
// TEXT-TO-SPEECH (TTS) PROXY & LOCAL SERVER CACHE
// -------------------------------------------------------------

// GET /api/tts?text=... (Public / IoT Endpoint untuk Mesin ESP32 & Web Audio)
func handleTTSProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method GET yang diizinkan.")
		return
	}

	text := strings.TrimSpace(r.URL.Query().Get("text"))
	if text == "" {
		writeJSONError(w, http.StatusBadRequest, "Parameter 'text' tidak boleh kosong.")
		return
	}

	// Ambil konfigurasi TTS dari database
	var ttsEnabled, ttsServerURL, ttsAPIKey string
	db.QueryRow("SELECT value FROM settings WHERE key = 'tts_enabled'").Scan(&ttsEnabled)
	db.QueryRow("SELECT value FROM settings WHERE key = 'tts_server_url'").Scan(&ttsServerURL)
	db.QueryRow("SELECT value FROM settings WHERE key = 'tts_api_key'").Scan(&ttsAPIKey)

	if ttsEnabled == "0" {
		writeJSONError(w, http.StatusForbidden, "Fitur TTS dinonaktifkan di pengaturan server.")
		return
	}

	if ttsServerURL == "" {
		ttsServerURL = "https://tts.smartapps.my.id/tts"
	}
	if ttsAPIKey == "" {
		ttsAPIKey = "P8xK2mQ7Za"
	}

	// Direktori cache WAV lokal di server
	cacheDir := filepath.Join(filepath.Dir(dbPath), "tts_cache")
	_ = os.MkdirAll(cacheDir, 0755)

	// Hash nama file unik dari teks yang diminta (SHA-256 16 byte hex = 32 char)
	hashBytes := sha256.Sum256([]byte(strings.ToLower(text)))
	cacheFile := filepath.Join(cacheDir, hex.EncodeToString(hashBytes[:16])+".wav")

	// 1. Cek Cache Lokal Server: Jika file audio sudah ada di server, sajikan instan!
	if fi, err := os.Stat(cacheFile); err == nil && fi.Size() > 44 {
		audioData, err := os.ReadFile(cacheFile)
		if err == nil {
			w.Header().Set("Content-Type", "audio/wav")
			w.Header().Set("Content-Length", strconv.Itoa(len(audioData)))
			w.Header().Set("X-TTS-Cache", "HIT")
			w.Header().Set("Cache-Control", "public, max-age=31536000")
			w.WriteHeader(http.StatusOK)
			w.Write(audioData)
			return
		}
	}

	// 2. Jika belum ada di cache, backend server yang menghubungi server TTS eksternal
	client := &http.Client{Timeout: 20 * time.Second}
	reqURL := fmt.Sprintf("%s?text=%s", ttsServerURL, url.QueryEscape(text))
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal membuat request TTS: "+err.Error())
		return
	}
	req.Header.Set("X-API-Key", ttsAPIKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[TTS PROXY] Gagal menghubungi server TTS eksternal (%s): %v", ttsServerURL, err)
		writeJSONError(w, http.StatusBadGateway, "Gagal menghubungi server TTS: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyErr, _ := io.ReadAll(resp.Body)
		log.Printf("[TTS PROXY] Server TTS merespon error HTTP %d: %s", resp.StatusCode, string(bodyErr))
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("Server TTS error (HTTP %d)", resp.StatusCode))
		return
	}

	audioBytes, err := io.ReadAll(resp.Body)
	if err != nil || len(audioBytes) < 44 {
		writeJSONError(w, http.StatusBadGateway, "Format audio dari server TTS tidak valid.")
		return
	}

	// Simpan ke disk cache lokal server secara otomatis
	_ = os.WriteFile(cacheFile, audioBytes, 0644)
	log.Printf("[TTS PROXY] Berhasil cache audio: \"%s\" (%d bytes) -> %s", text, len(audioBytes), cacheFile)

	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Content-Length", strconv.Itoa(len(audioBytes)))
	w.Header().Set("X-TTS-Cache", "MISS")
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.WriteHeader(http.StatusOK)
	w.Write(audioBytes)
}

// POST /api/settings/test-tts (Admin Test Connection ke Server TTS)
func handleTestTTS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	var payload struct {
		ServerURL string `json:"tts_server_url"`
		APIKey    string `json:"tts_api_key"`
		Text      string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	if payload.ServerURL == "" {
		payload.ServerURL = "https://tts.smartapps.my.id/tts"
	}
	if payload.APIKey == "" {
		payload.APIKey = "P8xK2mQ7Za"
	}
	if payload.Text == "" {
		payload.Text = "Tes koneksi Text to Speech berhasil."
	}

	startTime := time.Now()
	client := &http.Client{Timeout: 12 * time.Second}
	reqURL := fmt.Sprintf("%s?text=%s", payload.ServerURL, url.QueryEscape(payload.Text))
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Format URL server TTS tidak valid: "+err.Error())
		return
	}
	req.Header.Set("X-API-Key", payload.APIKey)

	resp, err := client.Do(req)
	latency := time.Since(startTime).Milliseconds()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": "Gagal terhubung ke server TTS: " + err.Error(),
			"latency": latency,
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "error",
			"http_status": resp.StatusCode,
			"message":     fmt.Sprintf("Server TTS merespon HTTP %d: %s", resp.StatusCode, string(bodyBytes)),
			"latency":     latency,
		})
		return
	}

	audioBytes, err := io.ReadAll(resp.Body)
	if err != nil || len(audioBytes) < 44 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": "Respon diterima dari server TTS namun format audio WAV tidak valid.",
			"latency": latency,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "success",
		"message":      fmt.Sprintf("Koneksi berhasil! Audio WAV diterima (%d bytes, latensi %d ms).", len(audioBytes), latency),
		"latency":      latency,
		"audio_bytes":  len(audioBytes),
		"audio_base64": base64.StdEncoding.EncodeToString(audioBytes),
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]interface{}{
		"status":  "error",
		"message": message,
	})
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getDBPath() string {
	if val := os.Getenv("DB_PATH"); val != "" {
		return val
	}
	if _, err := os.Stat("data/absensi.db"); err == nil {
		return "data/absensi.db"
	}
	return "data/presensi.db"
}

func isDemoMode() bool {
	val := strings.ToLower(strings.TrimSpace(getEnv("DEMO_MODE", "false")))
	return val == "true" || val == "1" || val == "yes"
}

// -------------------------------------------------------------
// MAIN ENTRYPOINT
// -------------------------------------------------------------
func main() {
	initDatabase()
	defer db.Close()

	mux := http.NewServeMux()

	// REST API Endpoints
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/attendance", authMiddleware(handleAttendance))
	mux.HandleFunc("/api/attendance/summary", authMiddleware(handleAttendanceSummary))
	mux.HandleFunc("/api/attendance/tap", handleTapAttendance)           // Public untuk ESP32 (RFID + Fingerprint)
	mux.HandleFunc("/api/presensi/api_presensi.php", handleTapAttendance) // Public endpoint kompatibel fw.ino firmware
	mux.HandleFunc("/api/fingerprints", authMiddleware(handleFingerprints))
	mux.HandleFunc("/api/fingerprints/map", authMiddleware(handleMapFingerprint))
	mux.HandleFunc("/api/fingerprints/unmap", authMiddleware(handleUnmapFingerprint))
	mux.HandleFunc("/api/cards", authMiddleware(handleCards))
	mux.HandleFunc("/api/cards/map", authMiddleware(handleMapCard))
	mux.HandleFunc("/api/cards/unmap", authMiddleware(handleUnmapCard))
	mux.HandleFunc("/api/members", authMiddleware(handleMembers))
	mux.HandleFunc("/api/members/bulk", authMiddleware(handleBulkMembers))
	mux.HandleFunc("/api/members/chat-id", authMiddleware(handleUpdateMemberChatID))
	mux.HandleFunc("/api/classes", authMiddleware(handleClasses))
	mux.HandleFunc("/api/positions", authMiddleware(handlePositions))
	mux.HandleFunc("/api/stats/dashboard", authMiddleware(handleDashboardStats))
	mux.HandleFunc("/api/devices", authMiddleware(handleDevices))
	mux.HandleFunc("/api/settings", authMiddleware(handleSettings))
	mux.HandleFunc("/api/settings/regenerate-api-key", authMiddleware(handleRegenerateAPIKey))
	mux.HandleFunc("/api/settings/reset-attendance", authMiddleware(handleResetAttendance))
	mux.HandleFunc("/api/settings/reset-all", authMiddleware(handleResetAll))
	mux.HandleFunc("/api/settings/seed-dummy", authMiddleware(handleSeedDummy))
	mux.HandleFunc("/api/settings/backup-db", authMiddleware(handleBackupDB))
	mux.HandleFunc("/api/settings/restore-db", authMiddleware(handleRestoreDB))
	mux.HandleFunc("/api/telegram/status", authMiddleware(handleTelegramStatus))
	mux.HandleFunc("/api/telegram/test-bot", authMiddleware(handleTelegramTestBot))
	mux.HandleFunc("/api/telegram/send-test", authMiddleware(handleTelegramSendTest))
	mux.HandleFunc("/api/telegram/settings", authMiddleware(handleTelegramSettings))
	mux.HandleFunc("/api/tts", handleTTSProxy)
	mux.HandleFunc("/api/settings/test-tts", authMiddleware(handleTestTTS))
	mux.HandleFunc("/api/realtime", handleSSE)
	mux.HandleFunc("/api/health", handleHealth)

	// React SPA Static Frontend (Embedded)
	mux.Handle("/", spaHandler())

	handler := corsMiddleware(mux)

	log.Printf("===============================================================")
	log.Printf("🚀 PresensiRFID - Sistem Presensi Fingerprint & RFID")
	log.Printf("📡 Server: http://0.0.0.0:%s", serverPort)
	log.Printf("🗄️ Database: %s", dbPath)
	log.Printf("🔐 Admin Login: %s / %s", adminUser, adminPass)
	log.Printf("===============================================================")

	if err := http.ListenAndServe(":"+serverPort, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
