import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  History, 
  GraduationCap, 
  Briefcase,
  Filter, 
  Plus, 
  FileSpreadsheet, 
  RotateCw, 
  Search, 
  PenSquare, 
  Trash2, 
  Cpu, 
  FolderOpen,
  Zap,
  TrendingUp,
  PieChart,
  Calendar,
  AlertCircle,
  Building
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import ModalAttendance from '../components/ModalAttendance';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function DashboardView({ 
  members = [], 
  classes = [], 
  positions = [], 
  settings = {},
  realtimeEvent = null 
}) {
  const isDemoActive = isDemo(settings);
  const mode = settings.app_mode || 'pesantren';
  const isUmum = mode === 'umum';
  const isPesantren = mode === 'pesantren';

  const labelSiswa = isPesantren ? 'Santri' : 'Siswa';
  const labelGuru = isUmum ? 'Pegawai' : isPesantren ? 'Guru / Asatidz' : 'Guru';

  const today = new Date().toISOString().split('T')[0];
  const [tanggal, setTanggal] = useState(today);
  const [tipe, setTipe] = useState(isUmum ? 'guru' : 'all');
  const [selectedKelas, setSelectedKelas] = useState('');
  const [search, setSearch] = useState('');
  
  const [data, setData] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Sync mode umum
  useEffect(() => {
    if (isUmum) {
      setTipe('guru');
    }
  }, [isUmum]);

  // Fetch Attendance Records
  const fetchData = async () => {
    setLoading(true);
    const activeTipe = isUmum ? 'guru' : tipe;
    let url = `/api/attendance?tanggal=${tanggal}&tipe=${activeTipe}`;
    if (selectedKelas) url += `&kelas=${encodeURIComponent(selectedKelas)}`;

    try {
      const res = await apiFetch(url);
      const result = await res.json();
      setData(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Dashboard Stats (7-Day Trend & Counts)
  const fetchStats = async () => {
    try {
      const statsUrl = isUmum ? '/api/stats/dashboard?tipe=guru' : '/api/stats/dashboard';
      const res = await apiFetch(statsUrl);
      const result = await res.json();
      setDashboardStats(result);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tanggal, tipe, selectedKelas, isUmum]);

  useEffect(() => {
    fetchStats();
  }, [isUmum]);

  // Handle Realtime Tap Event
  useEffect(() => {
    if (realtimeEvent && realtimeEvent.record) {
      const rec = realtimeEvent.record;
      if (isUmum && rec.tipe && rec.tipe.toLowerCase() !== 'guru') {
        return;
      }
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
        fetchStats();
      }
    }
  }, [realtimeEvent, isUmum, tanggal]);

  // Delete handler
  const handleDelete = (id, nama) => {
    if (isDemoActive) {
      showDemoAlert('Menghapus data presensi');
      return;
    }
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
            fetchStats();
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
    if (!filteredData.length) {
      Swal.fire('Info', 'Tidak ada data untuk diekspor.', 'info');
      return;
    }
    const headers = isUmum 
      ? ['No', 'Nama', 'Kategori', 'Jabatan / Divisi', 'Waktu Masuk', 'Status Masuk', 'Waktu Keluar', 'Status Keluar', 'Mesin']
      : ['No', 'Nama', 'Tipe', 'Kelas / Jabatan', 'Waktu Masuk', 'Status Masuk', 'Waktu Keluar', 'Status Keluar', 'Mesin'];
    const rows = filteredData.map((item, i) => [
      i + 1,
      `"${item.nama}"`,
      isUmum ? 'Pegawai' : item.tipe,
      `"${item.kelas || '-'}"`,
      item.waktu_masuk || '-',
      item.status_masuk || '-',
      item.waktu_keluar || '-',
      item.status_keluar || '-',
      item.id_mesin || 'Mesin 01'
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

  // Metric counts
  const activeData = isUmum ? data.filter(i => (i.tipe || '').toLowerCase() === 'guru') : data;

  const tepatCount = activeData.filter(i => (i.status_masuk || '').toLowerCase().includes('tepat')).length;
  const telatCount = activeData.filter(i => (i.status_masuk || '').toLowerCase().includes('telat')).length;
  const izinSakitCount = activeData.filter(i => {
    const s = (i.status_masuk || '').toLowerCase();
    return s === 'izin' || s === 'sakit';
  }).length;
  const siswaCount = data.filter(i => (i.tipe || '').toLowerCase() === 'siswa').length;
  const guruCount = data.filter(i => (i.tipe || '').toLowerCase() === 'guru').length;
  const totalHadir = activeData.length;

  const filteredData = activeData.filter(i => 
    (i.nama || '').toLowerCase().includes(search.toLowerCase().trim()) ||
    (i.id_mesin || '').toLowerCase().includes(search.toLowerCase().trim()) ||
    (i.kelas || '').toLowerCase().includes(search.toLowerCase().trim())
  );

  // Maximum count for chart scaling
  const trendDays = dashboardStats?.trend_7_days || [];
  const maxTrendTotal = Math.max(...trendDays.map(d => d.total), 10);

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* 1. TOP METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xl flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Total Hadir Hari Ini</p>
            <h3 className="text-2xl font-bold text-slate-800">{totalHadir}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Tepat Waktu</p>
            <h3 className="text-2xl font-bold text-emerald-600">{tepatCount}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl flex-shrink-0">
            <History className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Terlambat</p>
            <h3 className="text-2xl font-bold text-rose-600">{telatCount}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl flex-shrink-0">
            {isUmum ? <Briefcase className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">
              {isUmum ? 'Pegawai Terdata' : `${labelSiswa} / ${labelGuru}`}
            </p>
            <h3 className="text-xl font-bold text-slate-800">
              {isUmum ? (dashboardStats?.counts?.guru ?? members.filter(m => m.tipe === 'guru').length) : `${siswaCount} / ${guruCount}`}
            </h3>
          </div>
        </div>
      </div>

      {/* 2. GRAFIK TREN 7 HARI & DISTRIBUSI STATUS (MODERN CHARTS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRAFIK 1: TREN KEHADIRAN 7 HARI TERAKHIR */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Tren Kehadiran 7 Hari Terakhir</h4>
                  <p className="text-xs text-slate-400">
                    {isUmum 
                      ? 'Statistik jumlah tap harian pegawai' 
                      : isPesantren 
                      ? 'Statistik jumlah tap harian santri dan guru' 
                      : 'Statistik jumlah tap harian siswa dan guru'}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 7 Hari
              </span>
            </div>

            {/* Custom Bar Chart Visualizer */}
            <div className="pt-6 pb-2">
              <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 px-2">
                {trendDays.map((d, idx) => {
                  const barHeightPct = Math.max(Math.round((d.total / maxTrendTotal) * 100), 8);
                  const isToday = d.tanggal === today;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] py-1 px-2 rounded shadow-lg pointer-events-none whitespace-nowrap z-10">
                        {d.total} Hadir ({d.tepat} Tepat, {d.telat} Telat)
                      </div>

                      {/* Bar Container */}
                      <div className="w-full max-w-[38px] bg-slate-100 rounded-t-xl h-full flex items-end p-1">
                        <div 
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full rounded-t-lg transition-all duration-500 flex flex-col justify-end overflow-hidden ${
                            isToday ? 'bg-gradient-to-t from-primary-600 to-sky-400' : 'bg-gradient-to-t from-slate-600 to-slate-400'
                          }`}
                        >
                          <div className="text-[10px] font-bold text-white text-center pb-1">
                            {d.total > 0 ? d.total : ''}
                          </div>
                        </div>
                      </div>

                      {/* Day Label */}
                      <div className="text-center">
                        <span className={`text-[11px] block font-semibold ${isToday ? 'text-primary-600 font-bold' : 'text-slate-600'}`}>
                          {d.hari}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          {d.tanggal.substring(5)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-primary-600"></span> Hari Ini</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-500"></span> Hari Sebelumnya</span>
            </div>
            <span className="text-[11px] text-slate-400 italic">Otomatis sinkron dengan database sistem</span>
          </div>
        </div>

        {/* GRAFIK 2: KOMPOSISI & STATUS HARI INI */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Distribusi Kehadiran</h4>
                  <p className="text-xs text-slate-400">Rincian ketepatan waktu hari ini</p>
                </div>
              </div>
            </div>

            {/* Progress Breakdown Bars */}
            <div className="py-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Tepat Waktu
                  </span>
                  <span className="text-slate-700">{tepatCount} orang ({totalHadir ? Math.round((tepatCount/totalHadir)*100) : 0}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    style={{ width: `${totalHadir ? (tepatCount/totalHadir)*100 : 0}%` }}
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-rose-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> Terlambat
                  </span>
                  <span className="text-slate-700">{telatCount} orang ({totalHadir ? Math.round((telatCount/totalHadir)*100) : 0}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    style={{ width: `${totalHadir ? (telatCount/totalHadir)*100 : 0}%` }}
                    className="bg-rose-500 h-full rounded-full transition-all duration-500"
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-amber-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> Izin / Sakit
                  </span>
                  <span className="text-slate-700">{izinSakitCount} orang ({totalHadir ? Math.round((izinSakitCount/totalHadir)*100) : 0}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    style={{ width: `${totalHadir ? (izinSakitCount/totalHadir)*100 : 0}%` }}
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Master Stats Footer */}
          <div className={`pt-4 border-t border-slate-100 grid ${isUmum ? 'grid-cols-1' : 'grid-cols-2'} gap-2 text-center text-xs`}>
            {!isUmum && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Master Kelas</span>
                <span className="font-bold text-slate-800 text-sm">{dashboardStats?.counts?.kelas || classes.length} Kelas</span>
              </div>
            )}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block text-[10px]">{isUmum ? 'Master Jabatan / Divisi' : 'Master Jabatan'}</span>
              <span className="font-bold text-slate-800 text-sm">{dashboardStats?.counts?.jabatan || positions.length} Posisi</span>
            </div>
          </div>
        </div>

      </div>

      {/* 3. FILTER CONTROLS & TABLE REKAPITULASI */}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Absensi</label>
            <input 
              type="date" 
              value={tanggal} 
              onChange={(e) => setTanggal(e.target.value)}
              required 
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isUmum ? 'Kategori Pegawai' : 'Tipe Pengguna'}
            </label>
            <select 
              value={tipe} 
              onChange={(e) => { setTipe(e.target.value); setSelectedKelas(''); }}
              disabled={isUmum}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer disabled:bg-slate-100 disabled:cursor-default"
            >
              {isUmum ? (
                <option value="guru">Semua Pegawai</option>
              ) : (
                <>
                  <option value="all">Semua Pengguna</option>
                  <option value="siswa">{labelSiswa}</option>
                  <option value="guru">{labelGuru}</option>
                </>
              )}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isUmum ? 'Filter Jabatan / Divisi' : (tipe === 'guru' ? 'Filter Jabatan' : 'Filter Kelas')}
            </label>
            <select 
              value={selectedKelas} 
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="">-- Semua {isUmum ? 'Jabatan / Divisi' : (tipe === 'guru' ? 'Jabatan' : 'Kelas')} --</option>
              {isUmum || tipe === 'guru' ? (
                positions.map(p => <option key={p.id} value={p.nama}>{p.nama}</option>)
              ) : (
                classes.map(c => <option key={c.id} value={c.nama}>{c.nama}</option>)
              )}
            </select>
          </div>

          <div className="lg:col-span-2">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl shadow-md shadow-primary-600/20 transition-all text-xs disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Tampilkan</span>
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
              placeholder={isUmum ? "Cari nama / ID mesin / jabatan..." : "Cari nama / ID mesin / kelas..."}
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
                <th className="py-3.5 px-4">{isUmum ? 'Jabatan / Divisi' : 'Kelas / Jabatan'}</th>
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
                    <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
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
                  <td colSpan="10" className="py-12 text-center text-slate-400 text-xs">
                    Belum ada data absensi untuk filter ini.
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => {
                  const isHighlighted = item.id === highlightId;
                  const sm = (item.status_masuk || '').toLowerCase();
                  const sk = (item.status_keluar || '').toLowerCase();
                  const isItemGuru = (item.tipe || '').toLowerCase() === 'guru';

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${isHighlighted ? 'row-highlight' : ''}`}
                    >
                      <td className="py-3.5 px-4 text-center font-medium text-slate-400 text-xs">{index + 1}</td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800">{item.nama}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isUmum 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : isItemGuru 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}>
                          {isUmum ? 'Pegawai' : isItemGuru ? labelGuru : labelSiswa}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                        {item.kelas || '-'}
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
                          <Cpu className="w-3 h-3 text-slate-400" /> {item.id_mesin || 'Mesin 01'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button 
                            onClick={() => { 
                              if (isDemoActive) {
                                showDemoAlert('Mengubah data presensi');
                                return;
                              }
                              setEditItem(item); 
                              setModalOpen(true); 
                            }}
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
          classes={classes}
          positions={positions}
          defaultDate={tanggal}
          appMode={mode}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { fetchData(); fetchStats(); }}
        />
      )}
    </section>
  );
}
