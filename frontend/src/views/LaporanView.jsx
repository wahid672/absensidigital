import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  History, 
  GraduationCap, 
  Filter, 
  Plus, 
  FileSpreadsheet, 
  RotateCw, 
  Search, 
  PenSquare, 
  Trash2, 
  Cpu, 
  FolderOpen,
  Zap
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import ModalAttendance from '../components/ModalAttendance';

export default function LaporanView({ members = [], realtimeEvent = null }) {
  const today = new Date().toISOString().split('T')[0];
  const [tanggal, setTanggal] = useState(today);
  const [tipe, setTipe] = useState('all');
  const [search, setSearch] = useState('');
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Fetch Attendance
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/attendance?tanggal=${tanggal}&tipe=${tipe}`);
      const result = await res.json();
      setData(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tanggal, tipe]);

  // Handle Realtime Tap Event
  useEffect(() => {
    if (realtimeEvent && realtimeEvent.record) {
      const rec = realtimeEvent.record;
      if (tanggal === today) {
        setData(prev => {
          const idx = prev.findIndex(item => item.id === rec.id || (item.uid === rec.uid && item.tanggal === rec.tanggal));
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = rec;
            return updated;
          } else {
            return [rec, ...prev];
          }
        });
        setHighlightId(rec.id);
        setTimeout(() => setHighlightId(null), 3000);
      }
    }
  }, [realtimeEvent]);

  // Delete handler
  const handleDelete = (id, nama) => {
    Swal.fire({
      title: 'Hapus Data Presensi?',
      html: `Apakah Anda yakin ingin menghapus data absensi <b>${nama}</b>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/attendance?id=${id}`, { method: 'DELETE' });
          const json = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Terhapus', text: json.message, timer: 1500, showConfirmButton: false });
            fetchData();
          } else {
            Swal.fire('Gagal', json.message, 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghapus data.', 'error');
        }
      }
    });
  };

  // CSV Export
  const exportCSV = () => {
    if (!data.length) {
      Swal.fire('Info', 'Tidak ada data untuk diekspor.', 'info');
      return;
    }
    const headers = ['No', 'Nama', 'Tipe', 'Kelas', 'Waktu Masuk', 'Status Masuk', 'Waktu Keluar', 'Status Keluar', 'Mesin'];
    const rows = filteredData.map((item, i) => [
      i + 1,
      `"${item.nama}"`,
      item.tipe,
      `"${item.kelas || '-'}"`,
      item.waktu_masuk || '-',
      item.status_masuk || '-',
      item.waktu_keluar || '-',
      item.status_keluar || '-',
      item.id_mesin || 'ESP32'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_absensi_${tanggal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculations
  const tepatCount = data.filter(i => (i.status_masuk || '').toLowerCase().includes('tepat')).length;
  const telatCount = data.filter(i => (i.status_masuk || '').toLowerCase().includes('telat')).length;
  const siswaCount = data.filter(i => (i.tipe || '').toLowerCase() === 'siswa').length;
  const guruCount = data.filter(i => (i.tipe || '').toLowerCase() === 'guru').length;

  const filteredData = data.filter(i => 
    (i.nama || '').toLowerCase().includes(search.toLowerCase().trim()) ||
    (i.id_mesin || '').toLowerCase().includes(search.toLowerCase().trim()) ||
    (i.kelas || '').toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Kehadiran</p>
            <h3 className="text-2xl font-bold text-slate-800">{data.length}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tepat Waktu</p>
            <h3 className="text-2xl font-bold text-emerald-600">{tepatCount}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
            <History className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Terlambat</p>
            <h3 className="text-2xl font-bold text-rose-600">{telatCount}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Siswa / Guru</p>
            <h3 className="text-xl font-bold text-slate-800">{siswaCount} / {guruCount}</h3>
          </div>
        </div>
      </div>

      {/* FILTER & ACTIONS */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary-600" />
            <span className="font-bold text-slate-800 text-sm">Filter & Manajemen Data Absensi</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setEditItem(null); setModalOpen(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Presensi Manual</span>
            </button>
            <button 
              type="button" 
              onClick={exportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl border border-slate-300 transition-all text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Absensi</label>
            <input 
              type="date" 
              value={tanggal} 
              onChange={(e) => setTanggal(e.target.value)}
              required 
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipe Pengguna</label>
            <select 
              value={tipe} 
              onChange={(e) => setTipe(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="all">Semua Pengguna</option>
              <option value="siswa">Siswa</option>
              <option value="guru">Guru</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl shadow-md shadow-primary-600/20 transition-all text-xs disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Tampilkan Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* REKAPITULASI TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Daftar Rekapitulasi Presensi</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {filteredData.length} Data
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / ID mesin / kelas..." 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4">Nama Lengkap</th>
                <th className="py-3.5 px-4">Tipe</th>
                <th className="py-3.5 px-4">Waktu Masuk</th>
                <th className="py-3.5 px-4">Status Masuk</th>
                <th className="py-3.5 px-4">Waktu Keluar</th>
                <th className="py-3.5 px-4">Status Keluar</th>
                <th className="py-3.5 px-4">Mesin / Ket</th>
                <th className="py-3.5 px-4 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && filteredData.length === 0 ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-4 text-center"><div className="h-4 w-4 bg-slate-200 rounded mx-auto"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-32 bg-slate-200 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-5 w-16 bg-slate-200 rounded-full"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-5 w-20 bg-slate-200 rounded-full"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-5 w-20 bg-slate-200 rounded-full"></div></td>
                    <td className="py-4 px-4"><div className="h-5 w-24 bg-slate-200 rounded"></div></td>
                    <td className="py-4 px-4 text-center"><div className="h-5 w-12 bg-slate-200 rounded mx-auto"></div></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600 text-sm">Tidak ada data absensi ditemukan</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => {
                  const isGuru = (item.tipe || 'siswa').toLowerCase() === 'guru';
                  const sm = (item.status_masuk || '').toLowerCase();
                  const sk = (item.status_keluar || '').toLowerCase();
                  const isHighlighted = highlightId === item.id;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${isHighlighted ? 'row-highlight' : ''}`}
                    >
                      <td className="py-3.5 px-4 text-center font-medium text-slate-400 text-xs">{index + 1}</td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800">{item.nama}</p>
                        <p className="text-[11px] text-slate-400">{item.kelas || '-'}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isGuru ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}>
                          {isGuru ? 'Guru' : 'Siswa'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{item.waktu_masuk || '-'}</td>
                      <td className="py-3.5 px-4">
                        {sm.includes('tepat') ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Tepat
                          </span>
                        ) : sm.includes('telat') ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Telat
                          </span>
                        ) : (sm === 'izin' || sm === 'sakit') ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 capitalize">
                            {sm}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{item.waktu_keluar || '-'}</td>
                      <td className="py-3.5 px-4">
                        {sk.includes('tepat') ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Tepat
                          </span>
                        ) : sk.includes('cepat') ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Cepat
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-600">
                          <Cpu className="w-3 h-3 text-slate-400" /> {item.id_mesin || 'ESP32'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button 
                            onClick={() => { setEditItem(item); setModalOpen(true); }}
                            className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" 
                            title="Edit Jam Presensi"
                          >
                            <PenSquare className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id, item.nama)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                            title="Hapus Data"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Menampilkan data presensi</span>
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <Zap className="w-3.5 h-3.5" /> Realtime live update aktif
          </span>
        </div>
      </div>

      {/* MODAL ATTENDANCE */}
      {modalOpen && (
        <ModalAttendance 
          item={editItem}
          members={members}
          defaultDate={tanggal}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchData}
        />
      )}
    </section>
  );
}
