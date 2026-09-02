/*************************************
  Program : Smart RFID + Fingerprint R503 (Aura LED) + LCD Non-Blocking UI + Jadwal Sholat
  Chip    : ESP32
  Fitur   : 
  - Scrolling Text di baris 1 (Pesan & Jadwal bergantian)
  - Alternating Text (Jam, Tanggal, Info, Countdown) baris 2
  - Baca RFID & Tampil 5 Detik
  - Fingerprint R503 (Scan, Daftar, dan Hapus Tunggal)
    -> Tap Kartu Master 1x = Rekam Jari Baru
    -> Tap Kartu Master 5x = Hapus 1 Jari (Tempel jari yang ingin dihapus)
  - Aura LED Ring Effect pada R503 untuk feedback visual
  - Restart ESP jika ID = 2054170372
  - Waktu otomatis via WiFi (NTP)
  - Fetch API Jadwal Sholat 1 hari sekali + Cache memory
  - Buzzer & Layar kedip saat masuk waktu sholat
 ***********************************/

#include <WiFi.h>
#include <time.h>
#include <SPI.h>
#include <FS.h>
#include <SPIFFS.h>
#include <MFRC522.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Adafruit_Fingerprint.h> 
#include <WebServer.h>
#include <ArduinoOTA.h>

// Instansiasi Web Server ESP32 (Port 80)
WebServer webServer(80); 

// Konfigurasi WiFi
const char* ssid       = "ridawahid.web.id";
const char* password   = "ridawahid123";
// const char* ssid       = "SIAKADPONPES";
// const char* password   = "123456789";

// Konfigurasi API Endpoint & Perangkat (IoT Server)
const char* serverUrl   = "https://absensi.smartapps.my.id/api/attendance/tap"; // Sesuaikan domain/IP server PHP Anda
const char* apiKey      = "KUNCI_API_PRESENSI_V1_2026";              // Harus sama dengan SECRET_API_KEY di PHP
const char* deviceId    = "PRESENSI-V1";                             // ID unik mesin presensi ini
const char* otaPassword = "wahid123";                                // Password proteksi upload firmware via WiFi (OTA)

// Konfigurasi NTP Server
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 7 * 3600; 
const int   daylightOffset_sec = 0;

// Konfigurasi Koreksi Waktu Sholat
const int KOREKSI_IMSAK   = -2;
const int KOREKSI_SUBUH   = -3;
const int KOREKSI_TERBIT  = -2;
const int KOREKSI_DHUHA   = -2;
const int KOREKSI_DZUHUR  = -3;
const int KOREKSI_ASHAR   = -2;
const int KOREKSI_MAGHRIB = -2;
const int KOREKSI_ISYA    = -2;

// Konfigurasi Pin
#define SS_PIN 5  
#define RST_PIN 4 
#define BUZZ 33

// Kapasitas Maksimal Sidik Jari Sensor (R503 / R303)
#define MAX_FINGERPRINTS 500

// Inisialisasi Hardware
MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Preferences preferences;

// Inisialisasi Fingerprint via UART2 (HardwareSerial)
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// Variabel Global
String ID_TAG = "";
String topMessage = "                Ahlan Wa Sahlan di Pondok Pesantren Roudlatul Quran 4 Jati Agung                "; 
String jadwalScrollString = "                MAGHRIB --:-- | ISYA --:-- | SHUBUH --:-- | DHUHUR --:-- | ASAR --:--                ";
bool isScrollingTopMessage = true; 

// State Machine Layar & Perekaman (Ditambah DELETE_FINGER)
enum DisplayMode { STANDBY, SCANNED, ADHAN, ENROLL_FINGER, MASTER_TAPPING, DELETE_FINGER };
DisplayMode currentMode = STANDBY;

enum EnrollState { ENROLL_START, WAIT_FINGER_1, WAIT_REMOVE, WAIT_FINGER_2 };
EnrollState enrollState;
uint8_t currentEnrollID = 0;

// Variabel Timer (Non-blocking)
unsigned long lastScrollTime = 0;
unsigned long lastAltTime = 0;
unsigned long scannedStartTime = 0;
unsigned long adhanStartTime = 0;
unsigned long lastSecUpdate = 0;
unsigned long enrollTimer = 0;
unsigned long deleteTimer = 0; // Timer untuk mode hapus

// Status Koneksi WiFi & Auto-Sync Offline
bool isWifiConnected = false;
unsigned long lastWifiCheckTime = 0;
unsigned long lastWifiReconnectAttempt = 0;

// Forward Declarations
void sendSensorPacket(uint8_t pid, uint8_t *payload, uint16_t length);
String extractFingerprintTemplate(uint16_t id);
bool saveFingerprintTemplate(uint16_t id, String hexStr);
void syncSingleEnroll(uint16_t id);
void syncSingleDelete(uint16_t id);
void syncDeleteAll();
void fetchMembersLocalCache();
void printNetworkInfo();
void setupWebServer();
void setupOTA();

// Struktur Data Cache Anggota Offline
struct CachedMember {
  String uid;
  int fingerprint_id;
  String nama;
  String nis_nip;
  String tipe;
  String kelas;
  bool found;
};

// Variabel Tap Kartu Master
unsigned long lastMasterTapTime = 0;
int masterTapCount = 0;

// Variabel UI Dinamis saat status SCANNED
String scanLine1 = "";
String scanLine2 = "";

// Indeks & State
int scrollIndex = 0;
int altState = 0; 
int lastDay = -1;
int lastAdhanMinute = -1;
String currentPrayerName = "";

// Struktur Waktu Sholat
struct PrayerTime {
  String name;
  int h;
  int m;
  bool isObligatory;
};

PrayerTime pt[8] = {
  {"IMSAK", 0, 0, false},
  {"SHUBUH", 0, 0, true},
  {"TERBIT", 0, 0, false},
  {"DHUHA", 0, 0, false},
  {"DHUHUR", 0, 0, true},
  {"ASAR", 0, 0, true},
  {"MAGHRIB", 0, 0, true},
  {"ISYA", 0, 0, true}
};

// --- FUNGSI UTILITAS & CACHE OFFLINE ---

void printCentered(String text, int row) {
  if (text.length() > 16) {
    text = text.substring(0, 16);
  }
  int spaces = (16 - text.length()) / 2;
  if (spaces < 0) spaces = 0;
  String paddedText = "";
  for (int i = 0; i < spaces; i++) paddedText += " ";
  paddedText += text;
  while (paddedText.length() < 16) paddedText += " "; 
  if (paddedText.length() > 16) {
    paddedText = paddedText.substring(0, 16);
  }
  lcd.setCursor(0, row);
  lcd.print(paddedText);
}

// Fungsi sentral untuk kembali ke tampilan awal & efek LED awal
void setStandbyMode() {
  currentMode = STANDBY;
  masterTapCount = 0;
  lcd.clear();
  // LED Bernafas Biru secara terus menerus (0)
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_BLUE, 0); 
}

void showScannedMessage(String line1, String line2) {
  currentMode = SCANNED;
  scannedStartTime = millis(); 
  scanLine1 = line1;
  scanLine2 = line2;
  lcd.clear();
  printCentered(scanLine1, 0);
  printCentered(scanLine2, 1);
}

// 1. Tarik & Simpan Cache Anggota (Santri & Guru) dari Server ke SPIFFS
void fetchMembersLocalCache() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.println("\n[MEMBERS CACHE] Mengunduh data anggota (Santri & Guru) untuk validasi offline...");

  String baseUrl = String(serverUrl);
  int apiIdx = baseUrl.indexOf("/api/");
  if (apiIdx != -1) {
    baseUrl = baseUrl.substring(0, apiIdx);
  }
  String membersUrl = baseUrl + "/api/members?tipe=all";

  HTTPClient http;
  http.begin(membersUrl);
  http.setTimeout(8000);
  http.addHeader("X-API-KEY", apiKey);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    File f = SPIFFS.open("/members_cache.json", FILE_WRITE);
    if (f) {
      f.print(payload);
      f.close();
      Serial.println("[MEMBERS CACHE] Cache anggota offline berhasil diperbarui di SPIFFS.");
    }
  } else {
    Serial.printf("[MEMBERS CACHE] Gagal mengunduh cache anggota (HTTP %d)\n", httpCode);
  }
  http.end();
}

