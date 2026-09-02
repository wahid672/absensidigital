package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
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
	dbPath     = getEnv("DB_PATH", "data/absensi.db")
	db         *sql.DB
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
	ID        int    `json:"id"`
	UID       string `json:"uid"`
	NISNIP    string `json:"nis_nip"` // NIS untuk Santri, NIP untuk Guru
	Nama      string `json:"nama"`
	Tipe      string `json:"tipe"`  // "siswa" | "guru"
	Kelas     string `json:"kelas"` // e.g. "10 IPA 1" atau "Guru Fiqih & Hadits"
	NoHP      string `json:"no_hp"`
	CreatedAt string `json:"created_at"`
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

type TapRequest struct {
	DeviceID  string `json:"device_id"`
	RFIDTag   string `json:"rfid_uid"`
	TipeScan  string `json:"tipe_scan"` // "auto", "masuk", "keluar"
	Timestamp string `json:"timestamp"` // e.g. "2026-09-02T06:45:30+07:00"
	Tanggal   string `json:"tanggal"`   // e.g. "2026-09-02"
	Waktu     string `json:"waktu"`     // e.g. "06:45:30"
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
		uid TEXT UNIQUE NOT NULL,
		nis_nip TEXT DEFAULT '',
		nama TEXT NOT NULL,
		tipe TEXT NOT NULL,
		kelas TEXT DEFAULT '',
		no_hp TEXT DEFAULT '',
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

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("Gagal inisialisasi schema database: %v", err)
	}

	// Migrations for existing database
	db.Exec("ALTER TABLE members ADD COLUMN nis_nip TEXT DEFAULT ''")

	// Default settings
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_nama', 'YAYASAN PONDOK PESANTREN & SEKOLAH DIGITAL')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_alamat', 'Jl. Pesantren Digital No. 01')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_kota', 'Kota Santri')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_register_card', '1')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('jam_masuk_batas', '07:00')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('jam_pulang_batas', '15:00')")
	db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('kepala_nama', 'KH. Ahmad Zaki, Lc., M.Ag')")

	seedInitialData()
}

