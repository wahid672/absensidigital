import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  FileDown, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  HelpCircle,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function ModalImportExcel({
  isOpen,
  onClose,
  tipe = 'siswa',
  classes = [],
  positions = [],
  appMode = 'pesantren',
  onSuccess,
  onDownloadTemplate
}) {
  if (!isOpen) return null;

  const isGuru = tipe === 'guru';
  const isUmum = appMode === 'umum';
  const isPesantren = appMode === 'pesantren';

  const labelMember = isUmum
    ? 'Pegawai'
    : isGuru 
    ? (isPesantren ? 'Guru / Asatidz' : 'Guru / Pendidik') 
    : (isPesantren ? 'Santri' : 'Siswa');

  const labelGroup = isUmum ? 'Jabatan / Divisi' : isGuru ? 'Jabatan / Mapel' : 'Kelas / Rombel';

  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'valid' | 'invalid'
  const fileInputRef = useRef(null);

  // Normalisasi kolom Excel yang fleksibel
  const normalizeRow = (row) => {
    let uid = '';
    let nis_nip = '';
    let nama = '';
    let kelas = '';
    let no_hp = '';
    let nama_ortu = '';

    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      const val = String(row[key] ?? '').trim();

      // UID RFID
      if (k.includes('uid') || k.includes('rfid') || k.includes('kartu')) {
        uid = val.toUpperCase();
      }
      // NIS / NIP / NIK
      else if (k.startsWith('nis') || k.startsWith('nip') || k.includes('induk') || k.includes('nik')) {
        nis_nip = val;
      }
      // Nama Orang Tua (dicek lebih dulu sebelum nama biasa)
      else if (k.includes('ortu') || k.includes('orang tua') || k.includes('wali') || k.includes('ayah') || k.includes('ibu')) {
        nama_ortu = val;
      }
      // Nama Lengkap
      else if (k.includes('nama') || k === 'name' || k.includes('lengkap')) {
        nama = val;
      }
      // Kelas / Jabatan / Rombel
      else if (k.includes('kelas') || k.includes('jabatan') || k.includes('rombel') || k.includes('mapel') || k.includes('posisi') || k.includes('divisi')) {
        kelas = val;
      }
      // WhatsApp / HP
      else if (k.includes('wa') || k.includes('hp') || k.includes('whatsapp') || k.includes('telepon') || k.includes('telp') || k.includes('phone') || k.includes('kontak')) {
        no_hp = val;
      }
    }

    return { uid, nis_nip, nama, kelas, no_hp, nama_ortu };
  };

  // Baca & Validasi file Excel langsung di client
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawData || rawData.length === 0) {
          Swal.fire('File Kosong', 'File Excel tidak memiliki data baris untuk diproses.', 'warning');
          setParsedRows([]);
          return;
        }

        // Siapkan lookup map untuk validasi kelas / jabatan (case-insensitive)
        const classMap = new Map();
        classes.forEach(c => {
          const trimmed = (c.nama || '').trim();
          if (trimmed) classMap.set(trimmed.toLowerCase(), trimmed);
        });

        const posMap = new Map();
        positions.forEach(p => {
          const trimmed = (p.nama || '').trim();
          if (trimmed) posMap.set(trimmed.toLowerCase(), trimmed);
        });

        const seenUIDs = new Set();
        const seenNISNIP = new Set();
        const validated = rawData.map((raw, index) => {
          const rowNumber = index + 2; // Baris 1 adalah header di Excel
          const normalized = normalizeRow(raw);
          const errors = [];

          // 0. Validasi NIS / NIP (Wajib sebagai kunci unik database)
          const idLabel = isGuru ? 'NIP' : 'NIS';
          if (!normalized.nis_nip) {
            errors.push(`${idLabel} wajib diisi sebagai identitas unik anggota`);
          } else {
            if (seenNISNIP.has(normalized.nis_nip)) {
              errors.push(`${idLabel} "${normalized.nis_nip}" duplikat di dalam file Excel`);
            } else {
              seenNISNIP.add(normalized.nis_nip);
            }
          }

          // 1. Validasi Nama (Wajib)
          if (!normalized.nama) {
            errors.push('Nama Lengkap wajib diisi');
          }

          // 2. Validasi Kelas / Jabatan (Wajib & Harus Terdaftar)
          if (!normalized.kelas) {
            errors.push(isGuru ? 'Nama Jabatan wajib diisi' : 'Nama Kelas wajib diisi');
          } else {
            if (isGuru) {
              const matched = posMap.get(normalized.kelas.toLowerCase());
              if (matched) {
                normalized.kelas = matched; // Normalisasi ke nama resmi Master Jabatan
              } else {
                errors.push(`Jabatan "${normalized.kelas}" tidak terdaftar di Master Jabatan`);
              }
            } else {
              const matched = classMap.get(normalized.kelas.toLowerCase());
              if (matched) {
                normalized.kelas = matched; // Normalisasi ke nama resmi Master Kelas
              } else {
                errors.push(`Kelas "${normalized.kelas}" tidak terdaftar di Master Kelas`);
              }
            }
          }

          // 3. Validasi UID RFID (Opsional, tapi jika diisi tidak boleh duplikat di file yang sama)
          if (normalized.uid && normalized.uid !== '-') {
            if (seenUIDs.has(normalized.uid)) {
              errors.push(`UID RFID "${normalized.uid}" duplikat di dalam file Excel`);
            } else {
              seenUIDs.add(normalized.uid);
            }
          }

          return {
            rowNumber,
            ...normalized,
            isValid: errors.length === 0,
            errors
          };
        });

        setParsedRows(validated);

      } catch (err) {
        console.error(err);
        Swal.fire('Format Tidak Didukung', 'Gagal membaca file Excel. Pastikan file berformat .xlsx atau .xls yang valid.', 'error');
        setParsedRows([]);
      }
    };

    reader.readAsBinaryString(file);
  };

  const validRows = parsedRows.filter(r => r.isValid);
  const invalidRows = parsedRows.filter(r => !r.isValid);

  const displayedRows = parsedRows.filter(r => {
    if (filterStatus === 'valid') return r.isValid;
    if (filterStatus === 'invalid') return !r.isValid;
    return true;
  });

  // Eksekusi pengiriman ke backend
  const handleExecuteImport = async () => {
    if (validRows.length === 0) {
      Swal.fire('Peringatan', 'Tidak ada baris data valid yang siap diimpor.', 'warning');
      return;
    }

    setImporting(true);
    try {
      const payload = {
        tipe,
        members: validRows.map(r => ({
          row_number: r.rowNumber,
          uid: r.uid || '',
          nis_nip: r.nis_nip || '',
          nama: r.nama,
          nama_ortu: r.nama_ortu || '',
          tipe: tipe,
          kelas: r.kelas,
          no_hp: r.no_hp || '',
          telegram_chat_id: ''
        }))
      };

      const res = await apiFetch('/api/members/bulk', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        if (data.status === 'success') {
          Swal.fire({
            icon: 'success',
            title: 'Import Berhasil!',
            text: data.message,
            timer: 2500,
            showConfirmButton: false
          });
          if (onSuccess) onSuccess();
          onClose();
        } else if (data.status === 'partial') {
          // Ada yang sukses, ada yang bermasalah di level database
          let errorDetails = '';
          if (data.errors && data.errors.length > 0) {
            errorDetails = `
              <div style="text-align:left; max-height:180px; overflow-y:auto; font-size:12px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-top:10px;">
                <b>Rincian Masalah:</b><br/>
                ${data.errors.map(e => `• <b>Baris ${e.row_number} (${e.nama}):</b> ${e.error}`).join('<br/>')}
              </div>
            `;
          }
          Swal.fire({
            icon: 'warning',
            title: 'Import Selesai dengan Catatan',
            html: `<p>${data.message}</p>${errorDetails}`,
            confirmButtonText: 'Tutup'
          });
          if (onSuccess) onSuccess();
          onClose();
        } else {
          Swal.fire('Gagal', data.message || 'Gagal mengimpor data.', 'error');
        }
      } else {
        Swal.fire('Gagal', data.message || 'Terjadi kesalahan pada server.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal mengirim data import: ' + err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const resetUpload = () => {
    setFileName('');
    setParsedRows([]);
    setFilterStatus('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm modal overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[92vh] flex flex-col">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Import Data {labelMember} dari Excel
              </h3>
              <p className="text-xs text-slate-500">
                Unggah berkas spreadsheet Excel (.xlsx / .xls) untuk import massal
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SECTION 1: PANDUAN KOLOM WAJIB & TIDAK WAJIB (OPSIONAL) */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex-shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Info className="w-4 h-4 text-primary-600" />
              <span>Keterangan Kolom Template Excel:</span>
            </div>
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-semibold rounded-lg border border-primary-200 transition-colors w-fit"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Download Template Excel</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {/* Kolom Wajib */}
            <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Kolom Wajib Diisi:</span>
              </div>
              <ul className="text-slate-600 space-y-1 pl-5 list-disc text-11px">
                <li>
                  <b className="text-slate-800">{isGuru ? 'NIP (Wajib)' : 'NIS (Wajib)'}</b>: Kunci unik anggota di database (tidak boleh kosong & tidak boleh duplikat).
                </li>
                <li>
                  <b className="text-slate-800">Nama Lengkap (Wajib)</b>: Nama santri/guru/pegawai tidak boleh kosong.
                </li>
                <li>
                  <b className="text-slate-800">{isGuru ? 'Nama Jabatan (Wajib)' : 'Nama Kelas (Wajib)'}</b>: Harus sama persis dengan yang ada di <i>Master {isGuru ? 'Jabatan' : 'Kelas'}</i>.
                </li>
              </ul>
            </div>

            {/* Kolom Opsional */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                <span>Kolom Opsional (Boleh Dikosongkan):</span>
              </div>
              <ul className="text-slate-600 space-y-1 pl-5 list-disc text-11px">
                <li>
                  <b className="text-slate-800">UID Kartu RFID (Opsional)</b>: Boleh kosong. Kartu bisa di-tap/dihubungkan nanti di menu <i>Kartu RFID (Mapping)</i>.
                </li>
                <li>
                  <b className="text-slate-800">No WhatsApp (Opsional)</b>: Boleh dikosongkan.
                </li>
                {!isGuru && (
                  <li>
                    <b className="text-slate-800">Nama Orang Tua (Opsional)</b>: Boleh dikosongkan.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* SECTION 2: AREA UNGGAH FILE EXCEL */}
        {!fileName ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-primary-500 bg-slate-50/60 hover:bg-primary-50/20 rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group flex-shrink-0"
          >
            <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-primary-600 group-hover:scale-105 transition-all">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 group-hover:text-primary-600">
                Pilih atau seret file Excel ke sini
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Format yang didukung: .xlsx atau .xls
              </p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".xlsx, .xls" 
              className="hidden" 
            />
          </div>
        ) : (
          <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200 rounded-xl p-3 px-4 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">{fileName}</p>
                <p className="text-11px text-slate-500">{parsedRows.length} baris data terbaca</p>
              </div>
            </div>
            <button
              onClick={resetUpload}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
            >
              Ganti File
            </button>
          </div>
        )}

        {/* SECTION 3: PRATINJAU & VALIDASI REALTIME TABEL DATA */}
        {parsedRows.length > 0 && (
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            {/* Stat Bar & Filter Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs flex-shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Semua ({parsedRows.length})
                </button>
                <button
                  onClick={() => setFilterStatus('valid')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${filterStatus === 'valid' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                >
                  ✓ Siap Diimpor ({validRows.length})
                </button>
                {invalidRows.length > 0 && (
                  <button
                    onClick={() => setFilterStatus('invalid')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${filterStatus === 'invalid' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                  >
                    ⚠ Bermasalah ({invalidRows.length})
                  </button>
                )}
              </div>

              {invalidRows.length > 0 && (
                <div className="flex items-center gap-1.5 text-rose-600 font-medium text-11px bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Ada {invalidRows.length} baris dengan kelas/data yang salah</span>
                </div>
              )}
            </div>

            {/* Table Container with Scroll */}
            <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 overflow-y-auto min-h-[160px] max-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-14 text-center">Baris</th>
                    <th className="p-2.5">{isGuru ? 'NIP (Wajib)' : 'NIS (Wajib)'}</th>
                    <th className="p-2.5">Nama Lengkap (Wajib)</th>
                    <th className="p-2.5">{labelGroup} (Wajib)</th>
                    <th className="p-2.5">UID RFID (Opsional)</th>
                    <th className="p-2.5">No WhatsApp</th>
                    <th className="p-2.5 text-center">Status / Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {displayedRows.map((r) => (
                    <tr 
                      key={r.rowNumber} 
                      className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50 hover:bg-rose-50'}
                    >
                      <td className="p-2.5 text-center font-bold text-slate-500">{r.rowNumber}</td>
                      <td className="p-2.5 font-mono text-11px">
                        {r.nis_nip ? (
                          <span className={r.errors.some(e => e.includes('NIS') || e.includes('NIP')) ? 'text-rose-600 font-bold' : 'text-slate-700 font-semibold'}>
                            {r.nis_nip}
                          </span>
                        ) : (
                          <span className="text-rose-500 font-bold italic">(Wajib Diisi)</span>
                        )}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-800">
                        {r.nama || <span className="text-rose-500 italic">(Kosong)</span>}
                      </td>
                      <td className="p-2.5">
                        {r.kelas ? (
                          <span className={r.errors.some(e => e.includes('Kelas') || e.includes('Jabatan')) ? 'text-rose-600 font-bold' : 'text-slate-700 font-medium'}>
                            {r.kelas}
                          </span>
                        ) : (
                          <span className="text-rose-500 italic">(Kosong)</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {r.uid && r.uid !== '-' ? (
                          <span className="font-mono text-11px px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                            {r.uid}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-11px">Kosong (Opsional)</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-500 text-11px">{r.no_hp || <span className="text-slate-400 italic">Kosong</span>}</td>
                      <td className="p-2.5 text-center">
                        {r.isValid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-10px font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Siap
                          </span>
                        ) : (
                          <div className="text-rose-600 font-semibold text-10px space-y-0.5 text-left max-w-[200px]">
                            {r.errors.map((err, errIdx) => (
                              <div key={errIdx} className="flex items-start gap-1">
                                <XCircle className="w-3 h-3 text-rose-500 flex-shrink-0 mt-0.5" />
                                <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Note jika ada baris error */}
            {invalidRows.length > 0 && (
              <p className="text-11px text-slate-500 italic">
                * Baris yang bermasalah akan otomatis dilewati jika Anda melanjutkan import, atau Anda dapat memperbaiki file Excel dan mengunggahnya kembali.
              </p>
            )}
          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing || validRows.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengimpor Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Impor {validRows.length} Data Valid</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