// 2. Pencarian Data Anggota di Cache Lokal SPIFFS saat Mode Offline
CachedMember findMemberOffline(int fingerId, String rfidTag) {
  CachedMember res;
  res.found = false;

  if (!SPIFFS.exists("/members_cache.json")) return res;

  File file = SPIFFS.open("/members_cache.json", FILE_READ);
  if (!file || file.size() == 0) {
    if (file) file.close();
    return res;
  }

  String content = file.readString();
  file.close();

  DynamicJsonDocument doc(32768);
  DeserializationError err = deserializeJson(doc, content);
  if (err) return res;

  JsonArray arr = doc["data"].as<JsonArray>();
  for (JsonObject m : arr) {
    int fId = m["fingerprint_id"].as<int>();
    String uId = m["uid"].as<String>();

    bool match = false;
    if (fingerId > 0 && fId == fingerId) match = true;
    if (rfidTag.length() > 0 && (uId.equalsIgnoreCase(rfidTag))) match = true;

    if (match) {
      res.uid = uId;
      res.fingerprint_id = fId;
      res.nama = m["nama"].as<String>();
      res.nis_nip = m["nis_nip"].as<String>();
      res.tipe = m["tipe"].as<String>();
      res.kelas = m["kelas"].as<String>();
      res.found = true;
      break;
    }
  }

  return res;
}

// --- FUNGSI FINGERPRINT REAL-TIME SYNC ---

void syncSingleEnroll(uint16_t id) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ENROLL SYNC] WiFi offline, data sidik jari baru tersimpan di memori lokal sensor.");
    return;
  }

  Serial.printf("[ENROLL SYNC] Mengirim data sidik jari baru ID %d ke server...\n", id);
  
  String hexData = extractFingerprintTemplate(id);

  DynamicJsonDocument doc(2048);
  doc["action"] = "enroll";
  doc["device_id"] = deviceId;
  doc["fingerprint_id"] = id;
  if (hexData.length() >= 1024) {
    doc["template_data"] = hexData;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  String payload;
  serializeJson(doc, payload);
  int httpCode = http.POST(payload);
  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[ENROLL SYNC] SUKSES! ID %d otomatis tersinkronkan ke database server.\n", id);
    fetchMembersLocalCache(); // Perbarui cache lokal
  } else {
    Serial.printf("[ENROLL SYNC] Respon Server (%d): %s\n", httpCode, http.errorToString(httpCode).c_str());
  }
  http.end();
}

void syncSingleDelete(uint16_t id) {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.printf("[DELETE SYNC] Menghapus data ID %d di database server...\n", id);
  DynamicJsonDocument doc(512);
  doc["action"] = "delete_fingerprint";
  doc["device_id"] = deviceId;
  doc["fingerprint_id"] = id;

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  String payload;
  serializeJson(doc, payload);
  http.POST(payload);
  http.end();

  fetchMembersLocalCache();
}

void syncDeleteAll() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.println("[DELETE ALL SYNC] Menghapus semua data sidik jari perangkat di database server...");
  DynamicJsonDocument doc(512);
  doc["action"] = "delete_all_fingerprints";
  doc["device_id"] = deviceId;

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  String payload;
  serializeJson(doc, payload);
  http.POST(payload);
  http.end();
}

uint8_t getFreeFingerprintID() {
  for (int page = 1; page <= MAX_FINGERPRINTS; page++) {
    if (finger.loadModel(page) != FINGERPRINT_OK) {
      return page; 
    }
  }
  return 0; 
}

void handleFingerprintEnroll() {
  if (millis() - enrollTimer > 30000) {
    setStandbyMode(); // Timeout, kembali ke awal
    return;
  }

  switch(enrollState) {
    case ENROLL_START:
      currentEnrollID = getFreeFingerprintID();
      if (currentEnrollID == 0) {
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3); // Merah Gagal
        showScannedMessage("Memori Jari", "Penuh!");
        return;
      }
      lcd.clear();
      printCentered("Rekam ID: " + String(currentEnrollID), 0);
      printCentered("Tempel Jari...", 1);
      enrollState = WAIT_FINGER_1;
      break;

    case WAIT_FINGER_1:
      if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz(1) == FINGERPRINT_OK) {
        digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_ON, 0, FINGERPRINT_LED_BLUE, 0); // Nyala statis biru sebentar
        printCentered("Angkat Jari!", 1);
        enrollTimer = millis(); 
        enrollState = WAIT_REMOVE;
      }
      break;

    case WAIT_REMOVE:
      if (finger.getImage() == FINGERPRINT_NOFINGER) {
        finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0); // Ungu nafas lagi
        printCentered("Tempel Lagi...", 1);
        enrollTimer = millis();
        enrollState = WAIT_FINGER_2;
      }
      break;

    case WAIT_FINGER_2:
      if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz(2) == FINGERPRINT_OK) {
        if (finger.createModel() == FINGERPRINT_OK) {
          if (finger.storeModel(currentEnrollID) == FINGERPRINT_OK) {
            digitalWrite(BUZZ, HIGH); delay(300); digitalWrite(BUZZ, LOW);
            finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 5); // Biru kedip tanda sukses
            showScannedMessage("Sidik Jari OK!", "Tersimpan ID:" + String(currentEnrollID));

            // AUTO-SYNC REAL-TIME: Kirim ID & template sidik jari baru ke server
            syncSingleEnroll(currentEnrollID);
          } else {
            finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
            showScannedMessage("Gagal Simpan!", "Coba Lagi");
          }
        } else {
          finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
          showScannedMessage("Jari Berbeda!", "Gagal Merekam");
        }
      }
      break;
  }
}

void handleFingerprintDelete() {
  // Timeout jika 15 detik tidak ada jari yang ditempel
  if (millis() - deleteTimer > 15000) { 
    setStandbyMode();
    return;
  }

  // Cek apakah ada jari yang menempel
  if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz() == FINGERPRINT_OK) {
    // Cari apakah jari ini ada di database
    if (finger.fingerSearch() == FINGERPRINT_OK) {
      uint16_t idToDelete = finger.fingerID;
      
      // Proses hapus dari memori
      if (finger.deleteModel(idToDelete) == FINGERPRINT_OK) {
        digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(100); digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_PURPLE, 5); // Kedip ungu tanda berhasil dihapus
        showScannedMessage("Jari Dihapus!", "ID Jari: " + String(idToDelete));

        // AUTO-SYNC REAL-TIME: Hapus data ID dari server
        syncSingleDelete(idToDelete);
      } else {
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
        showScannedMessage("Gagal Menghapus!", "Sistem Error");
      }
    } else {
      // Jari yang ditempel tidak terdaftar, jadi tidak bisa dihapus
      digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
      showScannedMessage("Jari Tdk Dikenal", "Batal Menghapus");
    }
  }
}

// --- FUNGSI SINKRONISASI DATA FINGERPRINT SAAT PERTAMA HIDUP ---

void syncDataFingerprint() {
  lcd.clear();
  printCentered("Sinkronisasi...", 0);
  printCentered("Sync 0%", 1);
  
  // Indikator visual LED sensor (Ungu Bernafas)
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);

  DynamicJsonDocument doc(2048);
  doc["action"] = "sync";
  doc["device_id"] = deviceId;
  JsonArray activeArray = doc.createNestedArray("active_fingerprints");

  int countFound = 0;
  int lastPercent = -1;

  for (int id = 1; id <= MAX_FINGERPRINTS; id++) {
    // Cek apakah slot ID tersimpan model sidik jarinya di sensor
    if (finger.loadModel(id) == FINGERPRINT_OK) {
      activeArray.add(id);
      countFound++;
    }

    int percent = (id * 100) / MAX_FINGERPRINTS;
    if (percent != lastPercent) {
      lastPercent = percent;
      printCentered("Sync " + String(percent) + "%", 1);
      delay(5); // Animasi progres halus di LCD
    }
  }

  doc["total_fingerprints"] = countFound;
  printCentered("Sync 100%", 1);
  delay(300);

  // Jika WiFi terhubung, kirim data sidik jari yang ada ke server PHP
  if (WiFi.status() == WL_CONNECTED) {
    printCentered("Mengirim Data...", 1);

    HTTPClient http;
    http.begin(serverUrl);
    http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-KEY", apiKey);

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("[SYNC] Mengirim data sinkronisasi ke server: " + requestBody);
    int httpCode = http.POST(requestBody);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("[SYNC] Respon Server (%d): %s\n", httpCode, response.c_str());
      
      lcd.clear();
      printCentered("Sync Sukses!", 0);
      printCentered(String(countFound) + " Jari Terdata", 1);
      digitalWrite(BUZZ, HIGH); delay(150); digitalWrite(BUZZ, LOW);
    } else {
      Serial.printf("[SYNC] Gagal kirim ke server: %s\n", http.errorToString(httpCode).c_str());
      lcd.clear();
      printCentered("Sync Offline", 0);
      printCentered(String(countFound) + " Jari Terdata", 1);
      digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    }
    http.end();
  } else {
    lcd.clear();
    printCentered("Sync Selesai!", 0);
    printCentered(String(countFound) + " Jari Terdata", 1);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
  }

  delay(2000); // Tampilkan info hasil sinkronisasi selama 2 detik lalu ke mode standby
}

