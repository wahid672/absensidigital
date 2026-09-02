package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed index.html
var indexHTML []byte

// Global Configuration
var (
	jwtSecret   = getEnv("JWT_SECRET", "siakad_esp32_iot_secret_key_2026")
	adminUser   = getEnv("ADMIN_USER", "admin")
	adminPass   = getEnv("ADMIN_PASS", "admin123")
	serverPort  = getEnv("PORT", "8080")
	dbPath      = getEnv("DB_PATH", "data/absensi.db")
	db          *sql.DB
	sseClients  = make(map[chan string]bool)
	sseMutex    sync.Mutex
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
	Nama      string `json:"nama"`
	Tipe      string `json:"tipe"` // "siswa" | "guru"
	Kelas     string `json:"kelas"` // e.g. "10 IPA 1" atau "Guru Fiqih"
	NoHP      string `json:"no_hp"`
	CreatedAt string `json:"created_at"`
}

type AttendanceRecord struct {
	ID           int    `json:"id"`
	UID          string `json:"uid"`
	Nama         string `json:"nama"`
	Tipe         string `json:"tipe"` // "siswa" | "guru"
	Kelas        string `json:"kelas"`
	Tanggal      string `json:"tanggal"` // YYYY-MM-DD
	WaktuMasuk   string `json:"waktu_masuk"`
	StatusMasuk  string `json:"status_masuk"` // "tepat" | "telat" | "-"
	WaktuKeluar  string `json:"waktu_keluar"`
	StatusKeluar string `json:"status_keluar"` // "tepat" | "cepat" | "-"
	DeviceID     string `json:"id_mesin"`
	CreatedAt    string `json:"created_at"`
}

type TapRequest struct {
	DeviceID string `json:"device_id"`
	RFIDTag  string `json:"rfid_uid"`
	TipeScan string `json:"tipe_scan"` // "auto", "masuk", "keluar"
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
	// Pastikan folder database ada
	dir := "data"
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("Warning creating data dir: %v", err)
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Gagal membuka database SQLite (%s): %v", dbPath, err)
	}

	// Buat Tabel Database
	schema := `
	CREATE TABLE IF NOT EXISTS members (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		uid TEXT UNIQUE NOT NULL,
		nama TEXT NOT NULL,
		tipe TEXT NOT NULL,
		kelas TEXT DEFAULT '',
		no_hp TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
	`
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("Gagal inisialisasi schema database: %v", err)
	}

	// Seed Data jika tabel members kosong
	seedInitialData()
}

