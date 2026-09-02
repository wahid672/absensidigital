package main

import (
	"crypto/hmac"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

//go:embed index.html
var indexHTML []byte

// Global Configuration & Secret
var (
	jwtSecret   = getEnv("JWT_SECRET", "siakad_esp32_iot_secret_key_2026")
	adminUser   = getEnv("ADMIN_USER", "admin")
	adminPass   = getEnv("ADMIN_PASS", "admin123")
	serverPort  = getEnv("PORT", "8080")
	muStore     sync.RWMutex
	attendanceDB []AttendanceRecord
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

type AttendanceRecord struct {
	ID           int    `json:"id"`
	UID          string `json:"uid"`
	Nama         string `json:"nama"`
	Tipe         string `json:"tipe"` // "siswa" atau "guru"
	Tanggal      string `json:"tanggal"` // YYYY-MM-DD
	WaktuMasuk   string `json:"waktu_masuk"`
	StatusMasuk  string `json:"status_masuk"` // "tepat", "telat"
	WaktuKeluar  string `json:"waktu_keluar"`
	StatusKeluar string `json:"status_keluar"` // "tepat", "cepat", "-"
	DeviceID     string `json:"id_mesin"`
}

type TapRequest struct {
	DeviceID  string `json:"device_id"`
	RFIDTag   string `json:"rfid_uid"`
	TipeScan  string `json:"tipe_scan"` // "masuk" atau "keluar"
	Timestamp string `json:"timestamp"`
}

// Inisialisasi Seed Data awal
func init() {
	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")

	attendanceDB = []AttendanceRecord{
		{
			ID:           1,
			UID:          "A1B2C301",
			Nama:         "Muhammad Rizky Pratama",
			Tipe:         "siswa",
			Tanggal:      today,
			WaktuMasuk:   "06:45:12",
			StatusMasuk:  "tepat",
			WaktuKeluar:  "15:05:30",
			StatusKeluar: "tepat",
			DeviceID:     "ESP32-GATE-01",
		},
		{
			ID:           2,
			UID:          "A1B2C302",
			Nama:         "Ustadz Ahmad Fauzi, S.Pd.I",
			Tipe:         "guru",
			Tanggal:      today,
			WaktuMasuk:   "06:30:45",
			StatusMasuk:  "tepat",
			WaktuKeluar:  "15:30:10",
			StatusKeluar: "tepat",
			DeviceID:     "ESP32-GATE-01",
		},
		{
			ID:           3,
			UID:          "A1B2C303",
			Nama:         "Aisyah Nurul Hidayah",
			Tipe:         "siswa",
			Tanggal:      today,
			WaktuMasuk:   "07:15:20",
			StatusMasuk:  "telat",
			WaktuKeluar:  "15:00:15",
			StatusKeluar: "tepat",
			DeviceID:     "ESP32-GATE-02",
		},
		{
			ID:           4,
			UID:          "A1B2C304",
			Nama:         "Ustadzah Fatimah Zahra, M.Pd",
			Tipe:         "guru",
			Tanggal:      today,
			WaktuMasuk:   "06:40:10",
			StatusMasuk:  "tepat",
			WaktuKeluar:  "-",
			StatusKeluar: "-",
			DeviceID:     "ESP32-GATE-01",
		},
		{
			ID:           5,
			UID:          "A1B2C305",
			Nama:         "Fajar Dwi Santoso",
			Tipe:         "siswa",
			Tanggal:      today,
			WaktuMasuk:   "07:08:40",
			StatusMasuk:  "telat",
			WaktuKeluar:  "-",
			StatusKeluar: "-",
			DeviceID:     "ESP32-GATE-02",
		},
		{
			ID:           6,
			UID:          "A1B2C306",
			Nama:         "Zaid Bin Haritsah",
			Tipe:         "siswa",
			Tanggal:      yesterday,
			WaktuMasuk:   "06:50:00",
			StatusMasuk:  "tepat",
			WaktuKeluar:  "15:10:00",
			StatusKeluar: "tepat",
			DeviceID:     "ESP32-GATE-01",
		},
	}
}

// -------------------------------------------------------------
// JWT UTILITIES (Zero External Dependencies, HS256 Standard)
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
		Exp:      time.Now().Add(24 * time.Hour).Unix(), // Berlaku 24 jam
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

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
		return nil, fmt.Errorf("tanda tangan signature JWT tidak valid")
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("gagal decode payload JWT: %v", err)
	}

	var payload JWTPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return nil, fmt.Errorf("gagal parsing payload JWT: %v", err)
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

// 2. GET /api/attendance?tanggal=YYYY-MM-DD&tipe=all|siswa|guru
func handleGetAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method GET yang diizinkan.")
		return
	}

	query := r.URL.Query()
	tanggal := query.Get("tanggal")
	tipe := strings.ToLower(query.Get("tipe"))

	if tanggal == "" {
		tanggal = time.Now().Format("2006-01-02")
	}
	if tipe == "" {
		tipe = "all"
	}

	muStore.RLock()
	defer muStore.RUnlock()

	var filtered []AttendanceRecord
	for _, rec := range attendanceDB {
		// Filter tanggal
		if rec.Tanggal != tanggal {
			continue
		}
		// Filter tipe
		if tipe != "all" && strings.ToLower(rec.Tipe) != tipe {
			continue
		}
		filtered = append(filtered, rec)
	}

	if filtered == nil {
		filtered = []AttendanceRecord{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"tanggal": tanggal,
		"tipe":    tipe,
		"total":   len(filtered),
		"data":    filtered,
	})
}