// --- FUNGSI MANAJEMEN DATA OFFLINE (SPIFFS) ---

String getCurrentTimestamp() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo) && timeinfo.tm_year > 100) {
    char buf[25];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
  }
  return ""; // Kosong jika RTC belum tersinkronisasi
}

void saveOfflineLog(int fingerId, String rfidTag) {
  File file = SPIFFS.open("/offline_logs.txt", FILE_APPEND);
  if (!file) {
    Serial.println("[OFFLINE] Gagal membuka file /offline_logs.txt di SPIFFS!");
    return;
  }

  StaticJsonDocument<192> doc;
  doc["device_id"] = deviceId;
  if (fingerId > 0) doc["fingerprint_id"] = fingerId;
  if (rfidTag.length() > 0) doc["rfid_tag"] = rfidTag;
  
  String timeStamp = getCurrentTimestamp();
  if (timeStamp.length() > 0) {
    doc["recorded_at"] = timeStamp;
  }

  String jsonLine;
  serializeJson(doc, jsonLine);
  file.println(jsonLine);
  file.close();

  Serial.println("[OFFLINE BUFFER] Presensi tersimpan di memori ESP32: " + jsonLine);
}

void flushOfflineLogs() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!SPIFFS.exists("/offline_logs.txt")) return;

  File file = SPIFFS.open("/offline_logs.txt", FILE_READ);
  if (!file || file.size() == 0) {
    if (file) file.close();
    SPIFFS.remove("/offline_logs.txt");
    return;
  }

  Serial.println("\n[OFFLINE SYNC] Memproses antrean data offline yang tertunda...");

  DynamicJsonDocument batchDoc(4096);
  batchDoc["action"] = "offline_sync";
  batchDoc["device_id"] = deviceId;
  JsonArray logsArray = batchDoc.createNestedArray("offline_logs");

  int totalPending = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      StaticJsonDocument<256> itemDoc;
      DeserializationError err = deserializeJson(itemDoc, line);
      if (!err) {
        logsArray.add(itemDoc.as<JsonObject>());
        totalPending++;
      }
    }
  }
  file.close();

  if (totalPending == 0) {
    SPIFFS.remove("/offline_logs.txt");
    return;
  }

  Serial.printf("[OFFLINE SYNC] Mengirim %d data offline ke server...\n", totalPending);

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  String payload;
  serializeJson(batchDoc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[OFFLINE SYNC] SUKSES! %d data offline terkirim ke server.\n", totalPending);
    SPIFFS.remove("/offline_logs.txt"); // Hapus antrean karena berhasil terkirim
    
    // Feedback visual/suara singkat
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(50);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
  } else {
    Serial.printf("[OFFLINE SYNC] Gagal sinkron ke server (HTTP %d). Data tetap disimpan di memori ESP32.\n", httpCode);
  }
  http.end();
}

// --- FUNGSI PENGIRIMAN DATA PRESENSI (HYBRID ONLINE/OFFLINE) ---

void kirimPresensiFingerprint(uint8_t idFinger) {
  CachedMember localM = findMemberOffline((int)idFinger, "");

  // 1. JIKA OFFLINE: Simpan langsung ke memori lokal & tampilkan nama dari cache
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[OFFLINE] WiFi offline. Data Fingerprint ID %d disimpan ke SPIFFS.\n", idFinger);
    saveOfflineLog((int)idFinger, "");
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 2);

    if (localM.found) {
      showScannedMessage(localM.nama, "Hadir (Offline)");
    } else {
      showScannedMessage("Slot #" + String(idFinger), "Hadir (Offline)");
    }
    return;
  }

  // 2. JIKA ONLINE: Kirim ke server & tampilkan respon resmi
  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(3500); // Timeout 3.5 detik
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  StaticJsonDocument<256> doc;
  doc["device_id"] = deviceId;
  doc["fingerprint_id"] = idFinger;
  String timeStamp = getCurrentTimestamp();
  if (timeStamp.length() > 0) {
    doc["recorded_at"] = timeStamp;
  }

  String jsonBody;
  serializeJson(doc, jsonBody);

  Serial.println("[HTTP POST] Mengirim data Fingerprint: " + jsonBody);
  int httpCode = http.POST(jsonBody);

  if (httpCode == 200 || httpCode == 201) {
    String payload = http.getString();
    Serial.printf("[HTTP] Respon (%d): %s\n", httpCode, payload.c_str());

    DynamicJsonDocument respDoc(1024);
    DeserializationError err = deserializeJson(respDoc, payload);
    if (!err) {
      String status = respDoc["status"].as<String>();
      String action = respDoc["action"].as<String>();
      String nama = respDoc["data"]["nama"].as<String>();
      String waktuMasuk = respDoc["data"]["waktu_masuk"].as<String>();
      String waktuKeluar = respDoc["data"]["waktu_keluar"].as<String>();

      if (nama == "null" || nama == "") {
        nama = localM.found ? localM.nama : ("Slot #" + String(idFinger));
      }

      if (status == "success") {
        digitalWrite(BUZZ, HIGH); delay(150); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 3);
        if (action == "check_out") {
          showScannedMessage(nama, "Keluar: " + waktuKeluar + " OK");
        } else {
          showScannedMessage(nama, "Masuk: " + waktuMasuk + " OK");
        }
      } else if (status == "already_attended") {
        digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW); delay(50);
        digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 2);
        showScannedMessage(nama, "Sudah Absen!");
      } else if (status == "unmapped") {
        digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_PURPLE, 3);
        showScannedMessage("Slot #" + String(idFinger), "Belum Dimapping!");
      } else {
        digitalWrite(BUZZ, HIGH); delay(300); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
        showScannedMessage("Jari Ditolak!", "Tidak Terdaftar");
      }
    } else {
      digitalWrite(BUZZ, HIGH); delay(150); digitalWrite(BUZZ, LOW);
      showScannedMessage("Presensi Sukses", "Slot #" + String(idFinger));
    }
  } else {
    Serial.printf("[HTTP] Gagal kirim POST (%s). Menyimpan ke offline buffer...\n", http.errorToString(httpCode).c_str());
    saveOfflineLog((int)idFinger, "");
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    if (localM.found) {
      showScannedMessage(localM.nama, "Hadir (Offline)");
    } else {
      showScannedMessage("Slot #" + String(idFinger), "Hadir (Offline)");
    }
  }
  http.end();
}

void kirimPresensiRFID(String tagId) {
  CachedMember localM = findMemberOffline(0, tagId);

  // 1. JIKA OFFLINE: Simpan langsung ke memori lokal & tampilkan nama dari cache
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[OFFLINE] WiFi offline. Data RFID %s disimpan ke SPIFFS.\n", tagId.c_str());
    saveOfflineLog(0, tagId);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 2);

    if (localM.found) {
      showScannedMessage(localM.nama, "Hadir (Offline)");
    } else {
      showScannedMessage("RFID: " + tagId, "Hadir (Offline)");
    }
    return;
  }

  // 2. JIKA ONLINE: Kirim ke server & tampilkan respon resmi
  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(3500);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  StaticJsonDocument<256> doc;
  doc["device_id"] = deviceId;
  doc["rfid_tag"] = tagId;
  String timeStamp = getCurrentTimestamp();
  if (timeStamp.length() > 0) {
    doc["recorded_at"] = timeStamp;
  }

  String jsonBody;
  serializeJson(doc, jsonBody);

  Serial.println("[HTTP POST] Mengirim data RFID: " + jsonBody);
  int httpCode = http.POST(jsonBody);

  if (httpCode == 200 || httpCode == 201) {
    String payload = http.getString();
    Serial.printf("[HTTP] Respon (%d): %s\n", httpCode, payload.c_str());

    DynamicJsonDocument respDoc(1024);
    DeserializationError err = deserializeJson(respDoc, payload);
    if (!err) {
      String status = respDoc["status"].as<String>();
      String action = respDoc["action"].as<String>();
      String nama = respDoc["data"]["nama"].as<String>();
      String waktuMasuk = respDoc["data"]["waktu_masuk"].as<String>();
      String waktuKeluar = respDoc["data"]["waktu_keluar"].as<String>();

      if (nama == "null" || nama == "") {
        nama = localM.found ? localM.nama : ("Kartu #" + tagId);
      }

      if (status == "success") {
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 3);
        if (action == "check_out") {
          showScannedMessage(nama, "Keluar: " + waktuKeluar + " OK");
        } else {
          showScannedMessage(nama, "Masuk: " + waktuMasuk + " OK");
        }
      } else if (status == "already_attended") {
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 2);
        showScannedMessage(nama, "Sudah Absen!");
      } else if (status == "not_found") {
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
        showScannedMessage("Kartu Tdk Dikenal", "Ditolak Sistem");
      } else {
        showScannedMessage(nama, "Presensi OK");
      }
    } else {
      showScannedMessage("Kartu Terbaca", tagId);
    }
  } else {
    Serial.printf("[HTTP] Gagal kirim POST (%s). Menyimpan ke offline buffer...\n", http.errorToString(httpCode).c_str());
    saveOfflineLog(0, tagId);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    if (localM.found) {
      showScannedMessage(localM.nama, "Hadir (Offline)");
    } else {
      showScannedMessage("RFID: " + tagId, "Hadir (Offline)");
    }
  }
  http.end();
}

