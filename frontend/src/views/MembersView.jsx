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
  const [importing, setImporting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

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

  // 1. DOWNLOAD TEMPLATE EXCEL (.XLSX) DENGAN LEBAR KOLOM & FORMAT RAPI
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    if (tipe === 'siswa') {
      // Data Sheet Santri / Siswa
      const sampleData = [
        {
          'NIS': '20261001',
          'Nama Lengkap': 'Muhammad Rizky Pratama',
          'UID Kartu RFID': 'A1B2C301',
          'Nama Kelas': classes[0]?.nama || '10 IPA 1',
          'No WhatsApp': '081234567801'
        },
        {
          'NIS': '20261002',
          'Nama Lengkap': 'Aisyah Nurul Hidayah',
          'UID Kartu RFID': 'A1B2C302',
          'Nama Kelas': classes[1]?.nama || '10 IPA 2',
          'No WhatsApp': '081234567802'
        },
        {
          'NIS': '20261003',
          'Nama Lengkap': 'Fajar Dwi Santoso',
          'UID Kartu RFID': 'A1B2C303',
          'Nama Kelas': classes[2]?.nama || '11 IPA 1',
          'No WhatsApp': '081234567803'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      // Format lebar kolom agar tidak terpotong saat dibuka di Excel
      ws['!cols'] = [
        { wch: 18 }, // NIS
        { wch: 32 }, // Nama Lengkap
        { wch: 20 }, // UID Kartu RFID
        { wch: 22 }, // Nama Kelas
        { wch: 20 }  // No WhatsApp
      ];
      ws['!rows'] = [{ hpx: 26 }, { hpx: 20 }, { hpx: 20 }, { hpx: 20 }];

      XLSX.utils.book_append_sheet(wb, ws, isPesantren ? 'DATA SANTRI' : 'DATA SISWA');

      // Reference Sheet Kelas
      const classRef = classes.map(c => ({
        'ID Kelas': c.id,
        'Nama Kelas': c.nama,
        'Tingkat': c.tingkat || '-',
        'Keterangan': c.keterangan || '-'
      }));
      if (classRef.length > 0) {
        const wsRef = XLSX.utils.json_to_sheet(classRef);
        wsRef['!cols'] = [
          { wch: 12 },
          { wch: 24 },
          { wch: 18 },
          { wch: 35 }
        ];
        wsRef['!rows'] = [{ hpx: 24 }];
        XLSX.utils.book_append_sheet(wb, wsRef, 'DAFTAR KELAS (REFERENSI)');
      }

      XLSX.writeFile(wb, isPesantren ? 'Template_Import_Santri.xlsx' : 'Template_Import_Siswa.xlsx');

    } else {
      // Data Sheet Guru
      const sampleData = [
        {
          'NIP': '198507122010011001',
          'Nama Lengkap': 'Ustadz Ahmad Fauzi, S.Pd.I',
          'UID Kartu RFID': 'A1B2C304',
          'Nama Jabatan': positions[0]?.nama || 'Guru Fiqih & Hadits',
          'No WhatsApp': '081234567804'
        },
        {
          'NIP': '198803152012012002',
          'Nama Lengkap': 'Ustadzah Fatimah Zahra, M.Pd',
          'UID Kartu RFID': 'A1B2C305',
          'Nama Jabatan': positions[1]?.nama || 'Guru Bahasa Arab',
          'No WhatsApp': '081234567805'
        },
        {
          'NIP': '198211052008011003',
          'Nama Lengkap': 'Ustadz Abdullah Yusuf, Lc',
          'UID Kartu RFID': 'A1B2C306',
          'Nama Jabatan': positions[2]?.nama || 'Guru Tahfidz & Quran',
          'No WhatsApp': '081234567806'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 24 }, // NIP
        { wch: 32 }, // Nama Lengkap
        { wch: 20 }, // UID Kartu RFID
        { wch: 28 }, // Nama Jabatan
        { wch: 20 }  // No WhatsApp
      ];
      ws['!rows'] = [{ hpx: 26 }, { hpx: 20 }, { hpx: 20 }, { hpx: 20 }];

      XLSX.utils.book_append_sheet(wb, ws, isUmum ? 'DATA PEGAWAI' : 'DATA GURU');

      // Reference Sheet Jabatan
      const posRef = positions.map(p => ({
        'ID Jabatan': p.id,
        'Nama Jabatan': p.nama,
        'Keterangan': p.keterangan || '-'
      }));
      if (posRef.length > 0) {
        const wsRef = XLSX.utils.json_to_sheet(posRef);
        wsRef['!cols'] = [
          { wch: 12 },
          { wch: 28 },
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

  // 3. IMPORT EXCEL (.XLSX)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (isDemoActive) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      showDemoAlert(`Import data ${labelMember} dari Excel`);
      return;
    }

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows || rows.length === 0) {
          Swal.fire('Peringatan', 'File Excel kosong atau format tidak sesuai.', 'warning');
          setImporting(false);
          return;
        }

        const parsedMembers = [];
        for (const row of rows) {
          // Normalize column names
          let uid = '';
          let nis_nip = '';
          let nama = '';
          let kelas = '';
          let no_hp = '';

          for (const key of Object.keys(row)) {
            const k = key.toLowerCase().trim();
            const val = String(row[key]).trim();

            if (k.includes('uid') || k.includes('rfid')) {
              uid = val.toUpperCase();
            } else if (k === 'nis' || k === 'nip' || k.includes('nomor induk') || k.includes('nis_nip')) {
              nis_nip = val;
            } else if (k.includes('nama') || k === 'name') {
              nama = val;
            } else if (k.includes('kelas') || k.includes('jabatan') || k.includes('rombel') || k.includes('mapel')) {
              kelas = val;
            } else if (k.includes('wa') || k.includes('hp') || k.includes('telepon') || k.includes('telp')) {
              no_hp = val;
            }
          }

          if (nama) {
            parsedMembers.push({
              uid: uid || '',
              nis_nip,
              nama,
              tipe,
              kelas,
              no_hp
            });
          }
        }

        if (parsedMembers.length === 0) {
          Swal.fire('Gagal', 'Tidak ada baris data valid yang memiliki Nama Lengkap.', 'error');
          setImporting(false);
          return;
        }

        // Send to backend /api/members/bulk
        const res = await apiFetch('/api/members/bulk', {
          method: 'POST',
          body: JSON.stringify({ members: parsedMembers })
        });
        const data = await res.json();

        if (res.ok) {
          Swal.fire({
            icon: 'success',
            title: 'Import Berhasil!',
            text: data.message,
            timer: 2000,
            showConfirmButton: false
          });
          fetchMembers();
        } else {
          Swal.fire('Gagal', data.message || 'Gagal mengimpor data.', 'error');
        }

      } catch (err) {
        Swal.fire('Error', 'Gagal memproses file Excel: ' + err.message, 'error');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
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
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-300 transition-all disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600" />
            <span>{importing ? 'Mengimpor...' : 'Import Excel'}</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />

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

      {/* MODAL PRINT REKAP PDF */}
      {pdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto print-modal">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 no-print">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-primary-600" />
                <span>Pratinjau Cetak Data {labelMember}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()} 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Cetak Sekarang
                </button>
                <button onClick={() => setPdfModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Document Content */}
            <div className="print-area p-4">
              <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <School className="w-7 h-7 text-slate-900" />
                  <h1 className="text-lg font-bold tracking-wide uppercase text-slate-900">
                    {settings.instansi_nama || (isUmum ? 'INSTANSI / PERUSAHAAN' : 'YAYASAN PONDOK PESANTREN & SEKOLAH DIGITAL')}
                  </h1>
                </div>
                <p className="text-[11px] text-slate-600">
                  {settings.instansi_alamat || 'Jl. Kantor Digital No. 01'} • Wilayah: {kotaInstansi}
                </p>
                <p className="text-xs font-bold text-slate-900 mt-2 uppercase">
                  DAFTAR INDUK DATA {labelMember.toUpperCase()}
                </p>
              </div>

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
                  {members.map((m, idx) => (
                    <tr key={m.id} className="border-b border-slate-200">
                      <td className="py-2 px-2.5 text-center">{idx + 1}</td>
                      <td className="py-2 px-2.5 font-mono">{m.nis_nip || '-'}</td>
                      <td className="py-2 px-2.5 font-semibold">{m.nama}</td>
                      <td className="py-2 px-2.5 font-mono">{m.uid}</td>
                      <td className="py-2 px-2.5">{m.kelas || '-'}</td>
                      <td className="py-2 px-2.5 font-mono">{m.no_hp || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
        </div>
      )}
    </section>
  );
}
