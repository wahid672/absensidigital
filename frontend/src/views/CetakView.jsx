import React, { useState, useEffect } from 'react';
import { Printer, School } from 'lucide-react';
import { apiFetch } from '../api';

export default function CetakView({ settings = {} }) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  const [mode, setMode] = useState('harian');
  const [tanggal, setTanggal] = useState(today);
  const [bulan, setBulan] = useState(currentMonth);
  const [tipe, setTipe] = useState('all');

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    let url = `/api/attendance?tipe=${tipe}`;
    if (mode === 'bulanan') {
      url += `&bulan=${bulan}`;
    } else {
      url += `&tanggal=${tanggal}`;
    }

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

  useEffect(() => {
    loadData();
  }, [mode, tanggal, bulan, tipe]);

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl w-full mx-auto">
      {/* FILTER CONTROL (Hidden on print) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm no-print space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Cetak Rekap Laporan Absensi (PDF / Print)</h3>
            <p className="text-xs text-slate-500">Pilih periode dan format laporan yang akan dicetak atau diunduh sebagai PDF</p>
          </div>
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan ke PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mode Laporan</label>
            <select 
              value={mode} 
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="harian">Laporan Harian (Per Tanggal)</option>
              <option value="bulanan">Laporan Rekap Bulanan</option>
            </select>
          </div>

          {mode === 'harian' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Tanggal</label>
              <input 
                type="date" 
                value={tanggal} 
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Bulan</label>
              <input 
                type="month" 
                value={bulan} 
                onChange={(e) => setBulan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Kategori Pengguna</label>
            <select 
              value={tipe} 
              onChange={(e) => setTipe(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Semua (Santri & Guru)</option>
              <option value="siswa">Khusus Santri / Siswa</option>
              <option value="guru">Khusus Guru / Ustadz</option>
            </select>
          </div>
        </div>
      </div>

      {/* LEMBAR PRINT / PDF PREVIEW */}
      <div className="bg-white p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm print-area">
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center justify-center gap-3 mb-1">
            <School className="w-8 h-8 text-slate-900" />
            <div>
              <h1 className="text-xl font-bold tracking-wide uppercase text-slate-900">
                {settings.instansi_nama || 'YAYASAN PONDOK PESANTREN DIGITAL'}
              </h1>
              <p className="text-xs text-slate-600">Sistem Presensi & Kehadiran Otomatis Berbasis IoT ESP32</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            Alamat: {settings.instansi_alamat || 'Jl. Pesantren Digital No. 01'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-700 mb-4 pb-2 border-b border-slate-200">
          <div>
            <p className="font-bold text-sm text-slate-900">REKAPITULASI LAPORAN KEHADIRAN</p>
            <p className="text-slate-600">
              Periode: {mode === 'bulanan' ? `Rekapitulasi Bulan ${bulan}` : `Tanggal ${tanggal}`}
            </p>
          </div>
          <div className="text-right mt-2 sm:mt-0">
            <p>Dicetak Pada: <span className="font-semibold">{new Date().toLocaleString('id-ID')}</span></p>
            <p>Petugas: <span className="font-semibold">Administrator Absensi</span></p>
          </div>
        </div>

        <table className="w-full text-left border-collapse table-print mb-8">
          <thead>
            <tr className="bg-slate-100 text-xs font-bold text-slate-800 border-y border-slate-400">
              <th className="py-2 px-3 text-center w-10">No</th>
              <th className="py-2 px-3">Nama Lengkap</th>
              <th className="py-2 px-3">Tipe</th>
              <th className="py-2 px-3">Kelas / Jabatan</th>
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
                  Tidak ada data absensi untuk periode ini.
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="py-2 px-3 text-center">{idx + 1}</td>
                  <td className="py-2 px-3 font-semibold">{item.nama}</td>
                  <td className="py-2 px-3 capitalize">{item.tipe}</td>
                  <td className="py-2 px-3">{item.kelas || '-'}</td>
                  <td className="py-2 px-3 text-center font-mono">{item.tanggal || '-'}</td>
                  <td className="py-2 px-3 text-center font-mono">{item.waktu_masuk || '-'}</td>
                  <td className="py-2 px-3 text-center capitalize">{item.status_masuk || '-'}</td>
                  <td className="py-2 px-3 text-center font-mono">{item.waktu_keluar || '-'}</td>
                  <td className="py-2 px-3 text-center">{item.id_mesin || 'ESP32'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 text-xs text-slate-800 pt-6">
          <div className="text-center">
            <p>Mengetahui,</p>
            <p className="font-semibold mb-16">Pengasuh / Kepala Sekolah</p>
            <p className="font-bold underline">( {settings.kepala_nama || 'KH. Ahmad Zaki, Lc., M.Ag'} )</p>
          </div>
          <div className="text-center">
            <p>Kota Santri, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="font-semibold mb-16">Petugas Administrator Presensi</p>
            <p className="font-bold underline">( Administrator Absensi )</p>
          </div>
        </div>
      </div>
    </section>
  );
}
