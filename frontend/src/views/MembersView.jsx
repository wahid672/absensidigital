import React, { useState, useEffect, useRef } from 'react';
import { 
  UserPlus, 
  Search, 
  PenSquare, 
  Trash2, 
  Loader2, 
  CreditCard, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Printer, 
  School,
  Fingerprint,
  X,
  FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import ModalMember from '../components/ModalMember';
import ModalImportExcel from '../components/ModalImportExcel';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function MembersView({ 
  tipe = 'siswa', 
  classes = [], 
  positions = [], 
  settings = {},
  appMode = 'pesantren',
  onMembersUpdated 
}) {
  const isDemoActive = isDemo(settings);
  const isGuru = tipe === 'guru';
  const isUmum = appMode === 'umum';
  const isPesantren = appMode === 'pesantren';
  
  // Dynamic labels based on appMode
  const labelMember = isUmum
    ? 'Pegawai'
    : isGuru 
    ? (isPesantren ? 'Guru / Asatidz' : 'Guru / Pendidik') 
    : (isPesantren ? 'Santri' : 'Siswa');

  const labelIdNumber = isUmum ? 'NIP / NIK' : isGuru ? 'NIP' : 'NIS';
  const labelGroup = isUmum ? 'Jabatan / Divisi' : isGuru ? 'Jabatan / Mapel' : 'Kelas / Rombel';

  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const fileInputRef = useRef(null);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/members?tipe=${tipe}&search=${encodeURIComponent(search)}`);
      const result = await res.json();
      setMembers(result.data || []);
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [tipe, search]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pdfModalOpen) setPdfModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfModalOpen]);

  const handleDelete = (id, nama) => {
    if (isDemoActive) {
      showDemoAlert(`Menghapus data ${labelMember}`);
      return;
    }
    Swal.fire({
      title: `Hapus Data ${labelMember}?`,
      html: `Apakah Anda yakin ingin menghapus <b>${nama}</b> dari sistem?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/members?id=${id}`, { method: 'DELETE' });
          const json = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Terhapus', text: json.message, timer: 1500, showConfirmButton: false });
            fetchMembers();
          } else {
            Swal.fire('Gagal', json.message, 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghapus data.', 'error');
        }
      }
    });
  };

  // 1. DOWNLOAD TEMPLATE EXCEL (.XLSX) DENGAN KETERANGAN WAJIB / OPSIONAL
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    if (tipe === 'siswa') {
      // Data Sheet Santri / Siswa
      const sampleData = [
        {
          'Nama Lengkap (Wajib)': 'Muhammad Rizky Pratama',
          'Nama Kelas (Wajib)': classes[0]?.nama || '10 IPA 1',
          'NIS (Opsional)': '20261001',
          'UID Kartu RFID (Opsional)': '0014829101',
          'No WhatsApp (Opsional)': '081234567801',
          'Nama Orang Tua (Opsional)': 'Bapak Pratama'
        },
        {
          'Nama Lengkap (Wajib)': 'Aisyah Nurul Hidayah',
          'Nama Kelas (Wajib)': classes[1]?.nama || '10 IPA 2',
          'NIS (Opsional)': '20261002',
          'UID Kartu RFID (Opsional)': '', // Contoh dikosongkan (Kartu bisa di-tap nanti)
          'No WhatsApp (Opsional)': '081234567802',
          'Nama Orang Tua (Opsional)': 'Ibu Hidayah'
        },
        {
          'Nama Lengkap (Wajib)': 'Fajar Dwi Santoso',
          'Nama Kelas (Wajib)': classes[2]?.nama || (classes[0]?.nama || '10 IPA 1'),
          'NIS (Opsional)': '20261003',
          'UID Kartu RFID (Opsional)': '', // Contoh dikosongkan
          'No WhatsApp (Opsional)': '',     // Contoh dikosongkan
          'Nama Orang Tua (Opsional)': ''
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 32 }, // Nama Lengkap (Wajib)
        { wch: 24 }, // Nama Kelas (Wajib)
        { wch: 18 }, // NIS (Opsional)
        { wch: 28 }, // UID Kartu RFID (Opsional)
        { wch: 24 }, // No WhatsApp (Opsional)
        { wch: 26 }  // Nama Orang Tua (Opsional)
      ];
      ws['!rows'] = [{ hpx: 26 }, { hpx: 20 }, { hpx: 20 }, { hpx: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, isPesantren ? 'DATA SANTRI' : 'DATA SISWA');

      // Sheet 2: Panduan & Keterangan Wajib / Opsional
      const guideData = [
        { 'Nama Kolom': 'Nama Lengkap (Wajib)', 'Status': 'WAJIB DIISI', 'Keterangan': 'Nama lengkap santri/siswa. Tidak boleh kosong.' },
        { 'Nama Kolom': 'Nama Kelas (Wajib)', 'Status': 'WAJIB DIISI', 'Keterangan': 'Harus sama persis dengan nama kelas di Master Kelas (lihat sheet DAFTAR KELAS).' },
        { 'Nama Kolom': 'NIS (Opsional)', 'Status': 'OPSIONAL', 'Keterangan': 'Nomor Induk Santri/Siswa. Boleh dikosongkan.' },
        { 'Nama Kolom': 'UID Kartu RFID (Opsional)', 'Status': 'OPSIONAL (BOLEH KOSONG)', 'Keterangan': 'Boleh kosong jika belum ada kartu. Kartu fisik bisa ditempel nanti di menu Kartu RFID (Mapping).' },
        { 'Nama Kolom': 'No WhatsApp (Opsional)', 'Status': 'OPSIONAL (BOLEH KOSONG)', 'Keterangan': 'Nomor WhatsApp untuk notifikasi presensi. Boleh dikosongkan.' },
        { 'Nama Kolom': 'Nama Orang Tua (Opsional)', 'Status': 'OPSIONAL (BOLEH KOSONG)', 'Keterangan': 'Nama orang tua / wali santri. Boleh dikosongkan.' }
      ];
      const wsGuide = XLSX.utils.json_to_sheet(guideData);
      wsGuide['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 68 }];
      wsGuide['!rows'] = [{ hpx: 24 }];
      XLSX.utils.book_append_sheet(wb, wsGuide, 'PANDUAN & PETUNJUK');

      // Sheet 3: Reference Kelas
      const classRef = classes.map(c => ({
        'ID Kelas': c.id,
        'Nama Kelas Resmi (Salin ke Kolom Kelas)': c.nama,
        'Tingkat': c.tingkat || '-',
        'Keterangan': c.keterangan || '-'
      }));
      if (classRef.length > 0) {
        const wsRef = XLSX.utils.json_to_sheet(classRef);
        wsRef['!cols'] = [
          { wch: 12 },
          { wch: 38 },
          { wch: 18 },
          { wch: 35 }
        ];
        wsRef['!rows'] = [{ hpx: 24 }];
        XLSX.utils.book_append_sheet(wb, wsRef, 'DAFTAR KELAS (REFERENSI)');
      }

      XLSX.writeFile(wb, isPesantren ? 'Template_Import_Santri.xlsx' : 'Template_Import_Siswa.xlsx');

    } else {
      // Data Sheet Guru / Pegawai
      const sampleData = [
        {
          'Nama Lengkap (Wajib)': 'Ustadz Ahmad Fauzi, S.Pd.I',
          'Nama Jabatan (Wajib)': positions[0]?.nama || 'Guru Fiqih & Hadits',
          'NIP (Opsional)': '198507122010011001',
          'UID Kartu RFID (Opsional)': '0014829104',
          'No WhatsApp (Opsional)': '081234567804'
        },
        {
          'Nama Lengkap (Wajib)': 'Ustadzah Fatimah Zahra, M.Pd',
          'Nama Jabatan (Wajib)': positions[1]?.nama || 'Guru Bahasa Arab',
          'NIP (Opsional)': '198803152012012002',
          'UID Kartu RFID (Opsional)': '', // Contoh dikosongkan (Kartu bisa di-tap nanti)
          'No WhatsApp (Opsional)': '081234567805'
        },
        {
          'Nama Lengkap (Wajib)': 'Ustadz Abdullah Yusuf, Lc',
          'Nama Jabatan (Wajib)': positions[2]?.nama || (positions[0]?.nama || 'Guru Tahfidz & Quran'),
          'NIP (Opsional)': '198211052008011003',
          'UID Kartu RFID (Opsional)': '', // Contoh dikosongkan
          'No WhatsApp (Opsional)': ''      // Contoh dikosongkan
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 32 }, // Nama Lengkap (Wajib)
        { wch: 28 }, // Nama Jabatan (Wajib)
        { wch: 24 }, // NIP (Opsional)
        { wch: 28 }, // UID Kartu RFID (Opsional)
        { wch: 24 }  // No WhatsApp (Opsional)
      ];
      ws['!rows'] = [{ hpx: 26 }, { hpx: 20 }, { hpx: 20 }, { hpx: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, isUmum ? 'DATA PEGAWAI' : 'DATA GURU');

      // Sheet 2: Panduan & Keterangan Wajib / Opsional
      const guideData = [
        { 'Nama Kolom': 'Nama Lengkap (Wajib)', 'Status': 'WAJIB DIISI', 'Keterangan': 'Nama lengkap guru/pegawai. Tidak boleh kosong.' },
        { 'Nama Kolom': 'Nama Jabatan (Wajib)', 'Status': 'WAJIB DIISI', 'Keterangan': 'Harus sama persis dengan nama jabatan di Master Jabatan (lihat sheet DAFTAR JABATAN).' },
        { 'Nama Kolom': 'NIP (Opsional)', 'Status': 'OPSIONAL', 'Keterangan': 'Nomor Induk Pegawai/Guru. Boleh dikosongkan.' },
        { 'Nama Kolom': 'UID Kartu RFID (Opsional)', 'Status': 'OPSIONAL (BOLEH KOSONG)', 'Keterangan': 'Boleh kosong jika belum ada kartu. Kartu fisik bisa ditempel nanti di menu Kartu RFID (Mapping).' },
        { 'Nama Kolom': 'No WhatsApp (Opsional)', 'Status': 'OPSIONAL (BOLEH KOSONG)', 'Keterangan': 'Nomor WhatsApp untuk notifikasi presensi. Boleh dikosongkan.' }
      ];
      const wsGuide = XLSX.utils.json_to_sheet(guideData);
      wsGuide['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 68 }];
      wsGuide['!rows'] = [{ hpx: 24 }];
      XLSX.utils.book_append_sheet(wb, wsGuide, 'PANDUAN & PETUNJUK');

      // Sheet 3: Reference Jabatan
      const posRef = positions.map(p => ({
        'ID Jabatan': p.id,
        'Nama Jabatan Resmi (Salin ke Kolom Jabatan)': p.nama,
        'Keterangan': p.keterangan || '-'
      }));
      if (posRef.length > 0) {
        const wsRef = XLSX.utils.json_to_sheet(posRef);
        wsRef['!cols'] = [
          { wch: 12 },
          { wch: 38 },
          { wch: 35 }
        ];
        wsRef['!rows'] = [{ hpx: 24 }];
        XLSX.utils.book_append_sheet(wb, wsRef, isUmum ? 'DAFTAR JABATAN / DIVISI' : 'DAFTAR JABATAN (REFERENSI)');
      }

      XLSX.writeFile(wb, isUmum ? 'Template_Import_Pegawai.xlsx' : 'Template_Import_Guru.xlsx');
    }
  };

  // 2. EXPORT DATA TO EXCEL (.XLSX) DENGAN LEBAR KOLOM RAPI
  const exportToExcel = () => {
    if (members.length === 0) {
      Swal.fire('Info', 'Tidak ada data untuk diekspor.', 'info');
      return;
    }

    const exportRows = members.map((m, idx) => ({
      'No': idx + 1,
      [labelIdNumber]: m.nis_nip || '-',
      'Nama Lengkap': m.nama,
      'UID Kartu RFID': m.uid && !m.uid.startsWith('PENDING-') && !m.uid.startsWith('UNASSIGNED-') ? m.uid : '-',
      [labelGroup]: m.kelas || '-',
      'No. WhatsApp': m.no_hp || '-',
      'Kategori': isUmum ? 'Pegawai' : m.tipe
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 8 },  // No
      { wch: 24 }, // NIS / NIP
      { wch: 32 }, // Nama Lengkap
      { wch: 18 }, // UID RFID
      { wch: 24 }, // Kelas / Jabatan
      { wch: 18 }, // No WhatsApp
      { wch: 14 }  // Kategori
    ];
    ws['!rows'] = [{ hpx: 26 }];

    XLSX.utils.book_append_sheet(wb, ws, `Data_${labelMember.replace(/\s+/g, '_')}`);
    XLSX.writeFile(wb, `Data_${labelMember.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const kotaInstansi = settings.instansi_kota || 'Kota Santri';

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* HEADER & ACTION BUTTONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Manajemen Data {labelMember}
          </h3>
          <p className="text-xs text-slate-500">
            {isGuru 
              ? 'Kelola data NIP, nama, kartu RFID, jabatan/mapel, dan kontak guru' 
              : `Kelola data NIS, nama, kartu RFID, kelas/rombel, dan kontak ${isPesantren ? 'santri' : 'siswa'}`}
          </p>
        </div>

        {/* Buttons Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Download Template */}
          <button 
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-all"
            title="Download template file Excel untuk diisi data"
          >
            <FileDown className="w-3.5 h-3.5 text-primary-600" />
            <span>Download Template</span>
          </button>

          {/* Import Excel */}
          <button 
            onClick={() => {
              if (isDemoActive) {
                showDemoAlert(`Import data ${labelMember} dari Excel`);
                return;
              }
              setImportModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-300 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600" />
            <span>Import Excel</span>
          </button>

          {/* Export Excel */}
          <button 
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-300 transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel</span>
          </button>

          {/* Export PDF */}
          <button 
            onClick={() => setPdfModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-slate-300" />
            <span>Cetak PDF</span>
          </button>

          {/* Add Manual */}
          <button 
            onClick={() => { 
              if (isDemoActive) {
                showDemoAlert(`Menambah ${labelMember} baru`);
                return;
              }
              setEditMember(null); 
              setModalOpen(true); 
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-white text-xs font-semibold rounded-xl shadow transition-all ${
              isGuru ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tambah {labelMember}</span>
          </button>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Total Terdaftar:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isGuru ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-primary-50 text-primary-700 border-primary-200'
            }`}>
              {members.length} {labelMember}
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Cari nama / ${labelIdNumber} / RFID / ${labelGroup.toLowerCase()}...`} 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4 w-36">{labelIdNumber}</th>
                <th className="py-3.5 px-4">Nama Lengkap & Kartu RFID</th>
                <th className="py-3.5 px-4">Kategori</th>
                <th className="py-3.5 px-4">{labelGroup}</th>
                <th className="py-3.5 px-4">No. WhatsApp</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data...</span>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                    Belum ada data {labelMember}. Silakan gunakan Tambah Data atau Import Excel.
                  </td>
                </tr>
              ) : (
                members.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 text-center font-medium text-slate-400 text-xs">{idx + 1}</td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                      {m.nis_nip ? (
                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          {m.nis_nip}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 text-sm">{m.nama}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {m.uid && !m.uid.startsWith('PENDING-') && !m.uid.startsWith('UNASSIGNED-') ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                            <CreditCard className="w-3 h-3 text-primary-500" /> RFID: {m.uid}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <CreditCard className="w-3 h-3 text-slate-400" /> Belum Ada Kartu
                          </span>
                        )}
                        {m.fingerprint_id > 0 && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Fingerprint className="w-3 h-3 text-amber-600" /> Finger: #{m.fingerprint_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isUmum ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isGuru ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-primary-50 text-primary-700 border-primary-200'
                      }`}>
                        {isUmum ? 'Pegawai' : isGuru ? 'Guru' : 'Siswa'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      {m.kelas || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      {m.no_hp || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button 
                          onClick={() => { 
                            if (isDemoActive) {
                              showDemoAlert(`Mengubah data ${labelMember}`);
                              return;
                            }
                            setEditMember(m); 
                            setModalOpen(true); 
                          }}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" 
                          title="Edit Data"
                        >
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(m.id, m.nama)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                          title="Hapus Data"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH / EDIT MEMBER */}
      {modalOpen && (
        <ModalMember 
          member={editMember}
          tipe={tipe}
          classes={classes}
          positions={positions}
          appMode={appMode}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            fetchMembers();
            if (onMembersUpdated) onMembersUpdated();
          }}
        />
      )}

      {/* MODAL IMPORT EXCEL */}
      <ModalImportExcel 
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        tipe={tipe}
        classes={classes}
        positions={positions}
        appMode={appMode}
        onSuccess={() => {
          fetchMembers();
          if (onMembersUpdated) onMembersUpdated();
        }}
        onDownloadTemplate={downloadTemplate}
      />

      {/* MODAL PRINT REKAP PDF */}
      {pdfModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm print-modal animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPdfModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden my-auto">
            {/* Modal Header Bar (Pinned / Sticky at Top) */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50/90 flex-shrink-0 no-print">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base leading-tight flex items-center gap-2">
                    <span>Pratinjau Cetak Data {labelMember}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                      {members.length} Data
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Dokumen siap cetak atau simpan sebagai PDF resmi
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()} 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Sekarang</span>
                </button>
                <button 
                  onClick={() => setPdfModalOpen(false)} 
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
                  title="Tutup (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Document Preview Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6 sm:p-10 max-w-4xl mx-auto print-area print:shadow-none print:border-none print:p-0">
                {/* Kop Surat Instansi */}
                <div className="text-center border-b-2 border-slate-900 pb-3 mb-5">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <School className="w-7 h-7 text-slate-900" />
                    <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900">
                      {settings.instansi_nama || (isUmum ? 'INSTANSI / PERUSAHAAN' : 'YAYASAN PONDOK PESANTREN & SEKOLAH DIGITAL')}
                    </h1>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {settings.instansi_alamat || 'Jl. Kantor Digital No. 01'} • Wilayah: {kotaInstansi}
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-2 uppercase tracking-wide">
                    DAFTAR INDUK DATA {labelMember.toUpperCase()}
                  </p>
                </div>

                {/* Table Data */}
                <table className="w-full text-left border-collapse table-print mb-6 text-xs">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-800 border-y border-slate-400">
                      <th className="py-2 px-2.5 text-center w-10">No</th>
                      <th className="py-2 px-2.5 w-32">{labelIdNumber}</th>
                      <th className="py-2 px-2.5">Nama Lengkap</th>
                      <th className="py-2 px-2.5">UID RFID</th>
                      <th className="py-2 px-2.5">{labelGroup}</th>
                      <th className="py-2 px-2.5">No. WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-6 text-center text-slate-400">
                          Tidak ada data {labelMember.toLowerCase()} yang ditampilkan.
                        </td>
                      </tr>
                    ) : (
                      members.map((m, idx) => (
                        <tr key={m.id} className="border-b border-slate-200">
                          <td className="py-2 px-2.5 text-center">{idx + 1}</td>
                          <td className="py-2 px-2.5 font-mono">{m.nis_nip || '-'}</td>
                          <td className="py-2 px-2.5 font-semibold text-slate-800">{m.nama}</td>
                          <td className="py-2 px-2.5 font-mono">{m.uid && !m.uid.startsWith('PENDING-') ? m.uid : '-'}</td>
                          <td className="py-2 px-2.5">{m.kelas || '-'}</td>
                          <td className="py-2 px-2.5 font-mono">{m.no_hp || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Tanda Tangan */}
                <div className="grid grid-cols-2 gap-8 text-xs text-slate-800 pt-4">
                  <div className="text-center">
                    <p>Mengetahui,</p>
                    <p className="font-semibold mb-14">
                      {isUmum 
                        ? 'Pimpinan / Direktur Instansi' 
                        : isPesantren 
                        ? 'Pengasuh / Mudir' 
                        : 'Kepala Sekolah'}
                    </p>
                    <p className="font-bold underline">( {settings.kepala_nama || (isUmum ? 'Pimpinan Instansi' : 'KH. Ahmad Zaki, Lc., M.Ag')} )</p>
                  </div>
                  <div className="text-center">
                    <p>{kotaInstansi}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="font-semibold mb-14">Petugas Administrator</p>
                    <p className="font-bold underline">( Administrator )</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Bar */}
            <div className="px-5 sm:px-6 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0 no-print text-xs text-slate-500">
              <span>💡 Gunakan opsi <i>Destination: Save as PDF</i> di dialog cetak browser untuk mengunduh PDF.</span>
              <button 
                onClick={() => setPdfModalOpen(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
