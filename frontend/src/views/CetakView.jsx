import React, { useState, useEffect } from 'react';
import { Printer, School, Filter, Calendar, CheckSquare, Square, Layers, ListFilter } from 'lucide-react';
import { apiFetch } from '../api';

export default function CetakView({ settings = {}, classes = [], positions = [] }) {
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = today.substring(0, 7);

  const modeApp = settings.app_mode || 'pesantren';
  const isUmum = modeApp === 'umum';
  const isPesantren = modeApp === 'pesantren';

  const [mode, setMode] = useState('total_akumulasi'); // 'harian' | 'bulanan' | 'total_akumulasi'
  const [tanggal, setTanggal] = useState(today);
  const [bulan, setBulan] = useState(currentMonth);
  const [selectedMonths, setSelectedMonths] = useState([currentMonth]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [tipe, setTipe] = useState(isUmum ? 'guru' : 'all');
  const [selectedKelas, setSelectedKelas] = useState('');

  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Sync tipe if mode changes to umum
  useEffect(() => {
    if (isUmum) {
      setTipe('guru');
    }
  }, [isUmum]);

  const monthNames = [
    { num: '01', name: 'Januari' },
    { num: '02', name: 'Februari' },
    { num: '03', name: 'Maret' },
    { num: '04', name: 'April' },
    { num: '05', name: 'Mei' },
    { num: '06', name: 'Juni' },
    { num: '07', name: 'Juli' },
    { num: '08', name: 'Agustus' },
    { num: '09', name: 'September' },
    { num: '10', name: 'Oktober' },
    { num: '11', name: 'November' },
    { num: '12', name: 'Desember' },
  ];

  const toggleMonth = (mStr) => {
    if (selectedMonths.includes(mStr)) {
      if (selectedMonths.length > 1) {
        setSelectedMonths(selectedMonths.filter(m => m !== mStr));
      }
    } else {
      setSelectedMonths([...selectedMonths, mStr].sort());
    }
  };

  const selectAllMonths = () => {
    const all = monthNames.map(m => `${selectedYear}-${m.num}`);
    setSelectedMonths(all);
  };

  const selectCurrentMonthOnly = () => {
    setSelectedMonths([currentMonth]);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const activeTipe = isUmum ? 'guru' : tipe;
      if (mode === 'total_akumulasi') {
        const monthsParam = selectedMonths.join(',');
        let url = `/api/attendance/summary?bulan=${monthsParam}&tipe=${activeTipe}`;
        if (selectedKelas) url += `&kelas=${encodeURIComponent(selectedKelas)}`;
        const res = await apiFetch(url);
        const result = await res.json();
        setSummaryData(result.data || []);
      } else {
        let url = `/api/attendance?tipe=${activeTipe}`;
        if (mode === 'bulanan') {
          url += `&bulan=${bulan}`;
        } else {
          url += `&tanggal=${tanggal}`;
        }
        if (selectedKelas) url += `&kelas=${encodeURIComponent(selectedKelas)}`;
        const res = await apiFetch(url);
        const result = await res.json();
        setData(result.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode, tanggal, bulan, selectedMonths, tipe, selectedKelas, isUmum]);

  const kotaInstansi = settings.instansi_kota || 'Kota Santri';

  // Format label selected months
  const getSelectedMonthsLabel = () => {
    if (selectedMonths.length === 1) {
      const parts = selectedMonths[0].split('-');
      const mObj = monthNames.find(m => m.num === parts[1]);
      return `${mObj ? mObj.name : parts[1]} ${parts[0]}`;
    }
    const names = selectedMonths.map(mStr => {
      const parts = mStr.split('-');
      const mObj = monthNames.find(m => m.num === parts[1]);
      return mObj ? mObj.name : parts[1];
    });
    return `${names.join(', ')} (${selectedYear})`;
  };

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl w-full mx-auto">
      {/* FILTER CONTROL (Hidden on print) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm no-print space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Cetak Rekap Laporan Absensi (PDF / Print)</h3>
            <p className="text-xs text-slate-500">Pilih format laporan total kehadiran atau log rincian harian/bulanan</p>
          </div>
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan ke PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis / Mode Laporan</label>
            <select 
              value={mode} 
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2 bg-primary-50/60 border border-primary-300 rounded-xl text-xs font-semibold text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="total_akumulasi">📊 Laporan Jumlah Total Kehadiran (Akumulasi Multi-Bulan)</option>
              <option value="bulanan">📅 Laporan Rekap Bulanan (Rincian Log Harian)</option>
              <option value="harian">⏱️ Laporan Harian (Rincian Per Tanggal)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isUmum ? 'Kategori Anggota' : 'Kategori Pengguna'}
            </label>
            <select 
              value={isUmum ? 'guru' : tipe} 
              onChange={(e) => { if (!isUmum) { setTipe(e.target.value); setSelectedKelas(''); } }}
              disabled={isUmum}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer disabled:bg-slate-100 disabled:text-slate-700"
            >
              {isUmum ? (
                <option value="guru">Data Pegawai</option>
              ) : (
                <>
                  <option value="all">Semua ({isPesantren ? 'Santri & Guru' : 'Siswa & Guru'})</option>
                  <option value="siswa">Khusus {isPesantren ? 'Santri' : 'Siswa'}</option>
                  <option value="guru">Khusus {isPesantren ? 'Guru / Ustadz' : 'Guru'}</option>
                </>
              )}
            </select>
          </div>

          <div>
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
        </div>

        {/* TIME / PERIOD CONTROLS */}
        {mode === 'harian' && (
          <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
            <div className="w-full sm:w-64">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Tanggal Absensi</label>
              <input 
                type="date" 
                value={tanggal} 
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        {mode === 'bulanan' && (
          <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
            <div className="w-full sm:w-64">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Bulan</label>
              <input 
                type="month" 
                value={bulan} 
                onChange={(e) => setBulan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        {/* MULTI-SELECT MONTHS UNTUK MODE TOTAL AKUMULASI */}
        {mode === 'total_akumulasi' && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary-600" />
                <span>Pilih Bulan yang Dihitung (Bisa Pilih Banyak / Multi-Select Tahun {selectedYear}):</span>
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={selectCurrentMonthOnly}
                  className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 px-2.5 py-1 rounded-lg border border-primary-200 transition-colors"
                >
                  Bulan Ini Saja
                </button>
                <button 
                  type="button" 
                  onClick={selectAllMonths}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
                >
                  Pilih Semua (12 Bulan)
                </button>
              </div>
            </div>

            {/* Pill Buttons 12 Bulan */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {monthNames.map(m => {
                const mStr = `${selectedYear}-${m.num}`;
                const isSelected = selectedMonths.includes(mStr);

                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => toggleMonth(mStr)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      isSelected
                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{m.name}</span>
                    {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* LEMBAR PRINT / PDF PREVIEW */}
      <div className="bg-white p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm print-area">
        {/* KOP SURAT RESMI */}
        <div className="border-b-4 border-double border-slate-900 pb-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center flex-shrink-0">
              {settings.instansi_logo ? (
                <img 
                  src={settings.instansi_logo} 
                  alt="Logo Lembaga" 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <School className="w-12 h-12 text-slate-800" />
              )}
            </div>

            <div className="flex-1 text-center pr-4">
              <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase text-slate-900 leading-tight">
                {settings.instansi_nama || (isUmum ? 'INSTANSI / PERUSAHAAN' : 'YAYASAN PONDOK PESANTREN & SEKOLAH DIGITAL')}
              </h1>
              <p className="text-xs font-semibold text-slate-700 mt-1">
                PresensiRFID - Sistem Absensi Fingerprint & RFID
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Alamat: {settings.instansi_alamat || 'Jl. Kantor Digital No. 01'} • Wilayah: {kotaInstansi}
              </p>
            </div>

            {/* Placeholder kanan agar teks tetap tepat di tengah */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 hidden sm:block flex-shrink-0 opacity-0 pointer-events-none">
              {settings.instansi_logo ? (
                <img src={settings.instansi_logo} alt="" className="max-w-full max-h-full" />
              ) : (
                <div className="w-12 h-12" />
              )}
            </div>
          </div>
        </div>

        {/* HEADER DOKUMEN SESUAI MODE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-700 mb-4 pb-2 border-b border-slate-200">
          <div>
            <p className="font-bold text-sm text-slate-900 uppercase">
              {mode === 'total_akumulasi' 
                ? 'REKAPITULASI JUMLAH TOTAL KEHADIRAN' 
                : 'REKAPITULASI RINCIAN LOG PRESENSI'}
            </p>
            <p className="text-slate-600">
              Periode: {mode === 'total_akumulasi' ? getSelectedMonthsLabel() : (mode === 'bulanan' ? `Bulan ${bulan}` : `Tanggal ${tanggal}`)}
              {selectedKelas && <span className="font-bold"> • Filter: {selectedKelas}</span>}
            </p>
          </div>
          <div className="text-right mt-2 sm:mt-0">
            <p>Dicetak Pada: <span className="font-semibold">{new Date().toLocaleString('id-ID')}</span></p>
            <p>Petugas: <span className="font-semibold">Administrator Absensi</span></p>
          </div>
        </div>

        {/* TABEL 1: JIKA MODE TOTAL AKUMULASI (HANYA JUMLAH TOTAL KEHADIRAN) */}
        {mode === 'total_akumulasi' ? (
          <table className="w-full text-left border-collapse table-print mb-8">
            <thead>
              <tr className="bg-slate-100 text-xs font-bold text-slate-800 border-y border-slate-400">
                <th className="py-2.5 px-3 text-center w-10">No</th>
                <th className="py-2.5 px-3 w-32">{isUmum ? 'NIP / NIK' : (tipe === 'guru' ? 'NIP' : 'NIS')}</th>
                <th className="py-2.5 px-3">Nama Lengkap</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-3">{isUmum ? 'Jabatan / Divisi' : (tipe === 'guru' ? 'Jabatan / Mapel' : 'Kelas / Rombel')}</th>
                <th className="py-2.5 px-3 text-center bg-primary-50/50 text-primary-900 font-bold">Total Hadir</th>
                <th className="py-2.5 px-3 text-center text-emerald-800">Tepat Waktu</th>
                <th className="py-2.5 px-3 text-center text-rose-800">Terlambat</th>
                <th className="py-2.5 px-3 text-center text-amber-800">Izin / Sakit</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-200">
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-400">
                    Tidak ada data {isUmum ? 'pegawai' : 'santri / guru'} untuk filter yang dipilih.
                  </td>
                </tr>
              ) : (
                summaryData.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-2.5 px-3 text-center font-medium text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-medium">{item.nis_nip || '-'}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.nama}</td>
                    <td className="py-2.5 px-3 capitalize">{isUmum ? 'Pegawai' : item.tipe}</td>
                    <td className="py-2.5 px-3">{item.kelas || '-'}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-primary-700 bg-primary-50/30 text-sm">
                      {item.total_hadir} <span className="text-[10px] font-normal text-slate-500">Hari</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-emerald-700 font-mono">{item.total_tepat}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-rose-700 font-mono">{item.total_telat}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-amber-700 font-mono">{item.total_izin_sakit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* TABEL 2: JIKA MODE RINCIAN HARIAN / BULANAN */
          <table className="w-full text-left border-collapse table-print mb-8">
            <thead>
              <tr className="bg-slate-100 text-xs font-bold text-slate-800 border-y border-slate-400">
                <th className="py-2 px-3 text-center w-10">No</th>
                <th className="py-2 px-3">Nama Lengkap</th>
                <th className="py-2 px-3">Tipe</th>
                <th className="py-2 px-3">{isUmum ? 'Jabatan / Divisi' : 'Kelas / Jabatan'}</th>
                <th className="py-2 px-3 text-center">Tgl</th>
                <th className="py-2 px-3 text-center">Masuk</th>
                <th className="py-2 px-3 text-center">Status Masuk</th>
                <th className="py-2 px-3 text-center">Keluar</th>
                <th className="py-2 px-3 text-center">ID Mesin</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-200">
              {data.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-6 text-center text-slate-400">
                    Tidak ada data absensi untuk periode/kategori ini.
                  </td>
                </tr>
              ) : (
                data.map((item, idx) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="py-2 px-3 text-center">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold">{item.nama}</td>
                    <td className="py-2 px-3 capitalize">{isUmum ? 'Pegawai' : item.tipe}</td>
                    <td className="py-2 px-3">{item.kelas || '-'}</td>
                    <td className="py-2 px-3 text-center font-mono">{item.tanggal || '-'}</td>
                    <td className="py-2 px-3 text-center font-mono">{item.waktu_masuk || '-'}</td>
                    <td className="py-2 px-3 text-center capitalize">{item.status_masuk || '-'}</td>
                    <td className="py-2 px-3 text-center font-mono">{item.waktu_keluar || '-'}</td>
                    <td className="py-2 px-3 text-center">{item.id_mesin || 'Mesin 01'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* LEMBAR TANDA TANGAN DENGAN KOTA DINAMIS */}
        <div className="grid grid-cols-2 gap-8 text-xs text-slate-800 pt-6">
          <div className="text-center">
            <p>Mengetahui,</p>
            <p className="font-semibold mb-16">
              {isUmum 
                ? 'Pimpinan / Direktur Instansi' 
                : isPesantren 
                ? 'Pengasuh / Mudir Pesantren' 
                : 'Kepala Sekolah'}
            </p>
            <p className="font-bold underline">( {settings.kepala_nama || (isUmum ? 'Pimpinan Instansi' : 'KH. Ahmad Zaki, Lc., M.Ag')} )</p>
          </div>
          <div className="text-center">
            <p>{kotaInstansi}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="font-semibold mb-16">Petugas Administrator Presensi</p>
            <p className="font-bold underline">( Administrator Absensi )</p>
          </div>
        </div>
      </div>
    </section>
  );
}
