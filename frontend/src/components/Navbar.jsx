import React, { useState, useEffect } from 'react';
import { Menu, Clock, Radio } from 'lucide-react';

export default function Navbar({ currentTab, onOpenMobileSidebar }) {
  const [timeStr, setTimeStr] = useState('00:00:00 WIB');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const titles = {
    laporan: { title: 'Laporan & Rekapitulasi Absensi', desc: 'Pemantauan data kehadiran santri dan guru secara realtime' },
    santri: { title: 'Data Santri / Siswa', desc: 'Kelola database kartu RFID dan data siswa' },
    guru: { title: 'Data Guru / Asatidz', desc: 'Kelola database kartu RFID dan staf pengajar' },
    cetak: { title: 'Cetak Rekap Laporan', desc: 'Pratinjau cetak dan ekspor laporan ke format PDF resmi' },
    pengaturan: { title: 'Pengaturan Sistem', desc: 'Kelola data contoh dummy, reset database, dan konfigurasi instansi' }
  };

  const info = titles[currentTab] || titles.laporan;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-10 no-print">
      <div className="flex items-center gap-3">
        <button 
          className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100" 
          onClick={onOpenMobileSidebar}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">{info.title}</h2>
          <p className="text-xs text-slate-500 hidden sm:block">{info.desc}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>SSE Live Active</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
          <Clock className="w-3.5 h-3.5 text-primary-600" />
          <span>{timeStr}</span>
        </div>
      </div>
    </header>
  );
}