// 3. POST /api/attendance/tap (Mesin ESP32 RFID / Fingerprint Tap)
func handleTapAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Hanya method POST yang diizinkan.")
		return
	}

	var req TapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON dari ESP32 tidak valid.")
		return
	}

	if req.RFIDTag == "" {
		writeJSONError(w, http.StatusBadRequest, "Parameter rfid_uid tidak boleh kosong.")
		return
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	currentTime := now.Format("15:04:05")

	// Tentukan status masuk/telat (batas jam 07:00:00)
	statusMasuk := "tepat"
	if now.Hour() > 7 || (now.Hour() == 7 && now.Minute() > 0) {
		statusMasuk = "telat"
	}

	muStore.Lock()
	newID := len(attendanceDB) + 1
	record := AttendanceRecord{
		ID:           newID,
		UID:          req.RFIDTag,
		Nama:         fmt.Sprintf("User Tag #%s", req.RFIDTag),
		Tipe:         "siswa",
		Tanggal:      today,
		WaktuMasuk:   currentTime,
		StatusMasuk:  statusMasuk,
		WaktuKeluar:  "-",
		StatusKeluar: "-",
		DeviceID:     req.DeviceID,
	}
	if record.DeviceID == "" {
		record.DeviceID = "ESP32-DEV"
	}
	attendanceDB = append(attendanceDB, record)
	muStore.Unlock()

	log.Printf("[ESP32 TAP] Device: %s | UID: %s | Time: %s", record.DeviceID, req.RFIDTag, currentTime)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Absensi berhasil dicatat",
		"data":    record,
	})
}

// 4. GET /api/health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().Format(time.RFC3339),
		"app":       "Absensi Digital ESP32 IoT Backend & SPA",
	})
}

// 5. GET / (Serve SPA Frontend)
func handleSPA(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(indexHTML)
}

// Helper JSON responses
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
	mux := http.NewServeMux()

	// REST API Endpoints
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/attendance", authMiddleware(handleGetAttendance))
	mux.HandleFunc("/api/attendance/tap", handleTapAttendance)
	mux.HandleFunc("/api/health", handleHealth)

	// SPA Static Frontend (Served directly from embedded index.html)
	mux.HandleFunc("/", handleSPA)

	handler := corsMiddleware(mux)

	log.Printf("=====================================================")
	log.Printf("🚀 SIAKAD Absensi Digital - Fullstack Golang & SPA")
	log.Printf("📡 Server berjalan pada http://0.0.0.0:%s", serverPort)
	log.Printf("🔐 Default Admin: %s / %s", adminUser, adminPass)
	log.Printf("=====================================================")

	if err := http.ListenAndServe(":"+serverPort, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