void checkFingerprintScan() {
  if (currentMode != STANDBY) return; 
  
  if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz() == FINGERPRINT_OK) {
    if (finger.fingerSearch() == FINGERPRINT_OK) {
      // Kirim dan tampilkan data presensi lengkap
      kirimPresensiFingerprint(finger.fingerID);
    } else {
      digitalWrite(BUZZ, HIGH); delay(50); digitalWrite(BUZZ, LOW); delay(50);
      digitalWrite(BUZZ, HIGH); delay(50); digitalWrite(BUZZ, LOW);
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3); // Kedip Merah Ditolak
      showScannedMessage("Jari Ditolak!", "Tidak Dikenal");
    }
  }
}

// --- FUNGSI RFID & SHOLAT ---

void readRFID(byte *buffer, byte bufferSize) {
  unsigned long decimal_ID = ((unsigned long)buffer[3] << 24) | ((unsigned long)buffer[2] << 16) | 
                             ((unsigned long)buffer[1] << 8)  | ((unsigned long)buffer[0]);
  ID_TAG = String(decimal_ID);
}

// --- FUNGSI CEK STATUS KONEKSI SERVER (TRIGGER KARTU MASTER) ---

void checkServerConnection() {
  lcd.clear();
  printCentered("Tes Koneksi...", 0);
  printCentered("Menghubungkan...", 1);
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);

  Serial.println("\n[TES KONEKSI] Memulai pengecekan koneksi ke server...");

  // 1. Cek status koneksi WiFi lokal
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[TES KONEKSI] WiFi Gagal / Terputus!");
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(100);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    showScannedMessage("Status: OFFLINE", "WiFi Terputus!");
    return;
  }

  // 2. Cek koneksi ke Endpoint Server API
  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(5000); // 5 detik timeout
  http.addHeader("X-API-KEY", apiKey);

  unsigned long startTime = millis();
  int httpCode = http.GET();
  unsigned long rtt = millis() - startTime;

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[TES KONEKSI] Server ONLINE (HTTP %d, Latensi: %lums)\n", httpCode, rtt);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 3);
    digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
    
    // Tampilkan hanya baris pertama 'Server ONLINE!' agar bersih dan tidak error
    showScannedMessage("Server ONLINE!", "");
  } else if (httpCode > 0) {
    Serial.printf("[TES KONEKSI] Respon Server Error (HTTP %d)\n", httpCode);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(100);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    
    showScannedMessage("Server Error!", "HTTP " + String(httpCode));
  } else {
    Serial.printf("[TES KONEKSI] Gagal terhubung ke host: %s\n", http.errorToString(httpCode).c_str());
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
    digitalWrite(BUZZ, HIGH); delay(300); digitalWrite(BUZZ, LOW);
    
    showScannedMessage("Server Error!", "Host Timeout");
  }
  http.end();
}

void checkRFID() {
  if (currentMode != STANDBY && currentMode != MASTER_TAPPING) return;
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) return;
  
  readRFID(mfrc522.uid.uidByte, mfrc522.uid.size);
  mfrc522.PICC_HaltA(); 
  
  for(int b = 0; b < 2; b++){
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(50);
  }
  
  // TRIGGER MASTER CARD CEK KONEKSI KE SERVER (UID: 1606092848)
  if (ID_TAG == "1606092848") {
    checkServerConnection();
    return;
  }
  
  // TRIGGER MASTER CARD (REKAM 1x / HAPUS 5x)
  if (ID_TAG == "696781609") {
    // 1. Debounce 250ms agar tap berturut-turut terbaca mulus dan tidak terabaikan
    if (masterTapCount > 0 && (millis() - lastMasterTapTime < 250)) {
      return; 
    }

    // Reset tap jika jeda antar tap lebih dari 3 detik
    if (millis() - lastMasterTapTime > 3000) {
      masterTapCount = 0;
    }
    
    masterTapCount++;
    lastMasterTapTime = millis();
    
    if (masterTapCount >= 5) {
      // TAP 5 KALI: Masuk Mode Hapus Jari Tunggal
      currentMode = DELETE_FINGER;
      deleteTimer = millis();
      masterTapCount = 0; 
      lcd.clear();
      printCentered("Mode Hapus Jari", 0);
      printCentered("Tempel Jari...", 1);
      
      // Feedback suara & LED Nafas Merah sebagai indikator Delete Mode
      digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED, 0); 
    } 
    else if (masterTapCount == 1) {
      // TAP 1 KALI: Masuk mode hitung tap Master
      currentMode = MASTER_TAPPING;
      lcd.clear();
      printCentered("Mode Master 1/5", 0);
      printCentered("Tap lg u/ Hapus", 1);
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);
    } 
    else {
      // TAP 2, 3, 4 KALI: Tampilkan hitung mundur menuju 5x tap
      currentMode = MASTER_TAPPING;
      lcd.clear();
      printCentered("Hapus Jari " + String(masterTapCount) + "/5", 0);
      printCentered("Tap " + String(5 - masterTapCount) + "x lagi", 1);
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 30, FINGERPRINT_LED_RED, 0);
    }
    return;
  }
  
  // TRIGGER RESTART
  if (ID_TAG == "2054170372") {
    finger.LEDcontrol(FINGERPRINT_LED_ON, 0, FINGERPRINT_LED_RED, 0);
    lcd.clear();
    printCentered("SYSTEM RESTART!", 0);
    printCentered("ID: " + ID_TAG, 1);
    digitalWrite(BUZZ, HIGH); delay(2000); digitalWrite(BUZZ, LOW);
    ESP.restart(); 
  }
  
  // KARTU NORMAL - Kirim ke server & tampilkan respon resmi
  kirimPresensiRFID(ID_TAG);
}

void parseJadwal(String json) {
  DynamicJsonDocument doc(2048);
  DeserializationError error = deserializeJson(doc, json);
  
  if (!error) {
    JsonObject jadwalObj = doc["data"]["jadwal"].as<JsonObject>();
    for (JsonPair kv : jadwalObj) { 
      JsonObject times = kv.value().as<JsonObject>();
      
      auto parseTime = [](String t, int &h, int &m, int koreksi) -> String {
        if (t.length() >= 5) {
          h = t.substring(0, 2).toInt(); m = t.substring(3, 5).toInt();
          int totalMins = (h * 60) + m + koreksi;
          if (totalMins < 0) totalMins += 1440;
          totalMins %= 1440;
          h = totalMins / 60; m = totalMins % 60;
          char buf[6]; sprintf(buf, "%02d:%02d", h, m);
          return String(buf);
        }
        return t;
      };
      
      String sSubuh   = parseTime(times["subuh"].as<String>(), pt[1].h, pt[1].m, KOREKSI_SUBUH);
      String sDzuhur  = parseTime(times["dzuhur"].as<String>(), pt[4].h, pt[4].m, KOREKSI_DZUHUR);
      String sAshar   = parseTime(times["ashar"].as<String>(), pt[5].h, pt[5].m, KOREKSI_ASHAR);
      String sMaghrib = parseTime(times["maghrib"].as<String>(), pt[6].h, pt[6].m, KOREKSI_MAGHRIB);
      String sIsya    = parseTime(times["isya"].as<String>(), pt[7].h, pt[7].m, KOREKSI_ISYA);
      
      parseTime(times["imsak"].as<String>(), pt[0].h, pt[0].m, KOREKSI_IMSAK);
      parseTime(times["terbit"].as<String>(), pt[2].h, pt[2].m, KOREKSI_TERBIT);
      parseTime(times["dhuha"].as<String>(), pt[3].h, pt[3].m, KOREKSI_DHUHA);
      
      jadwalScrollString = "                MAGHRIB " + sMaghrib + " | ISYA " + sIsya + 
                           " | SHUBUH " + sSubuh + " | DHUHUR " + sDzuhur + 
                           " | ASAR " + sAshar + "                ";
      break; 
    }
  }
}