func seedInitialData() {
	// Seed Classes
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

	// Seed Positions
	var posCount int
	db.QueryRow("SELECT COUNT(*) FROM positions").Scan(&posCount)
	if posCount == 0 {
		positions := []Position{
			{Nama: "Guru Fiqih & Hadits", Keterangan: "Pengampu Pelajaran Fiqih & Hadits"},
			{Nama: "Guru Bahasa Arab", Keterangan: "Pengampu Pelajaran Bahasa Arab & Nahwu"},
			{Nama: "Guru Tahfidz & Quran", Keterangan: "Pembimbing Tahfidz Al-Qur'an"},
			{Nama: "Guru Aqidah Akhlak", Keterangan: "Pengampu Pelajaran Aqidah Akhlak"},
			{Nama: "Guru Matematika & Sains", Keterangan: "Pengampu Bidang Eksak"},
			{Nama: "Guru Bahasa Inggris", Keterangan: "Pengampu Pelajaran Bahasa Inggris"},
			{Nama: "Wali Asrama & Pengasuhan", Keterangan: "Koordinator Pengasuhan Santri"},
			{Nama: "Kepala Madrasah / Kurikulum", Keterangan: "Kepala Bidang Akademik"},
		}
		for _, p := range positions {
			db.Exec("INSERT OR IGNORE INTO positions (nama, keterangan) VALUES (?, ?)", p.Nama, p.Keterangan)
		}
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM members").Scan(&count)
	if count > 0 {
		return
	}
	seedDummyData()
}

func seedDummyData() {
	log.Println("🌱 Memasukkan seed data dummy santri, guru & absensi...")

	members := []Member{
		{UID: "A1B2C301", NISNIP: "20261001", Nama: "Muhammad Rizky Pratama", Tipe: "siswa", Kelas: "10 IPA 1", NoHP: "081234567801"},
		{UID: "A1B2C302", NISNIP: "198507122010011001", Nama: "Ustadz Ahmad Fauzi, S.Pd.I", Tipe: "guru", Kelas: "Guru Fiqih & Hadits", NoHP: "081234567802"},
		{UID: "A1B2C303", NISNIP: "20261002", Nama: "Aisyah Nurul Hidayah", Tipe: "siswa", Kelas: "11 IPS 2", NoHP: "081234567803"},
		{UID: "A1B2C304", NISNIP: "198803152012012002", Nama: "Ustadzah Fatimah Zahra, M.Pd", Tipe: "guru", Kelas: "Guru Bahasa Arab", NoHP: "081234567804"},
		{UID: "A1B2C305", NISNIP: "20261003", Nama: "Fajar Dwi Santoso", Tipe: "siswa", Kelas: "12 IPA 1", NoHP: "081234567805"},
		{UID: "A1B2C306", NISNIP: "20261004", Nama: "Zaid Bin Haritsah", Tipe: "siswa", Kelas: "10 IPA 2", NoHP: "081234567806"},
		{UID: "A1B2C307", NISNIP: "20261005", Nama: "Khadijah Al-Kubra", Tipe: "siswa", Kelas: "11 IPA 1", NoHP: "081234567807"},
		{UID: "A1B2C308", NISNIP: "198211052008011003", Nama: "Ustadz Abdullah Yusuf, Lc", Tipe: "guru", Kelas: "Guru Tahfidz & Quran", NoHP: "081234567808"},
		{UID: "A1B2C309", NISNIP: "20261006", Nama: "Bilal Bin Rabah", Tipe: "siswa", Kelas: "12 IPS 1", NoHP: "081234567809"},
		{UID: "A1B2C310", NISNIP: "199002202015012004", Nama: "Ustadzah Maryam Jameelah", Tipe: "guru", Kelas: "Guru Aqidah Akhlak", NoHP: "081234567810"},
	}

	for _, m := range members {
		db.Exec("INSERT OR IGNORE INTO members (uid, nis_nip, nama, tipe, kelas, no_hp) VALUES (?, ?, ?, ?, ?, ?)",
			m.UID, m.NISNIP, m.Nama, m.Tipe, m.Kelas, m.NoHP)
	}

	devices := []DeviceInfo{
		{DeviceID: "ESP32-GATE-01", Nama: "Mesin Gerbang Utama", Lokasi: "Pintu Masuk Utama"},
		{DeviceID: "ESP32-GATE-02", Nama: "Mesin Gedung Asrama", Lokasi: "Lobby Asrama Santri"},
	}

	for _, d := range devices {
		db.Exec("INSERT OR IGNORE INTO devices (device_id, nama, lokasi, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
			d.DeviceID, d.Nama, d.Lokasi)
	}

	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	twoDaysAgo := time.Now().AddDate(0, 0, -2).Format("2006-01-02")

	db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) VALUES 
		('A1B2C301', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:45:12', 'tepat', '15:05:30', 'tepat', 'ESP32-GATE-01'),
		('A1B2C302', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:30:45', 'tepat', '15:30:10', 'tepat', 'ESP32-GATE-01'),
		('A1B2C303', 'Aisyah Nurul Hidayah', 'siswa', '11 IPS 2', ?, '07:15:20', 'telat', '15:00:15', 'tepat', 'ESP32-GATE-02'),
		('A1B2C304', 'Ustadzah Fatimah Zahra, M.Pd', 'guru', 'Guru Bahasa Arab', ?, '06:40:10', 'tepat', '-', '-', 'ESP32-GATE-01'),
		('A1B2C305', 'Fajar Dwi Santoso', 'siswa', '12 IPA 1', ?, '07:08:40', 'telat', '-', '-', 'ESP32-GATE-02'),
		('A1B2C306', 'Zaid Bin Haritsah', 'siswa', '10 IPA 2', ?, '06:55:00', 'tepat', '15:10:00', 'tepat', 'ESP32-GATE-01'),
		('A1B2C307', 'Khadijah Al-Kubra', 'siswa', '11 IPA 1', ?, '06:38:15', 'tepat', '15:00:00', 'tepat', 'ESP32-GATE-01'),
		('A1B2C308', 'Ustadz Abdullah Yusuf, Lc', 'guru', 'Guru Tahfidz & Quran', ?, '06:20:00', 'tepat', '16:00:00', 'tepat', 'ESP32-GATE-01'),
		('A1B2C301', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:42:00', 'tepat', '15:00:00', 'tepat', 'ESP32-GATE-01'),
		('A1B2C302', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:28:00', 'tepat', '15:30:00', 'tepat', 'ESP32-GATE-01')
	`, today, today, today, today, today, yesterday, yesterday, yesterday, twoDaysAgo, twoDaysAgo)

	log.Println("✅ Data dummy berhasil di-generate.")
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
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeJSONError(w, http.StatusUnauthorized, "Header Authorization (Bearer token) diperlukan.")
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
			Name:     "Administrator Absensi",
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
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal menyimpan absensi: %v", err))
			return
		}

		lastID, _ := res.LastInsertId()
		a.ID = int(lastID)

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Data absensi berhasil ditambahkan secara manual",
			"data":    a,
		})

	case http.MethodPut:
		var a AttendanceRecord
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}

		if a.ID == 0 {
			writeJSONError(w, http.StatusBadRequest, "ID Absensi wajib disertakan.")
			return
		}

		_, err := db.Exec(`UPDATE attendances SET uid = ?, nama = ?, tipe = ?, kelas = ?, tanggal = ?, waktu_masuk = ?, status_masuk = ?, waktu_keluar = ?, status_keluar = ?, id_mesin = ? WHERE id = ?`,
			a.UID, a.Nama, a.Tipe, a.Kelas, a.Tanggal, a.WaktuMasuk, a.StatusMasuk, a.WaktuKeluar, a.StatusKeluar, a.DeviceID, a.ID)

		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Gagal memperbarui absensi: %v", err))
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data absensi berhasil diperbarui",
			"data":    a,
		})

	case http.MethodDelete:
		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}

		_, err = db.Exec("DELETE FROM attendances WHERE id = ?", id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal menghapus data absensi.")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data absensi berhasil dihapus",
		})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "Method tidak didukung.")
	}
}

// 3. POST /api/attendance/tap (Realtime & Backdate Offline Sync dari ESP32)
func handleTapAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	var req TapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
		return
	}

	req.RFIDTag = strings.TrimSpace(req.RFIDTag)
	if req.RFIDTag == "" {
		writeJSONError(w, http.StatusBadRequest, "Parameter rfid_uid tidak boleh kosong.")
		return
	}

	if req.DeviceID == "" {
		req.DeviceID = "ESP32-GATE-01"
	}

	db.Exec(`INSERT INTO devices (device_id, nama, lokasi, last_seen) 
		VALUES (?, ?, 'Pintu Masuk', CURRENT_TIMESTAMP) 
		ON CONFLICT(device_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`, req.DeviceID, req.DeviceID)

	tDate, tTime, tHour, tMin := parseDateTime(req.Tanggal, req.Waktu, req.Timestamp)
	inH, inM, outH, outM := getThresholdTimes()

	var autoRegister string
	db.QueryRow("SELECT value FROM settings WHERE key = 'auto_register_card'").Scan(&autoRegister)
	if autoRegister == "" {
		autoRegister = "1"
	}

	var member Member
	err := db.QueryRow("SELECT id, uid, nis_nip, nama, tipe, kelas, no_hp FROM members WHERE uid = ?", req.RFIDTag).
		Scan(&member.ID, &member.UID, &member.NISNIP, &member.Nama, &member.Tipe, &member.Kelas, &member.NoHP)

	if err != nil {
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

		// Auto Register ON: Otomatis daftarkan kartu baru
		member = Member{
			UID:   req.RFIDTag,
			Nama:  fmt.Sprintf("Kartu Baru (#%s)", req.RFIDTag),
			Tipe:  "siswa",
			Kelas: "Belum Ditentukan",
		}
		db.Exec("INSERT OR IGNORE INTO members (uid, nama, tipe, kelas) VALUES (?, ?, ?, ?)",
			member.UID, member.Nama, member.Tipe, member.Kelas)
	}

	var existing AttendanceRecord
	checkErr := db.QueryRow(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin 
		FROM attendances WHERE uid = ? AND tanggal = ? ORDER BY id DESC LIMIT 1`, req.RFIDTag, tDate).
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
			writeJSONError(w, http.StatusInternalServerError, "Gagal mencatat absensi masuk.")
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

	} else if existing.WaktuKeluar == "-" || existing.WaktuKeluar == "" {
		if req.TipeScan == "masuk" {
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
		}

	} else {
		statusResult = "already_attended"
		actionType = "already_completed"
		alreadyRecorded = true
		record = existing
		actionMessage = fmt.Sprintf("%s sudah lengkap absen masuk (%s) & keluar (%s) pada tgl %s",
			member.Nama, existing.WaktuMasuk, existing.WaktuKeluar, existing.Tanggal)
	}

	log.Printf("[ESP32 TAP] %s | Tgl: %s %s | Mesin: %s", actionMessage, tDate, tTime, req.DeviceID)

	broadcastSSE("attendance_tap", map[string]interface{}{
		"action":           actionType,
		"status":           statusResult,
		"already_recorded": alreadyRecorded,
		"record":           record,
		"time":             tTime,
		"message":          actionMessage,
	})

	writeJSON(w, statusCode, map[string]interface{}{
		"status":           statusResult,
		"action":           actionType,
		"message":          actionMessage,
		"already_recorded": alreadyRecorded,
		"data":             record,
	})
}

// 4. CRUD MEMBERS (/api/members)
func handleMembers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tipe := strings.ToLower(r.URL.Query().Get("tipe"))
		search := strings.ToLower(r.URL.Query().Get("search"))

		query := "SELECT id, uid, nis_nip, nama, tipe, kelas, no_hp, created_at FROM members WHERE 1=1"
		var args []interface{}

		if tipe != "" && tipe != "all" {
			query += " AND lower(tipe) = ?"
			args = append(args, tipe)
		}
		if search != "" {
			query += " AND (lower(nama) LIKE ? OR lower(uid) LIKE ? OR lower(nis_nip) LIKE ? OR lower(kelas) LIKE ?)"
			args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
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
			rows.Scan(&m.ID, &m.UID, &m.NISNIP, &m.Nama, &m.Tipe, &m.Kelas, &m.NoHP, &m.CreatedAt)
			members = append(members, m)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(members),
			"data":   members,
		})

	case http.MethodPost:
		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		m.UID = strings.TrimSpace(m.UID)
		m.NISNIP = strings.TrimSpace(m.NISNIP)
		m.Nama = strings.TrimSpace(m.Nama)
		m.Tipe = strings.ToLower(strings.TrimSpace(m.Tipe))

		if m.UID == "" || m.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "UID Kartu RFID dan Nama Lengkap wajib diisi.")
			return
		}
		if m.Tipe != "siswa" && m.Tipe != "guru" {
			m.Tipe = "siswa"
		}

		res, err := db.Exec("INSERT INTO members (uid, nis_nip, nama, tipe, kelas, no_hp) VALUES (?, ?, ?, ?, ?, ?)",
			m.UID, m.NISNIP, m.Nama, m.Tipe, m.Kelas, m.NoHP)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "UID Kartu RFID sudah terdaftar.")
			return
		}

		id, _ := res.LastInsertId()
		m.ID = int(id)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"status":  "success",
			"message": "Data berhasil ditambahkan",
			"data":    m,
		})

	case http.MethodPut:
		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		if m.ID == 0 {
			writeJSONError(w, http.StatusBadRequest, "ID Member wajib disertakan.")
			return
		}

		_, err := db.Exec("UPDATE members SET uid = ?, nis_nip = ?, nama = ?, tipe = ?, kelas = ?, no_hp = ? WHERE id = ?",
			m.UID, m.NISNIP, m.Nama, m.Tipe, m.Kelas, m.NoHP, m.ID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Gagal memperbarui data member.")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "success",
			"message": "Data member berhasil diperbarui",
			"data":    m,
		})

	case http.MethodDelete:
		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parameter id tidak valid.")
			return
		}

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
		db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ?", tStr).Scan(&total)
		db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND status_masuk LIKE '%tepat%'", tStr).Scan(&tepat)
		db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND status_masuk LIKE '%telat%'", tStr).Scan(&telat)
		db.QueryRow("SELECT COUNT(*) FROM attendances WHERE tanggal = ? AND (status_masuk = 'izin' OR status_masuk = 'sakit')", tStr).Scan(&izinSakit)

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

func handleResetAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	_, err := db.Exec("DELETE FROM attendances")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Gagal mereset data absensi.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Seluruh riwayat data absensi berhasil dikosongkan.",
	})
}

func handleResetAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	db.Exec("DELETE FROM attendances")
	db.Exec("DELETE FROM members")
	db.Exec("DELETE FROM classes")
	db.Exec("DELETE FROM positions")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Database berhasil di-reset total (Absensi, Anggota, Kelas, dan Jabatan telah dikosongkan).",
	})
}

func handleSeedDummy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	seedInitialData()
	seedDummyData()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Data dummy santri, guru, kelas, jabatan, dan riwayat absensi berhasil di-generate.",
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
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"database":  "sqlite3",
		"timestamp": time.Now().Format(time.RFC3339),
		"app":       "SIAKAD Absensi Digital IoT ESP32 (Backdate, Master Kelas/Jabatan, Dashboard Charts)",
	})
}

// 11. React SPA Static File Handler with Fallback to index.html
func spaHandler() http.Handler {
	distFS, err := fs.Sub(frontendDist, "frontend/dist")
	if err != nil {
		log.Fatalf("Gagal mengakses frontend/dist: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			fileServer.ServeHTTP(w, r)
			return
		}

		f, err := distFS.Open(path)
		if err != nil {
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()

		fileServer.ServeHTTP(w, r)
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
	mux.HandleFunc("/api/attendance/tap", handleTapAttendance) // Public untuk ESP32
	mux.HandleFunc("/api/members", authMiddleware(handleMembers))
	mux.HandleFunc("/api/classes", authMiddleware(handleClasses))
	mux.HandleFunc("/api/positions", authMiddleware(handlePositions))
	mux.HandleFunc("/api/stats/dashboard", authMiddleware(handleDashboardStats))
	mux.HandleFunc("/api/devices", authMiddleware(handleDevices))
	mux.HandleFunc("/api/settings", authMiddleware(handleSettings))
	mux.HandleFunc("/api/settings/reset-attendance", authMiddleware(handleResetAttendance))
	mux.HandleFunc("/api/settings/reset-all", authMiddleware(handleResetAll))
	mux.HandleFunc("/api/settings/seed-dummy", authMiddleware(handleSeedDummy))
	mux.HandleFunc("/api/realtime", handleSSE)
	mux.HandleFunc("/api/health", handleHealth)

	// React SPA Static Frontend (Embedded)
	mux.Handle("/", spaHandler())

	handler := corsMiddleware(mux)

	log.Printf("===============================================================")
	log.Printf("🚀 SIAKAD Absensi Digital - Fullstack Golang + React Vite + SQLite")
	log.Printf("📡 Server: http://0.0.0.0:%s", serverPort)
	log.Printf("🗄️ Database: %s", dbPath)
	log.Printf("🔐 Admin Login: %s / %s", adminUser, adminPass)
	log.Printf("===============================================================")

	if err := http.ListenAndServe(":"+serverPort, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
