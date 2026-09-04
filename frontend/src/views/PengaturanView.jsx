import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  School, 
  CloudDownload, 
  Broom, 
  Trash2, 
  Save, 
  Loader2, 
  MapPin, 
  CreditCard, 
  ShieldAlert, 
  CheckCircle2, 
  Sparkles, 
  Building2, 
  Cpu, 
  Copy, 
  Image as ImageIcon, 
  Upload, 
  XCircle,
  HardDrive,
  DownloadCloud,
  UploadCloud,
  FileArchive,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Layers,
  Key
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch, getAuthToken, getApiBaseUrl } from '../api';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function PengaturanView({ settings = {}, onSettingsUpdated }) {
  const isDemoActive = isDemo(settings);
  // Active Tab state: 'profil' (Profil & Lembaga) | 'iot' (Kebijakan & Mesin IoT) | 'database' (Database & Cadangan)
  const [activeTab, setActiveTab] = useState('profil');

  const [formData, setFormData] = useState({
    instansi_nama: settings.instansi_nama || '',
    instansi_alamat: settings.instansi_alamat || '',
    instansi_kota: settings.instansi_kota || 'Kota Santri',
    instansi_logo: settings.instansi_logo || '',
    app_mode: settings.app_mode || 'pesantren',
    auto_register_card: settings.auto_register_card !== undefined ? settings.auto_register_card : '1',
    jam_masuk_batas: settings.jam_masuk_batas || '07:00',
    jam_pulang_batas: settings.jam_pulang_batas || '15:00',
    kepala_nama: settings.kepala_nama || '',
    iot_api_key: settings.iot_api_key || ''
  });

  const [saving, setSaving] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  useEffect(() => {
    setFormData({
      instansi_nama: settings.instansi_nama || '',
      instansi_alamat: settings.instansi_alamat || '',
      instansi_kota: settings.instansi_kota || 'Kota Santri',
      instansi_logo: settings.instansi_logo || '',
      app_mode: settings.app_mode || 'pesantren',
      auto_register_card: settings.auto_register_card !== undefined ? settings.auto_register_card : '1',
      jam_masuk_batas: settings.jam_masuk_batas || '07:00',
      jam_pulang_batas: settings.jam_pulang_batas || '15:00',
      kepala_nama: settings.kepala_nama || '',
      iot_api_key: settings.iot_api_key || ''
    });
  }, [settings]);

  const handleLogoUpload = (e) => {
    if (isDemoActive) {
      showDemoAlert('Mengunggah logo lembaga');
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      Swal.fire('Format Salah', 'Harap pilih file gambar (PNG, JPG, JPEG, SVG, WebP)', 'warning');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      Swal.fire('File Terlalu Besar', 'Ukuran logo maksimal 2 MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const optimizedDataUrl = canvas.toDataURL('image/png');
        setFormData(prev => ({ ...prev, instansi_logo: optimizedDataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    if (isDemoActive) {
      showDemoAlert('Menghapus logo lembaga');
      return;
    }
    setFormData(prev => ({ ...prev, instansi_logo: '' }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isDemoActive) {
      showDemoAlert('Menyimpan perubahan pengaturan');
      return;
    }
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
          title: 'Berhasil Disimpan',
          text: 'Pengaturan sistem berhasil diperbarui.',
          timer: 1500,
          showConfirmButton: false
        });
        if (onSettingsUpdated) onSettingsUpdated();
      } else {
        Swal.fire('Gagal', data.message || 'Gagal menyimpan pengaturan', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menghubungi server untuk menyimpan pengaturan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoRegister = async () => {
    if (isDemoActive) {
      showDemoAlert('Mengubah kebijakan pendaftaran kartu baru');
      return;
    }
    const newVal = formData.auto_register_card === '1' ? '0' : '1';
    setFormData(prev => ({ ...prev, auto_register_card: newVal }));
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ auto_register_card: newVal })
      });
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  // Regenerate Unique Hash API Key
  const handleRegenerateKey = () => {
    if (isDemoActive) {
      showDemoAlert('Regenerate IoT Secret API Key');
      return;
    }
    Swal.fire({
      title: 'Regenerate API Key Baru?',
      text: 'Kunci lama tidak akan berlaku lagi. Anda harus memperbarui konfigurasi mesin presensi dengan API Key baru ini agar tetap terhubung.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      confirmButtonText: 'Ya, Buat Key Baru',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setRegeneratingKey(true);
        try {
          const res = await apiFetch('/api/settings/regenerate-api-key', { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            setFormData(prev => ({ ...prev, iot_api_key: data.api_key }));
            Swal.fire({
              icon: 'success',
              title: 'API Key Baru Dibuat! 🔑',
              html: `<div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-primary-700 font-bold break-all select-all">${data.api_key}</div><p class="text-xs text-slate-500 mt-2">Salin dan masukkan key ini ke variabel <code>apiKey</code> pada file fw.ino.</p>`,
              confirmButtonColor: '#2563eb'
            });
            if (onSettingsUpdated) onSettingsUpdated();
          } else {
            Swal.fire('Gagal', data.message || 'Gagal membuat key baru', 'error');
          }
        } catch (err) {
          Swal.fire('Error', 'Gagal memproses permintaan ke server', 'error');
        } finally {
          setRegeneratingKey(false);
        }
      }
    });
  };

  const handleSeedDummy = () => {
    if (isDemoActive) {
      showDemoAlert('Import sample data contoh');
      return;
    }
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
    if (isDemoActive) {
      showDemoAlert('Mereset riwayat data absensi');
      return;
    }
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
    if (isDemoActive) {
      showDemoAlert('Reset total database');
      return;
    }
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

  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [restoringDB, setRestoringDB] = useState(false);
  const dbRestoreInputRef = useRef(null);

  // 1. Download Backup Database (.db)
  const handleDownloadBackup = async () => {
    if (isDemoActive) {
      showDemoAlert('Mengunduh file backup database');
      return;
    }
    setDownloadingBackup(true);
    try {
      const token = getAuthToken();
      const url = `${getApiBaseUrl()}/api/settings/backup-db`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Gagal mengunduh file backup database');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      let filename = 'backup_absensi.db';
      if (disposition && disposition.includes('filename=')) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      Swal.fire({
        icon: 'success',
        title: 'Backup Berhasil! 💾',
        html: `<p class="text-xs text-slate-600">File backup database <b>${filename}</b> (${(blob.size / 1024).toFixed(1)} KB) berhasil diunduh dan tersimpan di komputer Anda.</p>`,
        timer: 3000,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire('Gagal Backup', err.message, 'error');
    } finally {
      setDownloadingBackup(false);
    }
  };

  // 2. Restore Database (.db)
  const handleRestoreFileSelected = (e) => {
    if (isDemoActive) {
      showDemoAlert('Memulihkan (restore) database cadangan');
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite') && !file.name.endsWith('.sqlite3')) {
      Swal.fire('Format Salah', 'File yang diunggah harus berupa file database (.db / .sqlite)', 'warning');
      e.target.value = '';
      return;
    }

    Swal.fire({
      title: 'Restore Database Sistem?',
      html: `<div class="text-left text-xs text-slate-600 space-y-2">
        <p class="font-bold text-rose-600">⚠️ PERINGATAN PENTING:</p>
        <p>Proses ini akan menimpa seluruh data sistem (santri/siswa, guru, kelas, jabatan, sidik jari, dan riwayat presensi) dengan data dari file: <b>${file.name}</b> (${(file.size / 1024).toFixed(1)} KB).</p>
        <p class="text-slate-500 italic">*Database aktif saat ini akan otomatis dicadangkan sebagai file pengaman (.bak) di server.</p>
      </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Restore Sekarang',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setRestoringDB(true);
        try {
          const formData = new FormData();
          formData.append('database', file);

          const token = getAuthToken();
          const url = `${getApiBaseUrl()}/api/settings/restore-db`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          const data = await res.json();
          if (res.ok && data.status === 'success') {
            await Swal.fire({
              icon: 'success',
              title: 'Restore Berhasil! 🎉',
              html: `<p class="text-xs text-slate-600">${data.message}</p>`,
              confirmButtonColor: '#2563eb'
            });
            if (onSettingsUpdated) onSettingsUpdated();
            window.location.reload();
          } else {
            Swal.fire('Gagal Restore', data.message || 'Terjadi kesalahan saat memulihkan database.', 'error');
          }
        } catch (err) {
          Swal.fire('Error', 'Gagal memproses unggahan file: ' + err.message, 'error');
        } finally {
          setRestoringDB(false);
          if (dbRestoreInputRef.current) dbRestoreInputRef.current.value = '';
        }
      } else {
        if (dbRestoreInputRef.current) dbRestoreInputRef.current.value = '';
      }
    });
  };

  const isAutoRegisterOn = formData.auto_register_card === '1';
  const isPesantren = formData.app_mode === 'pesantren';
  const currentBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://absensi.smartapps.my.id';
  const tapEndpointUrl = `${currentBaseUrl}/api/attendance/tap`;
  const currentApiKey = isDemoActive 
    ? '••••••••••••••••••••••••••••••••••••••••••••••••' 
    : (formData.iot_api_key || settings.iot_api_key || 'KUNCI_API_PRESENSI_V1_2026');

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto animate-fade-in">

      {/* ========================================================================= */}
      {/* 1. HEADER & TAB NAVIGATION */}
      {/* ========================================================================= */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary-600" />
            <span>Pengaturan Sistem</span>
          </h3>
          <p className="text-xs text-slate-500">
            Kelola profil instansi, logo kop surat, kebijakan kartu & sidik jari, serta backup & restore database
          </p>
        </div>
      </div>

      {/* TAB NAVIGATION PILLS */}
      <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200 w-fit overflow-x-auto max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('profil')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'profil'
              ? 'bg-white text-primary-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <School className="w-4 h-4" />
          <span>1. Profil & Lembaga</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('iot')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'iot'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>2. Kebijakan & Mesin IoT</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('database')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'database'
              ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>3. Database & Cadangan</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. TAB 1: PROFIL & LEMBAGA */}
      {/* ========================================================================= */}
      {activeTab === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          {/* SISI KIRI: MODE APLIKASI & LOGO */}
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
                    Menggunakan istilah <span className="font-semibold text-primary-700">"Santri"</span> & <span className="font-semibold text-primary-700">"Asatidz/Guru"</span>.
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
                    Menggunakan istilah <span className="font-semibold text-primary-700">"Siswa"</span> & <span className="font-semibold text-primary-700">"Guru"</span>.
                  </p>
                </button>
              </div>
            </div>

            {/* 2. LOGO LEMBAGA / INSTANSI */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Logo Lembaga / Instansi</h4>
                  <p className="text-xs text-slate-400">Tampil pada Kop Surat Cetak Laporan PDF</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shadow-inner flex-shrink-0 p-1">
                    {formData.instansi_logo ? (
                      <img 
                        src={formData.instansi_logo} 
                        alt="Logo Lembaga" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <School className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 block leading-tight">Default Logo</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Logo Baru</span>
                        <input 
                          type="file" 
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" 
                          onChange={handleLogoUpload} 
                          className="hidden" 
                        />
                      </label>

                      {formData.instansi_logo && (
                        <button 
                          type="button" 
                          onClick={handleRemoveLogo}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Hapus Logo</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Format yang didukung: PNG, JPG, SVG, WebP (Maks. 2 MB). Logo disimpan permanen di database.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SISI KANAN: IDENTITAS INSTANSI & BATAS JAM */}
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

            <form onSubmit={handleSave} className="space-y-3.5 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isPesantren ? 'Nama Yayasan / Pesantren' : 'Nama Sekolah / Madrasah'}
                </label>
                <input 
                  type="text" 
                  value={formData.instansi_nama} 
                  onChange={(e) => setFormData({ ...formData, instansi_nama: e.target.value })}
                  placeholder="Contoh: YAYASAN PONDOK PESANTREN DIGITAL"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Instansi</label>
                <input 
                  type="text" 
                  value={formData.instansi_alamat} 
                  onChange={(e) => setFormData({ ...formData, instansi_alamat: e.target.value })}
                  placeholder="Contoh: Jl. Pesantren Digital No. 01"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-primary-600" />
                  <span>Kota / Wilayah Instansi (Untuk Tanda Tangan Dokumen PDF)</span>
                </label>
                <input 
                  type="text" 
                  value={formData.instansi_kota} 
                  onChange={(e) => setFormData({ ...formData, instansi_kota: e.target.value })}
                  placeholder="Contoh: Jombang / Surabaya / Jakarta" 
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-medium text-primary-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Jam Masuk (Telat)</label>
                  <input 
                    type="time" 
                    value={formData.jam_masuk_batas} 
                    onChange={(e) => setFormData({ ...formData, jam_masuk_batas: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Jam Pulang</label>
                  <input 
                    type="time" 
                    value={formData.jam_pulang_batas} 
                    onChange={(e) => setFormData({ ...formData, jam_pulang_batas: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-mono"
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
                  placeholder="Contoh: KH. Ahmad Zaki, Lc., M.Ag"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                />
              </div>

              <button 
                type="submit" 
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow transition-all mt-4 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Simpan Pengaturan Profil</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TAB 2: KEBIJAKAN & MESIN IOT */}
      {/* ========================================================================= */}
      {activeTab === 'iot' && (
        <div className="space-y-6 animate-fade-in max-w-4xl">
          {/* 1. TOGGLE ON/OFF PENDAFTARAN KARTU BARU */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                isAutoRegisterOn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Pendaftaran Kartu Baru Otomatis</h4>
                <p className="text-xs text-slate-400">Respon sistem saat kartu RFID yang belum terdaftar di-tap pada mesin</p>
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
                      ? 'Kartu RFID baru yang di-tap akan otomatis tersimpan ke data anggota dan presensinya langsung dicatat.' 
                      : 'Kartu yang belum terdaftar akan ditolak dengan notifikasi "Data kartu tidak ditemukan".'}
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

          {/* 2. KONFIGURASI IOT & HASH API KEY MESIN ESP32 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Konfigurasi Mesin Presensi (IoT API)</h4>
                <p className="text-xs text-slate-400">Endpoint & Unique Hash API Key untuk dimasukkan ke file fw.ino</p>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100 text-xs">
              {/* IoT Secret API Key (Unik Hash Kriptografis) */}
              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">IoT Secret API Key:</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={currentApiKey} 
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-emerald-700 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (isDemoActive) {
                        showDemoAlert('Menyalin IoT Secret API Key');
                        return;
                      }
                      navigator.clipboard.writeText(currentApiKey);
                      Swal.fire({ icon: 'success', title: 'Tersalin', text: 'IoT Secret API Key disalin ke clipboard!', timer: 1200, showConfirmButton: false });
                    }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 border border-slate-300 transition"
                    title="Salin API Key"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleRegenerateKey}
                    disabled={regeneratingKey}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
                    title="Buat Kunci API Hash Baru"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regeneratingKey ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Regenerate Key</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  *Kunci hash unik yang otomatis di-generate saat database diinisialisasi untuk menjamin keamanan koneksi IoT.
                </p>
              </div>

              {/* Server URL Endpoint */}
              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">Server URL Endpoint:</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={tapEndpointUrl} 
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-primary-700 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tapEndpointUrl);
                      Swal.fire({ icon: 'success', title: 'Tersalin', text: 'URL Endpoint disalin ke clipboard!', timer: 1200, showConfirmButton: false });
                    }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 border border-slate-300 transition"
                    title="Salin URL Endpoint"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  *Endpoint resmi untuk menerima sinyal tap kartu RFID & sidik jari dari mesin presensi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TAB 3: DATABASE & CADANGAN */}
      {/* ========================================================================= */}
      {activeTab === 'database' && (
        <div className="space-y-6 animate-fade-in max-w-4xl">
          {/* 1. BACKUP & RESTORE DATABASE SQLITE */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Backup & Restore Database (.db)</h4>
                <p className="text-xs text-slate-400">Cadangkan seluruh data sistem atau pulihkan dari file cadangan database</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Informasi Cadangan:
              </p>
              <p className="text-[11px] leading-relaxed">
                File backup berekstensi <b>.db</b> mencakup data lengkap santri/siswa, guru, kartu RFID, kelas, jabatan, sidik jari IoT, dan riwayat presensi.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {/* Tombol Backup Database */}
              <button 
                type="button"
                onClick={handleDownloadBackup}
                disabled={downloadingBackup}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow transition-all disabled:opacity-50"
              >
                {downloadingBackup ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                <span>{downloadingBackup ? 'Mengunduh...' : 'Download Backup (.db)'}</span>
              </button>

              {/* Tombol Restore Database */}
              <button 
                type="button"
                onClick={() => dbRestoreInputRef.current?.click()}
                disabled={restoringDB}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow transition-all disabled:opacity-50"
              >
                {restoringDB ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                <span>{restoringDB ? 'Memulihkan...' : 'Restore Database (.db)'}</span>
              </button>

              {/* Hidden File Input for Restore */}
              <input 
                type="file" 
                ref={dbRestoreInputRef}
                onChange={handleRestoreFileSelected}
                accept=".db, .sqlite, .sqlite3"
                className="hidden" 
              />
            </div>
          </div>

          {/* 2. DUMMY & RESET DATABASE */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Manajemen Data Contoh & Reset</h4>
                <p className="text-xs text-slate-400">Generate data dummy atau bersihkan database sistem</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <button 
                type="button"
                onClick={handleSeedDummy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <CloudDownload className="w-4 h-4" />
                <span>Import / Generate Sample Data Dummy</span>
              </button>

              <button 
                type="button"
                onClick={handleResetAttendance}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <Broom className="w-4 h-4" />
                <span>Hapus Seluruh Riwayat Absensi Saja</span>
              </button>

              <button 
                type="button"
                onClick={handleResetAll}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Reset Total Database (Absensi, Anggota, Kelas & Posisi)</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