void fetchJadwal() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "https://api.myquran.com/v3/sholat/jadwal/b3e3e393c77e35a4a3f3cbd1e429b5dc/today?tz=Asia%2FJakarta";
    http.begin(url);
    int httpCode = http.GET();
    if (httpCode > 0) { 
      String payload = http.getString();
      if (payload.indexOf("jadwal") > 0) {
         parseJadwal(payload);
         preferences.putString("jadwal_json", payload); 
         struct tm timeinfo;
         if (getLocalTime(&timeinfo)) {
            lastDay = timeinfo.tm_mday;
         }
      }
    }
    http.end();
  }
}

String getCountdownString(struct tm *timeinfo) {
  int curMins = timeinfo->tm_hour * 60 + timeinfo->tm_min;
  int targetH = 0, targetM = 0;
  String nextName = "";
  bool found = false;
  
  for (int i = 0; i < 8; i++) {
    if (pt[i].isObligatory) {
      int pMins = pt[i].h * 60 + pt[i].m;
      if (curMins < pMins) {
        targetH = pt[i].h; targetM = pt[i].m; nextName = pt[i].name;
        found = true; break;
      }
    }
  }
  
  struct tm targetTm = *timeinfo; 
  if (!found) {
    targetH = pt[1].h; targetM = pt[1].m; nextName = pt[1].name; targetTm.tm_mday += 1;
  }
  
  targetTm.tm_hour = targetH; targetTm.tm_min = targetM; targetTm.tm_sec = 0;
  time_t nowTime; time(&nowTime); time_t targetEpoch = mktime(&targetTm);
  long diffSeconds = targetEpoch - nowTime;
  if (diffSeconds < 0) diffSeconds = 0;
  
  int h = diffSeconds / 3600; int m = (diffSeconds % 3600) / 60; int s = diffSeconds % 60;
  char buff[20]; sprintf(buff, "%s %02d:%02d:%02d", nextName.c_str(), h, m, s);
  return String(buff);
}

void checkAdhan(struct tm *timeinfo) {
  if (currentMode == ADHAN || currentMode == ENROLL_FINGER || currentMode == MASTER_TAPPING || currentMode == DELETE_FINGER) return; 
  
  int curMins = timeinfo->tm_hour * 60 + timeinfo->tm_min;
  for (int i = 0; i < 8; i++) {
    if (pt[i].isObligatory) {
      if (timeinfo->tm_hour == pt[i].h && timeinfo->tm_min == pt[i].m) {
        if (lastAdhanMinute != curMins && timeinfo->tm_sec == 0) {
           currentMode = ADHAN;
           adhanStartTime = millis();
           currentPrayerName = pt[i].name;
           lastAdhanMinute = curMins;
           lcd.clear();
           break;
        }
      }
    }
  }
}

// --- FUNGSI SERIAL MONITOR ---

// --- FUNGSI LOW-LEVEL PROTOKOL SENSOR (TEMPLATE UPLOAD & DOWNLOAD) ---

void sendSensorPacket(uint8_t pid, uint8_t *payload, uint16_t length) {
  uint16_t packetLen = length + 2; // Termasuk 2 bytes checksum
  uint16_t sum = pid + (packetLen >> 8) + (packetLen & 0xFF);
  for (uint16_t i = 0; i < length; i++) {
    sum += payload[i];
  }

  uint8_t header[9] = {
    0xEF, 0x01,                 // Header
    0xFF, 0xFF, 0xFF, 0xFF,     // Address
    pid,                        // PID (0x01 Command, 0x02 Data, 0x08 End Data)
    (uint8_t)(packetLen >> 8),  // Length High
    (uint8_t)(packetLen & 0xFF) // Length Low
  };

  mySerial.write(header, 9);
  if (length > 0) {
    mySerial.write(payload, length);
  }
  mySerial.write((uint8_t)(sum >> 8));
  mySerial.write((uint8_t)(sum & 0xFF));
}

String extractFingerprintTemplate(uint16_t id) {
  // Bersihkan sisa buffer serial sebelum mulai
  while (mySerial.available()) mySerial.read();
  delay(20);

  // 1. Muat model dari slot memori ke CharBuffer 1 sensor
  if (finger.loadModel(id) != FINGERPRINT_OK) {
    return "";
  }

  delay(20);
  while (mySerial.available()) mySerial.read();

  // 2. Kirim perintah Upload CharBuffer 1 (PID 0x01, Cmd 0x08, Buffer 0x01)
  uint8_t cmd[2] = { 0x08, 0x01 };
  sendSensorPacket(0x01, cmd, 2);

  // 3. Baca respon & paket data 512 bytes
  uint8_t templateBytes[512];
  int bytesRead = 0;
  unsigned long startT = millis();

  while (bytesRead < 512 && (millis() - startT < 3000)) {
    if (mySerial.available() < 9) {
      delay(2);
      continue;
    }

    // Cari header 0xEF
    if (mySerial.read() != 0xEF) continue;

    unsigned long waitB2 = millis();
    while (!mySerial.available() && millis() - waitB2 < 50) delay(1);
    if (!mySerial.available() || mySerial.read() != 0x01) continue;

    // Baca address (4B) + PID (1B) + Length (2B) = 7 Bytes
    unsigned long waitHdr = millis();
    while (mySerial.available() < 7 && millis() - waitHdr < 100) delay(1);
    if (mySerial.available() < 7) continue;

    for (int k = 0; k < 4; k++) mySerial.read(); // Skip Address
    uint8_t pid = mySerial.read();
    uint8_t lenH = mySerial.read();
    uint8_t lenL = mySerial.read();
    uint16_t dataLen = ((uint16_t)lenH << 8) | lenL;
    if (dataLen < 2) continue;
    uint16_t payloadLen = dataLen - 2;

    unsigned long waitData = millis();
    while (mySerial.available() < (payloadLen + 2) && millis() - waitData < 300) {
      delay(1);
    }
    if (mySerial.available() < (payloadLen + 2)) continue;

    if (pid == 0x07) {
      // Paket Ack
      uint8_t confirmCode = mySerial.read();
      for (int k = 0; k < payloadLen - 1; k++) mySerial.read();
      mySerial.read(); mySerial.read(); // Checksum
      if (confirmCode != 0x00) return "";
    } 
    else if (pid == 0x02 || pid == 0x08) {
      // Paket Data
      for (int i = 0; i < payloadLen; i++) {
        uint8_t dByte = mySerial.read();
        if (bytesRead < 512) {
          templateBytes[bytesRead++] = dByte;
        }
      }
      mySerial.read(); mySerial.read(); // Checksum
      if (pid == 0x08 && bytesRead >= 512) break;
    } 
    else {
      for (int k = 0; k < payloadLen + 2; k++) mySerial.read();
    }
  }

  // Bersihkan sisa buffer setelah selesai
  delay(30);
  while (mySerial.available()) mySerial.read();

  if (bytesRead < 512) return "";

  // Konversi 512 bytes biner menjadi 1024 karakter HEX
  String hexStr = "";
  hexStr.reserve(1024);
  char hexBuf[3];
  for (int i = 0; i < 512; i++) {
    sprintf(hexBuf, "%02X", templateBytes[i]);
    hexStr += hexBuf;
  }
  return hexStr;
}

