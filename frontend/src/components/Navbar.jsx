import React, { useState, useEffect } from 'react';
import { Menu, Clock } from 'lucide-react';

export default function Navbar({ currentTab, settings = {}, onOpenMobileSidebar }) {
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

  const mode = settings.app_mode || 'pesantren';
  const isUmum = mode === 'umum';
  const isPesantren = mode === 'pesantren';

  const titles = {
    dashboard: { 
      title: 'Dashboard & Statistik Presensi', 
      desc: isUmum
        ? 'Pemantauan kehadiran pegawai dan grafik visual secara realtime'
        : isPesantren 
        ? 'Pemantauan kehadiran santri, asatidz/guru, dan grafik visual secara realtime' 
        : 'Pemantauan kehadiran siswa, guru, dan grafik visual secara realtime' 
    },
    santri: { 
      title: isPesantren ? 'Data Santri' : 'Data Siswa', 
      desc: isPesantren ? 'Kelola database kartu RFID, NIS, dan kontak santri' : 'Kelola database kartu RFID, NIS, dan kontak siswa' 
    },
    guru: { 
      title: isUmum ? 'Data Pegawai' : isPesantren ? 'Data Guru / Asatidz' : 'Data Guru / Pendidik', 
      desc: isUmum 
        ? 'Kelola database kartu RFID, NIP/NIK, jabatan, dan staf pegawai'
        : 'Kelola database kartu RFID, NIP, jabatan, dan staf pengajar' 
    },
    fingerprint: {
      title: 'Perekaman Sidik Jari (Fingerprint)',
      desc: isUmum
        ? 'Kelola slot sidik jari yang terekam dari mesin dan hubungkan ke pegawai'
        : isPesantren
        ? 'Kelola slot sidik jari yang terekam dari mesin dan hubungkan ke santri / asatidz'
        : 'Kelola slot sidik jari yang terekam dari mesin dan hubungkan ke siswa / guru'
    },
    telegram: {
      title: 'Notifikasi Telegram',
      desc: isUmum
        ? 'Konfigurasi Bot Telegram, template pesan, dan manajemen Chat ID Pegawai'
        : isPesantren
        ? 'Konfigurasi Bot Telegram, template pesan, dan manajemen Chat ID Wali Santri & Asatidz'
        : 'Konfigurasi Bot Telegram, template pesan, dan manajemen Chat ID Wali Siswa & Guru'
    },
    kelas: { 
      title: 'Master Data Kelas & Rombel', 
      desc: 'Kelola daftar kelas dan jenjang tingkatan' 
    },
    jabatan: { 
      title: isUmum ? 'Master Data Jabatan & Divisi' : 'Master Data Jabatan & Mapel', 
      desc: isUmum 
        ? 'Kelola daftar jabatan, divisi, dan penugasan pegawai'
        : 'Kelola daftar jabatan, mata pelajaran, dan tugas pengampu guru' 
    },
    cetak: { 
      title: 'Cetak Rekap Laporan PDF', 
      desc: 'Pratinjau cetak dan ekspor laporan ke format PDF resmi' 
    },
    pengaturan: { 
      title: 'Pengaturan Sistem & Instansi', 
      desc: 'Kelola mode instansi (Umum/Pesantren/Sekolah), profil, dan kartu presensi' 
    }
  };

  const info = titles[currentTab] || titles.dashboard;

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
        {settings.demo_mode === 'true' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold border border-amber-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Versi Demo (Read-Only)</span>
          </div>
        )}

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
