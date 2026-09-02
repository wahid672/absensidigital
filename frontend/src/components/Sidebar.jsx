import React from 'react';
import { 
  Fingerprint, 
  ClipboardList, 
  GraduationCap, 
  Printer, 
  Settings, 
  LogOut, 
  UserCheck, 
  X 
} from 'lucide-react';
import Swal from 'sweetalert2';

export default function Sidebar({ 
  currentTab, 
  setCurrentTab, 
  user, 
  onLogout, 
  mobileOpen, 
  setMobileOpen 
}) {
  const handleLogoutConfirm = () => {
    Swal.fire({
      title: 'Konfirmasi Keluar',
      text: 'Apakah Anda yakin ingin keluar dari Web Admin?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Keluar',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) {
        onLogout();
      }
    });
  };

  const navItems = [
    { id: 'laporan', label: 'Laporan Absensi', icon: ClipboardList, section: 'Menu Utama' },
    { id: 'santri', label: 'Data Santri / Siswa', icon: GraduationCap, section: 'Data Master' },
    { id: 'guru', label: 'Data Guru / Ustadz', icon: UserCheck, section: null },
    { id: 'cetak', label: 'Cetak Rekap PDF', icon: Printer, section: 'Dokumen & Sistem' },
    { id: 'pengaturan', label: 'Pengaturan Sistem', icon: Settings, section: null }
  ];

  return (
    <aside className={`
      ${mobileOpen ? 'block' : 'hidden'} md:flex
      w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex-col border-r border-slate-800 transition-all z-20
    `}>
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold shadow-md shadow-primary-600/30">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-white tracking-wide text-sm block">ABSENSI IOT</span>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Realtime
            </span>
          </div>
        </div>
        <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setMobileOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.section && (
                <div className={`px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${idx > 0 ? 'pt-4' : ''}`}>
                  {item.section}
                </div>
              )}
              <button
                onClick={() => {
                  setCurrentTab(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left font-medium transition-all ${
                  isActive 
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30' 
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary-400' : 'text-slate-400'}`} />
                <span className="text-xs">{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-primary-400 font-bold text-sm">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.name || user?.username || 'Administrator'}</p>
            <p className="text-[10px] text-slate-400 truncate">Admin Absensi Ponpes</p>
          </div>
        </div>
        <button 
          onClick={handleLogoutConfirm}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar (Logout)</span>
        </button>
      </div>
    </aside>
  );
}