bool saveFingerprintTemplate(uint16_t id, String hexStr) {
  if (hexStr.length() < 1024) return false;

  // Konversi Hex String ke 512 bytes biner
  uint8_t templateBytes[512];
  for (int i = 0; i < 512; i++) {
    char byteStr[3] = { hexStr[i * 2], hexStr[i * 2 + 1], 0 };
    templateBytes[i] = (uint8_t)strtol(byteStr, NULL, 16);
  }

  while (mySerial.available()) mySerial.read();

  // 1. Kirim perintah Download ke CharBuffer 1 (Cmd 0x09, Buffer 0x01)
  uint8_t cmd[2] = { 0x09, 0x01 };
  sendSensorPacket(0x01, cmd, 2);

  // Tunggu Ack
  unsigned long startT = millis();
  bool ackOk = false;
  while (millis() - startT < 1000) {
    if (mySerial.available() >= 12) {
      if (mySerial.read() == 0xEF && mySerial.read() == 0x01) {
        for (int k = 0; k < 4; k++) mySerial.read(); // Address
        uint8_t pid = mySerial.read();
        mySerial.read(); mySerial.read(); // Length
        uint8_t confirmCode = mySerial.read();
        mySerial.read(); mySerial.read(); // Checksum
        if (pid == 0x07 && confirmCode == 0x00) {
          ackOk = true;
          break;
        }
      }
    }
  }
  if (!ackOk) return false;

  // 2. Kirim 512 bytes dalam 4 paket data (128 bytes per paket)
  for (int p = 0; p < 4; p++) {
    uint8_t pid = (p == 3) ? 0x08 : 0x02; // Paket terakhir PID 0x08
    sendSensorPacket(pid, &templateBytes[p * 128], 128);
    delay(25);
  }
  delay(50);

  // 3. Simpan dari CharBuffer 1 ke memori permanen sensor (slot id)
  return (finger.storeModel(id) == FINGERPRINT_OK);
}

// --- FUNGSI PROSES SERIAL UPLOAD & DOWNLOAD ---

void handleTemplateUpload() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[UPLOAD] ERROR: WiFi tidak terhubung! Hubungkan WiFi terlebih dahulu.");
    showScannedMessage("Upload Gagal!", "WiFi Offline");
    return;
  }

  Serial.println("\n==================================================");
  Serial.println("[UPLOAD] Memulai proses upload template sidik jari ke server...");
  Serial.println("==================================================");

  lcd.clear();
  printCentered("Upload Template", 0);
  printCentered("Memindai Jari...", 1);
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);

  DynamicJsonDocument doc(65536);
  doc["action"] = "upload_templates";
  doc["device_id"] = deviceId;
  JsonArray tmplArray = doc.createNestedArray("templates");

  int totalFound = 0;
  for (int id = 1; id <= MAX_FINGERPRINTS; id++) {
    // Bersihkan buffer serial dan beri jeda stabilisasi sebelum loadModel
    while (mySerial.available()) mySerial.read();
    delay(20);

    uint8_t loadStatus = finger.loadModel(id);
    if (loadStatus == FINGERPRINT_OK) {
      Serial.printf("[UPLOAD] Menemukan ID %d di sensor. Mengekstrak template... ", id);
      printCentered("Upload ID: " + String(id), 1);
      
      String hexData = extractFingerprintTemplate(id);
      if (hexData.length() >= 1024) {
        JsonObject item = tmplArray.createNestedObject();
        item["fingerprint_id"] = id;
        item["template_data"] = hexData;
        totalFound++;
        Serial.println("SUKSES (1024 Hex)");
      } else {
        Serial.printf("GAGAL ekstrak (Panjang: %d)\n", hexData.length());
      }
      delay(50); // Jeda agar sensor siap untuk iterasi berikutnya
    }
  }

  if (totalFound == 0) {
    Serial.println("[UPLOAD] Tidak ada template sidik jari di memori sensor!");
    showScannedMessage("Upload Gagal!", "Tidak Ada Jari");
    return;
  }

  Serial.printf("\n[UPLOAD] Mengunggah %d template ke server API...\n", totalFound);
  printCentered("Mengirim Server", 1);

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", apiKey);

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200 || httpCode == 201) {
    String resp = http.getString();
    Serial.printf("[UPLOAD] SUKSES! %d template berhasil diunggah ke server.\n", totalFound);
    Serial.println("[UPLOAD] Respon Server: " + resp);
    
    digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 5);
    showScannedMessage("Upload Sukses!", String(totalFound) + " Jari Diupload");
  } else {
    Serial.printf("[UPLOAD] GAGAL kirim ke server: %s (HTTP %d)\n", http.errorToString(httpCode).c_str(), httpCode);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(100);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
    showScannedMessage("Upload Gagal!", "Server Err " + String(httpCode));
  }
  http.end();
}

void handleTemplateDownload() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[DOWNLOAD] ERROR: WiFi tidak terhubung! Hubungkan WiFi terlebih dahulu.");
    showScannedMessage("Download Gagal!", "WiFi Offline");
    return;
  }

  Serial.println("\n==================================================");
  Serial.println("[DOWNLOAD] Memulai proses download template dari server...");
  Serial.println("==================================================");

  // 1. Reset / Hapus seluruh data sidik jari yang ada di sensor
  Serial.println("[DOWNLOAD] Mengosongkan memori sensor sidik jari (Reset All)...");
  lcd.clear();
  printCentered("Download Server", 0);
  printCentered("Reset Memori...", 1);
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);

  if (finger.emptyDatabase() != FINGERPRINT_OK) {
    Serial.println("[DOWNLOAD] GAGAL mereset database sensor!");
    showScannedMessage("Reset Gagal!", "Sistem Error");
    return;
  }
  Serial.println("[DOWNLOAD] Memori sensor berhasil dikosongkan.");

  // 2. Fetch template dari Server API
  Serial.println("[DOWNLOAD] Mengambil data template dari server...");
  printCentered("Mengambil Data..", 1);

  HTTPClient http;
  String url = String(serverUrl) + "?action=get_templates&device_id=" + String(deviceId);
  http.begin(url);
  http.setTimeout(15000);
  http.addHeader("X-API-KEY", apiKey);

  int httpCode = http.GET();
  if (httpCode != 200) {
    Serial.printf("[DOWNLOAD] GAGAL mengambil data dari server: %s (HTTP %d)\n", http.errorToString(httpCode).c_str(), httpCode);
    showScannedMessage("Download Gagal!", "HTTP " + String(httpCode));
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(32768);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.println("[DOWNLOAD] GAGAL parse JSON respon server!");
    showScannedMessage("Download Gagal!", "JSON Parse Error");
    return;
  }

  JsonArray templates = doc["data"]["templates"].as<JsonArray>();
  int totalTemplates = templates.size();

  if (totalTemplates == 0) {
    Serial.println("[DOWNLOAD] Tidak ada template tersimpan di server untuk perangkat ini.");
    showScannedMessage("Download Selesai", "0 Template Ada");
    return;
  }

  Serial.printf("[DOWNLOAD] Ditemukan %d template di server. Mulai menulis ke sensor...\n", totalTemplates);

  int successCount = 0;
  for (JsonObject item : templates) {
    int fId = item["fingerprint_id"].as<int>();
    String hexData = item["template_data"].as<String>();
    String nama = item["nama"].as<String>();

    Serial.printf("[DOWNLOAD] Menyimpan ID %d (%s)... ", fId, (nama != "null" && nama != "") ? nama.c_str() : "No Name");
    printCentered("Menyimpan ID:" + String(fId), 1);

    if (saveFingerprintTemplate(fId, hexData)) {
      successCount++;
      Serial.println("OK");
    } else {
      Serial.println("GAGAL!");
    }
  }

  Serial.println("==================================================");
  Serial.printf("[DOWNLOAD] SELESAI: %d dari %d template berhasil disimpan ke sensor!\n", successCount, totalTemplates);
  Serial.println("==================================================");

  digitalWrite(BUZZ, HIGH); delay(200); digitalWrite(BUZZ, LOW);
  finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_BLUE, 5);
  showScannedMessage("Download Sukses!", String(successCount) + " Jari Disimpan");
}

// --- FUNGSI INFORMASI JARINGAN, WEB SERVER & OTA ---

void printNetworkInfo() {
  Serial.println("\n=======================================================");
  Serial.println("         INFORMASI JARINGAN & AKSES ESP32              ");
  Serial.println("=======================================================");
  Serial.printf ("  * Device ID        : %s\n", deviceId);
  Serial.printf ("  * WiFi SSID        : %s\n", WiFi.SSID().c_str());
  Serial.printf ("  * IP Address       : %s\n", WiFi.localIP().toString().c_str());
  Serial.printf ("  * Web Dashboard    : http://%s/\n", WiFi.localIP().toString().c_str());
  Serial.printf ("  * Signal (RSSI)    : %d dBm\n", WiFi.RSSI());
  Serial.printf ("  * MAC Address      : %s\n", WiFi.macAddress().c_str());
  Serial.printf ("  * Arduino IDE OTA  : %s (Port Jaringan, Pass: %s)\n", deviceId, otaPassword);
  Serial.println("=======================================================\n");
}

