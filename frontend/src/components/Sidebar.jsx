import React from 'react';
import { 
  LayoutDashboard,
  Users, 
  GraduationCap, 
  School,
  Briefcase,
  Printer, 
  Settings, 
  LogOut, 
  Fingerprint,
  CreditCard,
  Send,
  X 
} from 'lucide-react';
import AppLogo from './AppLogo';

export default function Sidebar({ 
  currentTab, 
  setCurrentTab, 
  user = {}, 
  settings = {},
  onLogout, 
  mobileOpen, 
  setMobileOpen 
}) {
  const mode = settings.app_mode || 'pesantren';
  const isUmum = mode === 'umum';
  const isPesantren = mode === 'pesantren';

  const allNavItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: 'Live'
    },
    {
      id: 'santri',
      label: isPesantren ? 'Data Santri' : 'Data Siswa',
      icon: GraduationCap,
      hide: isUmum
    },
    {
      id: 'guru',
      label: isUmum ? 'Data Pegawai' : isPesantren ? 'Data Guru / Asatidz' : 'Data Guru',
      icon: Users
    },
    {
      id: 'fingerprint',
      label: 'Sidik Jari (Fingerprint)',
      icon: Fingerprint,
      badge: 'IoT'
    },
    {
      id: 'cards',
      label: 'Kartu RFID (Mapping)',
      icon: CreditCard,
      badge: 'RFID'
    },
    {
      id: 'telegram',
      label: 'Notifikasi Telegram',
      icon: Send,
      badge: 'Bot'
    },
    {
      id: 'kelas',
      label: 'Master Kelas',
      icon: School,
      hide: isUmum
    },
    {
      id: 'jabatan',
      label: isUmum ? 'Master Jabatan / Divisi' : isPesantren ? 'Master Jabatan' : 'Master Jabatan / Mapel',
      icon: Briefcase
    },
    {
      id: 'cetak',
      label: 'Cetak Rekap PDF',
      icon: Printer
    },
    {
      id: 'pengaturan',
      label: 'Pengaturan Sistem',
      icon: Settings
    }
  ];

  const navItems = allNavItems.filter(item => !item.hide);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`w-72 bg-slate-900 text-white flex flex-col z-40 transition-transform duration-300 ease-in-out md:translate-x-0 fixed md:static inset-y-0 left-0 no-print ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950/70 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <AppLogo className="w-9 h-9 flex-shrink-0" glowing={false} />
            <div className="min-w-0">
              <h1 className="font-bold text-sm tracking-tight text-white leading-tight truncate">PresensiRFID</h1>
              <p className="text-[10px] text-primary-400 font-medium truncate">Fingerprint & RFID</p>
            </div>
          </div>

          <button 
            className="md:hidden text-slate-400 hover:text-white flex-shrink-0" 
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-3 px-3 space-y-1 overflow-y-auto sidebar-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentTab(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-primary-400'
                  }`} />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ml-2 ${
                    isActive 
                      ? 'bg-white/20 text-white' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User Info & Logout */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-primary-400 font-bold text-xs flex-shrink-0">
              {user.username ? user.username.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user.name || 'Administrator'}</p>
              <p className="text-[10px] text-slate-400 truncate">@{user.username || 'admin'}</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Sistem</span>
          </button>
        </div>
      </aside>
    </>
  );
}
