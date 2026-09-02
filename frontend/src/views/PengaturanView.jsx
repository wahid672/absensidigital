import React, { useState, useEffect } from 'react';
import { Database, School, CloudDownload, Broom, Trash2, Save, Loader2, MapPin, CreditCard, ShieldAlert, CheckCircle2, Sparkles, Building2, Cpu, Copy } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function PengaturanView({ settings = {}, onSettingsUpdated }) {
  const [formData, setFormData] = useState({
    instansi_nama: settings.instansi_nama || '',
    instansi_alamat: settings.instansi_alamat || '',
    instansi_kota: settings.instansi_kota || 'Kota Santri',
    app_mode: settings.app_mode || 'pesantren',
    auto_register_card: settings.auto_register_card !== undefined ? settings.auto_register_card : '1',
    jam_masuk_batas: settings.jam_masuk_batas || '07:00',
    jam_pulang_batas: settings.jam_pulang_batas || '15:00',
    kepala_nama: settings.kepala_nama || ''
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData({
      instansi_nama: settings.instansi_nama || '',
      instansi_alamat: settings.instansi_alamat || '',
      instansi_kota: settings.instansi_kota || 'Kota Santri',
      app_mode: settings.app_mode || 'pesantren',
      auto_register_card: settings.auto_register_card !== undefined ? settings.auto_register_card : '1',
      jam_masuk_batas: settings.jam_masuk_batas || '07:00',
      jam_pulang_batas: settings.jam_pulang_batas || '15:00',
      kepala_nama: settings.kepala_nama || ''
    });
  }, [settings]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil',
          text: 'Pengaturan dan mode instansi berhasil disimpan',
          timer: 1500,
          showConfirmButton: false
        });
        if (onSettingsUpdated) onSettingsUpdated();
      } else {
        Swal.fire('Gagal', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan pengaturan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoRegister = () => {
    const newVal = formData.auto_register_card === '1' ? '0' : '1';
    setFormData(prev => ({ ...prev, auto_register_card: newVal }));
  };

  const handleSeedDummy = () => {
    Swal.fire({
      title: 'Import Data Dummy?',
      text: 'Sistem akan memasukkan data contoh santri/siswa, guru, kelas, jabatan, dan riwayat presensi demo.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0284c7',
      confirmButtonText: 'Ya, Generate Data',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch('/api/settings/seed-dummy', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Sukses', text: data.message, timer: 1800, showConfirmButton: false });
            if (onSettingsUpdated) onSettingsUpdated();
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal generate data dummy.', 'error');
        }
      }
    });
  };

  const handleResetAttendance = () => {
    Swal.fire({
      title: 'Hapus Semua Data Absensi?',
      text: 'Seluruh riwayat kehadiran akan dikosongkan. Data master santri/siswa, guru, kelas, dan jabatan TIDAK akan terhapus.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d97706',
      confirmButtonText: 'Ya, Kosongkan Absensi',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch('/api/settings/reset-attendance', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Dibersihkan', text: data.message, timer: 1800, showConfirmButton: false });
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal mereset data absensi.', 'error');
        }
      }
    });
  };

  const handleResetAll = () => {
    Swal.fire({
      title: 'Reset Total Database?',
      html: '<span class="text-rose-600 font-bold">PERINGATAN!</span> Tindakan ini akan menghapus SEMUA data santri/siswa, guru, kelas, jabatan, dan riwayat absensi. Database akan kembali kosong.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Reset Total',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch('/api/settings/reset-all', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Reset Berhasil', text: data.message, timer: 2000, showConfirmButton: false });
            if (onSettingsUpdated) onSettingsUpdated();
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal mereset database.', 'error');
        }
      }
    });
  };

  const isAutoRegisterOn = formData.auto_register_card === '1';
  const isPesantren = formData.app_mode === 'pesantren';

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl w-full mx-auto">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800">Pengaturan Sistem & Kebijakan Aplikasi</h3>
        <p className="text-xs text-slate-500">Pilih mode istilah instansi (Umum vs Pesantren), pendaftaran kartu baru, dan kop surat PDF</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* KOLOM KIRI */}
        <div className="space-y-6">
          {/* 1. PILIHAN MODE APLIKASI (UMUM vs PESANTREN) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Mode Istilah Aplikasi</h4>
                <p className="text-xs text-slate-400">Sesuaikan sebutan untuk Pesantren atau Sekolah Umum</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, app_mode: 'pesantren' }))}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isPesantren 
                    ? 'border-primary-600 bg-primary-50/60 ring-2 ring-primary-500/20' 
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-slate-800">Mode Pesantren</span>
                  {isPesantren && <CheckCircle2 className="w-4 h-4 text-primary-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Menggunakan sebutan <span className="font-semibold text-primary-700">"Santri"</span> & <span className="font-semibold text-primary-700">"Asatidz/Guru"</span>.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, app_mode: 'umum' }))}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  !isPesantren 
                    ? 'border-primary-600 bg-primary-50/60 ring-2 ring-primary-500/20' 
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-slate-800">Mode Umum / Sekolah</span>
                  {!isPesantren && <CheckCircle2 className="w-4 h-4 text-primary-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Menggunakan sebutan <span className="font-semibold text-primary-700">"Siswa"</span> & <span className="font-semibold text-primary-700">"Guru"</span>.
                </p>
              </button>
            </div>
          </div>

          {/* 2. TOGGLE ON/OFF KARTU BARU */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                isAutoRegisterOn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Pendaftaran Kartu Baru Otomatis</h4>
                <p className="text-xs text-slate-400">Respon API saat kartu RFID belum terdaftar di-tap</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Status: {isAutoRegisterOn ? 'ON (Izinkan Kartu Baru)' : 'OFF (Tolak Kartu Tidak Dikenal)'}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAutoRegisterOn 
                      ? 'Kartu yang belum ada di sistem akan otomatis didaftarkan dan absensinya dicatat.' 
                      : 'Kartu yang belum terdaftar akan ditolak dengan pesan respon "data tidak ditemukan".'}
                  </p>
                </div>

                {/* Modern Switch UI */}
                <button
                  type="button"
                  onClick={handleToggleAutoRegister}
                  className={`relative inline-flex h-6 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isAutoRegisterOn ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isAutoRegisterOn ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 3. KONFIGURASI IOT & API KEY MESIN ESP32 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Konfigurasi Mesin ESP32 (IoT API)</h4>
                <p className="text-xs text-slate-400">Endpoint & API Key untuk dimasukkan ke file fw.ino</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">IoT Secret API Key:</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value="KUNCI_API_PRESENSI_V1_2026" 
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("KUNCI_API_PRESENSI_V1_2026");
                      Swal.fire({ icon: 'success', title: 'Tersalin', text: 'API Key disalin ke clipboard!', timer: 1200, showConfirmButton: false });
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-300"
                    title="Salin API Key"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Server URL Endpoint:</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${window.location.origin}/api/presensi/api_presensi.php`} 
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-primary-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/presensi/api_presensi.php`);
                      Swal.fire({ icon: 'success', title: 'Tersalin', text: 'URL Endpoint disalin ke clipboard!', timer: 1200, showConfirmButton: false });
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-300"
                    title="Salin URL Endpoint"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600 space-y-1">
                <p className="text-slate-500 font-sans font-bold">// Baris 41-45 di fw.ino:</p>
                <p className="text-sky-700">const char* serverUrl = "{window.location.origin}/api/presensi/api_presensi.php";</p>
                <p className="text-emerald-700">const char* apiKey    = "KUNCI_API_PRESENSI_V1_2026";</p>
                <p className="text-amber-700">const char* deviceId  = "PRESENSI-V1";</p>
              </div>
            </div>
          </div>

          {/* 4. DUMMY & RESET */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Manajemen Data Contoh & Reset</h4>
                <p className="text-xs text-slate-400">Generate atau bersihkan database SQLite</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <button 
                onClick={handleSeedDummy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <CloudDownload className="w-4 h-4" />
                <span>Import / Generate Sample Data Dummy</span>
              </button>

              <button 
                onClick={handleResetAttendance}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <Broom className="w-4 h-4" />
                <span>Hapus Seluruh Riwayat Absensi Saja</span>
              </button>

              <button 
                onClick={handleResetAll}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Reset Total Database (Absensi, Anggota, Kelas & Posisi)</span>
              </button>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: PENGATURAN PROFIL & JAM */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-lg">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800">Profil Instansi & Kota Dokumen</h4>
              <p className="text-xs text-slate-400">Atur kop surat, kota tanda tangan PDF, dan batas jam</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isPesantren ? 'Nama Yayasan / Pesantren' : 'Nama Sekolah / Madrasah'}
              </label>
              <input 
                type="text" 
                value={formData.instansi_nama} 
                onChange={(e) => setFormData({ ...formData, instansi_nama: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Instansi</label>
              <input 
                type="text" 
                value={formData.instansi_alamat} 
                onChange={(e) => setFormData({ ...formData, instansi_alamat: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary-600" />
                <span>Kota / Wilayah Instansi (Untuk Tanda Tangan PDF)</span>
              </label>
              <input 
                type="text" 
                value={formData.instansi_kota} 
                onChange={(e) => setFormData({ ...formData, instansi_kota: e.target.value })}
                placeholder="Contoh: Jombang / Surabaya / Jakarta" 
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium text-primary-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Jam Masuk (Telat)</label>
                <input 
                  type="time" 
                  value={formData.jam_masuk_batas} 
                  onChange={(e) => setFormData({ ...formData, jam_masuk_batas: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Jam Pulang</label>
                <input 
                  type="time" 
                  value={formData.jam_pulang_batas} 
                  onChange={(e) => setFormData({ ...formData, jam_pulang_batas: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isPesantren ? 'Nama Pengasuh / Mudir Pesantren' : 'Nama Kepala Sekolah'}
              </label>
              <input 
                type="text" 
                value={formData.kepala_nama} 
                onChange={(e) => setFormData({ ...formData, kepala_nama: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <button 
              type="submit" 
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow transition-all mt-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Simpan Seluruh Pengaturan</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