void handleWebRoot() {
  int totalJari = 0;
  for (int i = 1; i <= MAX_FINGERPRINTS; i++) {
    if (finger.loadModel(i) == FINGERPRINT_OK) totalJari++;
  }

  struct tm timeinfo;
  char timeBuff[40] = "Waktu Offline";
  if (getLocalTime(&timeinfo) && timeinfo.tm_year > 100) {
    strftime(timeBuff, sizeof(timeBuff), "%A, %d %B %Y - %H:%M:%S WIB", &timeinfo);
  }

  String html = "<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>Portal ESP32 - " + String(deviceId) + "</title>";
  html += "<style>";
  html += "body{font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;color:#333;}";
  html += ".card{max-width:600px;margin:auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);}";
  html += "h1{color:#1a73e8;font-size:22px;margin-top:0;border-bottom:2px solid #e8eaed;padding-bottom:12px;}";
  html += ".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;}";
  html += ".box{background:#f8f9fa;padding:12px;border-radius:8px;border-left:4px solid #1a73e8;}";
  html += ".box strong{display:block;font-size:12px;color:#5f6368;margin-bottom:4px;}";
  html += ".box span{font-size:15px;font-weight:bold;color:#202124;}";
  html += ".btn{display:block;width:100%;padding:12px;margin:8px 0;background:#1a73e8;color:#fff;text-align:center;text-decoration:none;border-radius:6px;font-weight:bold;box-sizing:border-box;border:none;cursor:pointer;}";
  html += ".btn:hover{background:#1557b0;}";
  html += ".btn-danger{background:#d93025;} .btn-danger:hover{background:#b3261e;}";
  html += ".btn-success{background:#188038;} .btn-success:hover{background:#13652c;}";
  html += ".footer{text-align:center;font-size:12px;color:#70757a;margin-top:20px;}";
  html += "</style></head><body>";
  html += "<div class='card'>";
  html += "<h1>Mesin Presensi IoT (" + String(deviceId) + ")</h1>";
  html += "<div class='grid'>";
  html += "<div class='box'><strong>IP ADDRESS</strong><span>" + WiFi.localIP().toString() + "</span></div>";
  html += "<div class='box'><strong>STATUS WIFI</strong><span>" + String(WiFi.SSID()) + " (" + String(WiFi.RSSI()) + " dBm)</span></div>";
  html += "<div class='box'><strong>SIDIK JARI TERDAFTAR</strong><span>" + String(totalJari) + " / " + String(MAX_FINGERPRINTS) + " Slot</span></div>";
  html += "<div class='box'><strong>FREE HEAP RAM</strong><span>" + String(ESP.getFreeHeap() / 1024) + " KB</span></div>";
  html += "</div>";
  html += "<div class='box' style='margin-bottom:16px;border-left-color:#188038;'><strong>WAKTU SISTEM</strong><span>" + String(timeBuff) + "</span></div>";
  html += "<h3>Aksi Cepat Web</h3>";
  html += "<a href='/test-server' class='btn'>Tes Koneksi Server API</a>";
  html += "<a href='/upload' class='btn btn-success'>Upload Template Jari ke Server</a>";
  html += "<a href='/download' class='btn' style='background:#f29900;'>Download Template dari Server</a>";
  html += "<a href='/restart' class='btn btn-danger' onclick=\"return confirm('Yakin ingin restart ESP32?');\">Restart Mesin ESP32</a>";
  html += "<div class='footer'>Siakad Ponpes IoT Firmware &copy; 2026</div>";
  html += "</div></body></html>";

  webServer.send(200, "text/html", html);
}

void setupWebServer() {
  webServer.on("/", HTTP_GET, handleWebRoot);
  webServer.on("/test-server", HTTP_GET, []() {
    checkServerConnection();
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });
  webServer.on("/upload", HTTP_GET, []() {
    handleTemplateUpload();
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });
  webServer.on("/download", HTTP_GET, []() {
    handleTemplateDownload();
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });
  webServer.on("/restart", HTTP_GET, []() {
    webServer.send(200, "text/html", "<p>Merestart ESP32... Silakan buka kembali dalam 5 detik.</p><script>setTimeout(()=>{window.location.href='/'}, 5000);</script>");
    delay(1000);
    ESP.restart();
  });
  webServer.on("/ip", HTTP_GET, []() {
    webServer.send(200, "text/plain", WiFi.localIP().toString());
  });
  webServer.begin();
  Serial.println("[WEB] Web Server Dashboard aktif di port 80!");
}

void setupOTA() {
  ArduinoOTA.setHostname(deviceId);
  ArduinoOTA.setPassword(otaPassword); // Proteksi password OTA
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) type = "sketch";
    else type = "filesystem";
    Serial.println("[OTA] Mulai update firmware " + type);
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Update Firmware Selesai!");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Autentikasi Password Gagal!");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });
  ArduinoOTA.begin();
  Serial.printf("[OTA] Arduino OTA aktif & terlindungi password ('%s').\n", otaPassword);
}

void checkSerialCommand() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    input.toUpperCase();

    // 1. Perintah Cek IP & Status Jaringan
    if (input == "IP" || input == "STATUS") {
      printNetworkInfo();
    }
    // 2. Perintah UPLOAD Template ke Server
    else if (input == "UPLOAD") {
      handleTemplateUpload();
    }
    // 3. Perintah DOWNLOAD Template dari Server (Reset All + Download)
    else if (input == "DOWNLOAD") {
      handleTemplateDownload();
    }
    // 4. Perintah DEL ALL (Hapus semua memori sensor)
    else if (input == "DEL ALL") {
      Serial.println("Mencoba menghapus SEMUA ID sidik jari...");
      lcd.clear();
      printCentered("Menghapus Data...", 0);
      
      if (finger.emptyDatabase() == FINGERPRINT_OK) {
        Serial.println("-> SUKSES: Semua memori sidik jari telah dikosongkan!");
        
        digitalWrite(BUZZ, HIGH); delay(1000); digitalWrite(BUZZ, LOW);
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 15, FINGERPRINT_LED_PURPLE, 10); 
        
        showScannedMessage("Semua Data Jari", "Telah Dihapus!");
        
        // AUTO-SYNC REAL-TIME: Hapus semua sidik jari di database server
        syncDeleteAll();
      } else {
        Serial.println("-> GAGAL: Terjadi kesalahan sistem saat menghapus database.");
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
        showScannedMessage("Gagal Menghapus", "Sistem Error");
      }
    }
    // 5. Perintah DEL <ID> (Hapus 1 ID spesifik)
    else if (input.startsWith("DEL ")) {
      String idString = input.substring(4);
      int id = idString.toInt();
      
      if (id > 0 && id <= MAX_FINGERPRINTS) {
        Serial.println("Mencoba menghapus ID: " + String(id) + "...");
        
        if (finger.deleteModel(id) == FINGERPRINT_OK) {
          Serial.println("-> SUKSES: ID " + String(id) + " berhasil dihapus!");
          
          digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW); delay(100); 
          digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
          finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_PURPLE, 5); 
          
          showScannedMessage("Jari Dihapus!", "ID: " + String(id) + " (Serial)");

          // AUTO-SYNC REAL-TIME: Hapus ID dari database server
          syncSingleDelete(id);
        } else {
          Serial.println("-> GAGAL: ID " + String(id) + " tidak ditemukan di memori.");
          finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 3);
          showScannedMessage("Gagal Hapus", "ID Tidak Ada");
        }
      } else {
        Serial.println("-> ERROR: Format salah atau ID di luar batas (1-" + String(MAX_FINGERPRINTS) + ").");
        Serial.println("   Gunakan format: DEL <ID> (Contoh: DEL 5)");
      }
    }
  }
}

// --- MAIN ROUTINES ---