func seedInitialData() {
	var count int
	db.QueryRow("SELECT COUNT(*) FROM members").Scan(&count)
	if count > 0 {
		return
	}

	log.Println("🌱 Memasukkan seed data awal ke database SQLite...")

	members := []Member{
		{UID: "A1B2C301", Nama: "Muhammad Rizky Pratama", Tipe: "siswa", Kelas: "10 IPA 1", NoHP: "081234567890"},
		{UID: "A1B2C302", Nama: "Ustadz Ahmad Fauzi, S.Pd.I", Tipe: "guru", Kelas: "Guru Fiqih & Hadits", NoHP: "081234567891"},
		{UID: "A1B2C303", Nama: "Aisyah Nurul Hidayah", Tipe: "siswa", Kelas: "11 IPS 2", NoHP: "081234567892"},
		{UID: "A1B2C304", Nama: "Ustadzah Fatimah Zahra, M.Pd", Tipe: "guru", Kelas: "Guru Bahasa Arab", NoHP: "081234567893"},
		{UID: "A1B2C305", Nama: "Fajar Dwi Santoso", Tipe: "siswa", Kelas: "12 IPA 1", NoHP: "081234567894"},
		{UID: "A1B2C306", Nama: "Zaid Bin Haritsah", Tipe: "siswa", Kelas: "10 IPA 2", NoHP: "081234567895"},
	}

	for _, m := range members {
		db.Exec("INSERT INTO members (uid, nama, tipe, kelas, no_hp) VALUES (?, ?, ?, ?, ?)",
			m.UID, m.Nama, m.Tipe, m.Kelas, m.NoHP)
	}

	devices := []DeviceInfo{
		{DeviceID: "ESP32-GATE-01", Nama: "Mesin Gerbang Utama", Lokasi: "Pintu Masuk Utama"},
		{DeviceID: "ESP32-GATE-02", Nama: "Mesin Gedung Asrama", Lokasi: "Lobby Asrama"},
	}

	for _, d := range devices {
		db.Exec("INSERT INTO devices (device_id, nama, lokasi, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
			d.DeviceID, d.Nama, d.Lokasi)
	}

	// Seed data absensi hari ini
	today := time.Now().Format("2006-01-02")
	db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) VALUES 
		('A1B2C301', 'Muhammad Rizky Pratama', 'siswa', '10 IPA 1', ?, '06:45:12', 'tepat', '15:05:30', 'tepat', 'ESP32-GATE-01'),
		('A1B2C302', 'Ustadz Ahmad Fauzi, S.Pd.I', 'guru', 'Guru Fiqih & Hadits', ?, '06:30:45', 'tepat', '15:30:10', 'tepat', 'ESP32-GATE-01'),
		('A1B2C303', 'Aisyah Nurul Hidayah', 'siswa', '11 IPS 2', ?, '07:15:20', 'telat', '15:00:15', 'tepat', 'ESP32-GATE-02'),
		('A1B2C304', 'Ustadzah Fatimah Zahra, M.Pd', 'guru', 'Guru Bahasa Arab', ?, '06:40:10', 'tepat', '-', '-', 'ESP32-GATE-01'),
		('A1B2C305', 'Fajar Dwi Santoso', 'siswa', '12 IPA 1', ?, '07:08:40', 'telat', '-', '-', 'ESP32-GATE-02')
	`, today, today, today, today, today)

	log.Println("✅ Seed data database SQLite berhasil dibuat.")
}

// -------------------------------------------------------------
// SSE REALTIME BROADCASTING
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
			// Channel penuh / client lag
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

	// Kirim pesan koneksi pertama
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
// JWT UTILITIES (HS256 Standard)
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
		Exp:      time.Now().Add(72 * time.Hour).Unix(), // 3 Hari
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
		return nil, fmt.Errorf("token JWT telah kadaluarsa (expired)")
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
		writeJSONError(w, http.StatusInternalServerError, "Gagal meng-generate token JWT.")
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

// 2. GET /api/attendance?tanggal=YYYY-MM-DD&tipe=all|siswa|guru&bulan=YYYY-MM
func handleGetAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method GET yang diizinkan.")
		return
	}

	query := r.URL.Query()
	tanggal := query.Get("tanggal")
	bulan := query.Get("bulan")
	tipe := strings.ToLower(query.Get("tipe"))
	if tipe == "" {
		tipe = "all"
	}

	var rows *sql.Rows
	var err error

	// Query bulanan untuk Cetak Rekap Bulanan
	if bulan != "" {
		if tipe == "all" {
			rows, err = db.Query(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin, created_at 
				FROM attendances WHERE strftime('%Y-%m', tanggal) = ? ORDER BY tanggal DESC, waktu_masuk DESC`, bulan)
		} else {
			rows, err = db.Query(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin, created_at 
				FROM attendances WHERE strftime('%Y-%m', tanggal) = ? AND lower(tipe) = ? ORDER BY tanggal DESC, waktu_masuk DESC`, bulan, tipe)
		}
	} else {
		// Query harian
		if tanggal == "" {
			tanggal = time.Now().Format("2006-01-02")
		}
		if tipe == "all" {
			rows, err = db.Query(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin, created_at 
				FROM attendances WHERE tanggal = ? ORDER BY waktu_masuk DESC, id DESC`, tanggal)
		} else {
			rows, err = db.Query(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin, created_at 
				FROM attendances WHERE tanggal = ? AND lower(tipe) = ? ORDER BY waktu_masuk DESC, id DESC`, tanggal, tipe)
		}
	}

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
		"total":   len(list),
		"data":    list,
	})
}

// 3. POST /api/attendance/tap (Realtime ESP32 RFID / Fingerprint Tap)
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

	// Update device last_seen
	db.Exec(`INSERT INTO devices (device_id, nama, lokasi, last_seen) 
		VALUES (?, ?, 'Pintu Masuk', CURRENT_TIMESTAMP) 
		ON CONFLICT(device_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`, req.DeviceID, req.DeviceID)

	// Cari member berdasarkan UID
	var member Member
	err := db.QueryRow("SELECT id, uid, nama, tipe, kelas, no_hp FROM members WHERE uid = ?", req.RFIDTag).
		Scan(&member.ID, &member.UID, &member.Nama, &member.Tipe, &member.Kelas, &member.NoHP)

	if err != nil {
		// Jika kartu belum terdaftar, buat otomatis member tamu/baru
		member = Member{
			UID:   req.RFIDTag,
			Nama:  fmt.Sprintf("Kartu Baru (#%s)", req.RFIDTag),
			Tipe:  "siswa",
			Kelas: "Belum Ditentukan",
		}
		db.Exec("INSERT OR IGNORE INTO members (uid, nama, tipe, kelas) VALUES (?, ?, ?, ?)",
			member.UID, member.Nama, member.Tipe, member.Kelas)
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	currentTime := now.Format("15:04:05")

	// Cek apakah sudah ada absensi hari ini untuk UID ini
	var existing AttendanceRecord
	checkErr := db.QueryRow(`SELECT id, uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin 
		FROM attendances WHERE uid = ? AND tanggal = ? ORDER BY id DESC LIMIT 1`, req.RFIDTag, today).
		Scan(&existing.ID, &existing.UID, &existing.Nama, &existing.Tipe, &existing.Kelas, &existing.Tanggal,
			&existing.WaktuMasuk, &existing.StatusMasuk, &existing.WaktuKeluar, &existing.StatusKeluar, &existing.DeviceID)

	var record AttendanceRecord
	var actionMessage string

	if checkErr == sql.ErrNoRows {
		// Belum absen masuk hari ini -> Catat ABSEN MASUK
		statusMasuk := "tepat"
		if now.Hour() > 7 || (now.Hour() == 7 && now.Minute() > 0) {
			statusMasuk = "telat"
		}

		res, err := db.Exec(`INSERT INTO attendances (uid, nama, tipe, kelas, tanggal, waktu_masuk, status_masuk, waktu_keluar, status_keluar, id_mesin) 
			VALUES (?, ?, ?, ?, ?, ?, ?, '-', '-', ?)`,
			member.UID, member.Nama, member.Tipe, member.Kelas, today, currentTime, statusMasuk, req.DeviceID)
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
			Tanggal:      today,
			WaktuMasuk:   currentTime,
			StatusMasuk:  statusMasuk,
			WaktuKeluar:  "-",
			StatusKeluar: "-",
			DeviceID:     req.DeviceID,
		}
		actionMessage = fmt.Sprintf("Absen Masuk Berhasil (%s - %s)", member.Nama, statusMasuk)
	} else {
		// Sudah ada absen masuk -> Catat ABSEN KELUAR / PULANG
		statusKeluar := "tepat"
		if now.Hour() < 15 {
			statusKeluar = "cepat"
		}

		db.Exec(`UPDATE attendances SET waktu_keluar = ?, status_keluar = ?, id_mesin = ? WHERE id = ?`,
			currentTime, statusKeluar, req.DeviceID, existing.ID)

		record = existing
		record.WaktuKeluar = currentTime
		record.StatusKeluar = statusKeluar
		record.DeviceID = req.DeviceID
		actionMessage = fmt.Sprintf("Absen Keluar/Pulang Berhasil (%s - %s)", member.Nama, statusKeluar)
	}

	log.Printf("[REALTIME TAP] %s | %s | %s | %s", actionMessage, record.Nama, req.DeviceID, currentTime)

	// Broadcast ke semua client Web Admin via SSE Realtime!
	broadcastSSE("attendance_tap", map[string]interface{}{
		"action":  actionMessage,
		"record":  record,
		"time":    currentTime,
		"message": actionMessage,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": actionMessage,
		"data":    record,
	})
}

// 4. CRUD MEMBERS (/api/members)
func handleMembers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// List members
		tipe := strings.ToLower(r.URL.Query().Get("tipe"))
		search := strings.ToLower(r.URL.Query().Get("search"))

		query := "SELECT id, uid, nama, tipe, kelas, no_hp, created_at FROM members WHERE 1=1"
		var args []interface{}

		if tipe != "" && tipe != "all" {
			query += " AND lower(tipe) = ?"
			args = append(args, tipe)
		}
		if search != "" {
			query += " AND (lower(nama) LIKE ? OR lower(uid) LIKE ? OR lower(kelas) LIKE ?)"
			args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%")
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
			rows.Scan(&m.ID, &m.UID, &m.Nama, &m.Tipe, &m.Kelas, &m.NoHP, &m.CreatedAt)
			members = append(members, m)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": "success",
			"total":  len(members),
			"data":   members,
		})

	case http.MethodPost:
		// Create member
		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		m.UID = strings.TrimSpace(m.UID)
		m.Nama = strings.TrimSpace(m.Nama)
		m.Tipe = strings.ToLower(strings.TrimSpace(m.Tipe))

		if m.UID == "" || m.Nama == "" {
			writeJSONError(w, http.StatusBadRequest, "UID Kartu RFID dan Nama Lengkap wajib diisi.")
			return
		}
		if m.Tipe != "siswa" && m.Tipe != "guru" {
			m.Tipe = "siswa"
		}

		res, err := db.Exec("INSERT INTO members (uid, nama, tipe, kelas, no_hp) VALUES (?, ?, ?, ?, ?)",
			m.UID, m.Nama, m.Tipe, m.Kelas, m.NoHP)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "UID Kartu RFID sudah terdaftar pada pengguna lain.")
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
		// Update member
		var m Member
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Payload JSON tidak valid.")
			return
		}
		if m.ID == 0 {
			writeJSONError(w, http.StatusBadRequest, "ID Member wajib disertakan.")
			return
		}

		_, err := db.Exec("UPDATE members SET uid = ?, nama = ?, tipe = ?, kelas = ?, no_hp = ? WHERE id = ?",
			m.UID, m.Nama, m.Tipe, m.Kelas, m.NoHP, m.ID)
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
		// Delete member
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

// 5. GET /api/devices
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

// 6. GET /api/health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"database":  "sqlite3",
		"timestamp": time.Now().Format(time.RFC3339),
		"app":       "SIAKAD Absensi Digital IoT ESP32 (SQLite + SSE Realtime)",
	})
}

// 7. GET / (Serve Embedded SPA Frontend)
func handleSPA(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(indexHTML)
}

// Helpers
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
	// Inisialisasi Database SQLite
	initDatabase()
	defer db.Close()

	mux := http.NewServeMux()

	// REST API Endpoints
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/attendance", authMiddleware(handleGetAttendance))
	mux.HandleFunc("/api/attendance/tap", handleTapAttendance) // Public untuk ESP32
	mux.HandleFunc("/api/members", authMiddleware(handleMembers))
	mux.HandleFunc("/api/devices", authMiddleware(handleDevices))
	mux.HandleFunc("/api/realtime", handleSSE) // SSE Live Stream
	mux.HandleFunc("/api/health", handleHealth)

	// SPA Static Frontend (Served directly from embedded index.html)
	mux.HandleFunc("/", handleSPA)

	handler := corsMiddleware(mux)

	log.Printf("===============================================================")
	log.Printf("🚀 SIAKAD Absensi Digital - Fullstack Golang + SQLite + SSE")
	log.Printf("📡 Server: http://0.0.0.0:%s", serverPort)
	log.Printf("🗄️ Database: %s", dbPath)
	log.Printf("🔐 Admin Login: %s / %s", adminUser, adminPass)
	log.Printf("===============================================================")

	if err := http.ListenAndServe(":"+serverPort, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