void setup() { 
  Serial.begin(115200);
  pinMode(BUZZ, OUTPUT); digitalWrite(BUZZ, LOW);
  
  lcd.begin(16, 2); lcd.init(); lcd.backlight();
  printCentered("Inisialisasi...", 0);
  
  // 1. Inisialisasi SPIFFS untuk penyimpanan offline
  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] Gagal menginisialisasi partisi SPIFFS!");
  } else {
    Serial.println("[SPIFFS] Sistem File SPIFFS siap.");
  }
  
  mySerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);
  if (finger.verifyPassword()) {
    // LED Awal
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_BLUE, 0); 
  } else {
    printCentered("Fingerprint ERR!", 1); delay(2000);
  }
  
  lcd.clear();
  printCentered("Menghubungkan", 0);
  printCentered("WiFi...", 1);
  
  preferences.begin("sholat", false);
  String savedJadwal = preferences.getString("jadwal_json", "");
  if (savedJadwal != "") parseJadwal(savedJadwal);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int wifiAttempts = 0;
  // Timeout max 5 detik saat boot agar tidak macet jika tidak ada WiFi
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 10) {
    delay(500); wifiAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    isWifiConnected = true;
    printCentered("WiFi Terhubung!", 0);
    printCentered("Sinkronisasi...", 1);
    digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);

    // Tampilkan informasi IP lengkap di Serial Monitor
    printNetworkInfo();

    // Inisialisasi Web Server & Arduino OTA
    setupWebServer();
    setupOTA();

    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    fetchJadwal(); 
    flushOfflineLogs(); // Kirim data offline jika ada antrean tersimpan
    delay(1000);
  } else {
    isWifiConnected = false;
    printCentered("WiFi Terputus!", 0);
    printCentered("Mode Offline", 1);
    digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW); delay(80);
    digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW);
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
    Serial.println("[WiFi] Gagal terhubung saat boot. Sistem berjalan offline.");
    delay(1500);
  }
  
  SPI.begin();
  mfrc522.PCD_Init();

  // === PROSES SINKRONISASI DATA FINGERPRINT & ANGGOTA SAAT PERTAMA HIDUP ===
  syncDataFingerprint();
  fetchMembersLocalCache();
  
  setStandbyMode(); // Panggil fungsi setup UI dan LED standby
}

void handleAdhanUI() {
  unsigned long elapsed = millis() - adhanStartTime;
  if (elapsed >= 10000) { 
    setStandbyMode(); // Kembali standby setelah 10s
    digitalWrite(BUZZ, LOW); lcd.backlight(); 
    return;
  }
  
  bool state = false;
  if (elapsed < 2000) state = true;
  else if (elapsed >= 3000 && elapsed < 5000) state = true;
  else if (elapsed >= 6000 && elapsed < 8000) state = true;
  
  digitalWrite(BUZZ, state ? HIGH : LOW);
  if (state) lcd.noBacklight(); else lcd.backlight();
  
  if (millis() - lastSecUpdate >= 200) {
    lastSecUpdate = millis();
    struct tm timeinfo; getLocalTime(&timeinfo);
    char timeStringBuff[50];
    strftime(timeStringBuff, sizeof(timeStringBuff), "%H:%M:%S WIB", &timeinfo);
    printCentered("WAKTU " + currentPrayerName, 0);
    printCentered(String(timeStringBuff), 1);
  }
}

void handleStandbyUI() {
  if (millis() - lastScrollTime >= 300) {
    lastScrollTime = millis();
    String currentScrollText = isScrollingTopMessage ? topMessage : jadwalScrollString;
    int maxIndex = currentScrollText.length() - 16;
    if (maxIndex < 0) maxIndex = 0;
    
    String displayText = currentScrollText.substring(scrollIndex, scrollIndex + 16);
    while (displayText.length() < 16) displayText += " "; 
    
    lcd.setCursor(0, 0); lcd.print(displayText);
    
    scrollIndex++;
    if (scrollIndex > maxIndex) {
      scrollIndex = 0;
      isScrollingTopMessage = !isScrollingTopMessage; 
    }
  }

  if (millis() - lastAltTime >= 5000) {
    lastAltTime = millis();
    altState++;
    if (altState > 3) altState = 0; 
    lcd.setCursor(0, 1); lcd.print("                ");
  }

  if (millis() - lastSecUpdate >= 200) {
    lastSecUpdate = millis();
    struct tm timeinfo; bool timeValid = getLocalTime(&timeinfo);
    char timeStringBuff[50];
    
    if (altState == 0) {
      if(timeValid) strftime(timeStringBuff, sizeof(timeStringBuff), "%H:%M:%S WIB", &timeinfo);
      else strcpy(timeStringBuff, "Waktu Offline");
      printCentered(String(timeStringBuff), 1);
    } else if (altState == 1) {
      if(timeValid) strftime(timeStringBuff, sizeof(timeStringBuff), "%a, %d %b %Y", &timeinfo);
      else strcpy(timeStringBuff, "Tgl Offline");
      printCentered(String(timeStringBuff), 1);
    } else if (altState == 2) {
      printCentered("Tap Kartu / Jari", 1); 
    } else if (altState == 3) {
      if(timeValid) printCentered(getCountdownString(&timeinfo), 1);
      else printCentered("Tunggu Waktu", 1);
    }
  }
}

void loop() {     
  struct tm timeinfo;
  bool timeValid = getLocalTime(&timeinfo);
  
  if (timeValid && timeinfo.tm_mday != lastDay && timeinfo.tm_year > 100) { 
    fetchJadwal();
  }
  if (timeValid) checkAdhan(&timeinfo);

  // --- DETEKSI STATUS WIFI & OFFLINE AUTO-SYNC (NON-BLOCKING) ---
  unsigned long currentMillis = millis();
  if (currentMillis - lastWifiCheckTime >= 3000) {
    lastWifiCheckTime = currentMillis;
    bool currentWifiStatus = (WiFi.status() == WL_CONNECTED);

    // 1. Transisi TERPUTUS -> TERSAMBUNG KEMBALI
    if (!isWifiConnected && currentWifiStatus) {
      isWifiConnected = true;
      Serial.println("\n[WiFi] >>> WiFi Tersambung Kembali! <<<");

      // Tampilkan informasi IP lengkap di Serial Monitor
      printNetworkInfo();
      setupWebServer();
      setupOTA();

      // Tampilkan notifikasi "WiFi Terhubung!" di layar LCD
      lcd.clear();
      printCentered("WiFi Terhubung!", 0);
      printCentered("Sinkronisasi...", 1);
      digitalWrite(BUZZ, HIGH); delay(100); digitalWrite(BUZZ, LOW);
      delay(1000);

      configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
      fetchJadwal();
      flushOfflineLogs(); // Otomatis kirim seluruh antrean presensi offline
      
      // Jalankan proses sinkronisasi sidik jari (menampilkan progress "Sync 10%" ...)
      syncDataFingerprint();
      fetchMembersLocalCache();

      setStandbyMode();
    }
    // 2. Transisi TERSAMBUNG -> TERPUTUS
    else if (isWifiConnected && !currentWifiStatus) {
      isWifiConnected = false;
      Serial.println("\n[WiFi] >>> WiFi Terputus! Sistem tetap aktif dalam Mode Offline <<<");

      // Feedback suara & visual saat WiFi terputus
      digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW); delay(80);
      digitalWrite(BUZZ, HIGH); delay(80); digitalWrite(BUZZ, LOW);
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);

      // Tampilkan notifikasi di layar LCD
      showScannedMessage("WiFi Terputus!", "Mode Offline");
    }
    // 3. Jika sedang Offline, coba sambung ulang di background tanpa memblokir proses presensi
    else if (!currentWifiStatus) {
      if (currentMillis - lastWifiReconnectAttempt >= 15000) {
        lastWifiReconnectAttempt = currentMillis;
        Serial.println("[WiFi] Mencoba menyambungkan kembali ke WiFi di background...");
        WiFi.reconnect();
      }
    }
  }

  // --- UI ROUTER ---
  if (currentMode == ADHAN) {
    handleAdhanUI();
  }
  else if (currentMode == ENROLL_FINGER) {
    handleFingerprintEnroll();
  }
  else if (currentMode == DELETE_FINGER) {
    handleFingerprintDelete();
  }
  else if (currentMode == MASTER_TAPPING) {
    if (masterTapCount == 1) {
      // Jika hanya tap 1x dan tidak ada tap lanjutan selama 2.5 detik -> Masuk Mode Rekam Jari
      if (millis() - lastMasterTapTime >= 2500) {
        currentMode = ENROLL_FINGER;
        enrollState = ENROLL_START;
        enrollTimer = millis();
        masterTapCount = 0;
        finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_PURPLE, 0);
      }
    } 
    else {
      // Jika tap 2, 3, atau 4x berhenti sebelum 5x dalam 3 detik -> Batal dan kembali ke Standby
      if (millis() - lastMasterTapTime >= 3000) {
        setStandbyMode();
      }
    }
  }
  else if (currentMode == SCANNED) {
    if (millis() - scannedStartTime >= 5000) {
      setStandbyMode(); // Kembali biru nafas setelah 5 detik
    }
  } 
  else {
    handleStandbyUI();
  }

  // --- BACKGROUND HARDWARE & SERVER POLLING ---
  if (isWifiConnected) {
    webServer.handleClient();
    ArduinoOTA.handle();
  }

  checkRFID(); 
  checkFingerprintScan();
  checkSerialCommand();
}