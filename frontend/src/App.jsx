import React, { useState, useEffect } from 'react';
import { getAuthToken, getUserInfo, clearAuth, apiFetch, getApiBaseUrl } from './api';
import Swal from 'sweetalert2';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import MembersView from './views/MembersView';
import FingerprintsView from './views/FingerprintsView';
import CardsView from './views/CardsView';
import ClassesView from './views/ClassesView';
import PositionsView from './views/PositionsView';
import CetakView from './views/CetakView';
import PengaturanView from './views/PengaturanView';
import TelegramView from './views/TelegramView';

const SETTINGS_CACHE_KEY = 'presensi_app_settings';
const MODE_CACHE_KEY = 'presensi_app_mode';

const getInitialSettings = () => {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
    const cachedMode = localStorage.getItem(MODE_CACHE_KEY);
    if (cachedMode) {
      return { app_mode: cachedMode };
    }
  } catch {}
  return {};
};

export default function App() {
  const getTabFromPath = () => {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const validTabs = ['dashboard', 'santri', 'guru', 'fingerprint', 'cards', 'telegram', 'kelas', 'jabatan', 'cetak', 'pengaturan'];
    if (validTabs.includes(rawPath)) {
      const initSettings = getInitialSettings();
      if (initSettings.app_mode === 'umum' && (rawPath === 'santri' || rawPath === 'kelas')) {
        return 'dashboard';
      }
      return rawPath;
    }
    return 'dashboard';
  };

  const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
  const [user, setUser] = useState(getUserInfo());
  const [currentTab, setCurrentTabState] = useState(getTabFromPath());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const setCurrentTab = (tab, updateHistory = true) => {
    setCurrentTabState(tab);
    if (updateHistory) {
      const targetPath = tab === 'dashboard' ? '/dashboard' : `/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    }
  };

  // Sync route on browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const targetTab = getTabFromPath();
      setCurrentTabState(targetTab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [membersCache, setMembersCache] = useState([]);
  const [classesCache, setClassesCache] = useState([]);
  const [positionsCache, setPositionsCache] = useState([]);
  const [settings, setSettings] = useState(getInitialSettings);
  const [realtimeEvent, setRealtimeEvent] = useState(null);

  // Play audio chime on realtime tap
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Load Members Cache
  const loadMembersCache = async () => {
    try {
      const res = await apiFetch('/api/members?tipe=all');
      const data = await res.json();
      setMembersCache(data.data || []);
    } catch {}
  };

  // Load Classes Cache
  const loadClasses = async () => {
    try {
      const res = await apiFetch('/api/classes');
      const data = await res.json();
      setClassesCache(data.data || []);
    } catch {}
  };

  // Load Positions Cache
  const loadPositions = async () => {
    try {
      const res = await apiFetch('/api/positions');
      const data = await res.json();
      setPositionsCache(data.data || []);
    } catch {}
  };

  // Load Settings Cache
  const loadSettings = async () => {
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      const loadedSettings = data.data || {};
      setSettings(loadedSettings);
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(loadedSettings));
        if (loadedSettings.app_mode) {
          localStorage.setItem(MODE_CACHE_KEY, loadedSettings.app_mode);
        }
      } catch {}
      if (loadedSettings.app_mode === 'umum' && (currentTab === 'santri' || currentTab === 'kelas')) {
        setCurrentTab('dashboard');
      }
    } catch {}
  };

  // Switch away from hidden tabs if mode changes to umum
  useEffect(() => {
    if (settings.app_mode === 'umum' && (currentTab === 'santri' || currentTab === 'kelas')) {
      setCurrentTab('dashboard');
    }
  }, [settings.app_mode, currentTab]);

  // Setup SSE and initial data load
  useEffect(() => {
    if (!isAuthenticated) return;

    loadMembersCache();
    loadClasses();
    loadPositions();
    loadSettings();

    const sseUrl = `${getApiBaseUrl()}/api/realtime`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      console.log('⚡ SSE Connected');
    };

    eventSource.addEventListener('attendance_tap', (e) => {
      try {
        const payload = JSON.parse(e.data);
        playChime();
        setRealtimeEvent(payload);

        if (payload.action === 'card_unmapped') {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: '💳 Kartu Baru Terekam',
            text: payload.message || `Kartu #${payload.card_uid} berhasil dicatat ke antrean mapping.`,
            showConfirmButton: false,
            timer: 4500,
            timerProgressBar: true
          });
          return;
        }

        const rec = payload.record || {};
        const isAlready = payload.status === 'already_attended' || payload.already_recorded;

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: isAlready ? 'info' : 'success',
          title: isAlready ? `ℹ️ ${rec.nama || 'Anggota'}` : `🎉 ${rec.nama || 'Anggota'}`,
          text: `${payload.message} (${rec.id_mesin || payload.method || 'Mesin Presensi'})`,
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true
        });
      } catch (err) {
        console.error('SSE Parse Error:', err);
      }
    });

    eventSource.addEventListener('card_event', (e) => {
      try {
        const payload = JSON.parse(e.data);
        playChime();
        loadMembersCache();

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: '💳 Update Kartu RFID',
          text: payload.message || 'Perekaman kartu RFID terdeteksi',
          showConfirmButton: false,
          timer: 4500,
          timerProgressBar: true
        });
      } catch (err) {
        console.error('SSE Card Error:', err);
      }
    });

    eventSource.addEventListener('fingerprint_event', (e) => {
      try {
        const payload = JSON.parse(e.data);
        playChime();
        loadMembersCache();

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: '✨ Perekaman Sidik Jari Sensor',
          text: payload.message || 'Perekaman sidik jari terdeteksi',
          showConfirmButton: false,
          timer: 4500,
          timerProgressBar: true
        });
      } catch (err) {
        console.error('SSE Fingerprint Error:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setUser(getUserInfo());
    const initialTab = getTabFromPath();
    setCurrentTab(initialTab);
  };

  const handleLogout = () => {
    clearAuth();
    setIsAuthenticated(false);
    setUser({});
  };

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} demoMode={settings.demo_mode === 'true' || settings.demo_mode === true} />;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen">
      <Sidebar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        settings={settings}
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      <main id="main-viewport" className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto">
        <Navbar 
          currentTab={currentTab}
          settings={settings}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        <div className="flex-1 flex flex-col">
          {currentTab === 'dashboard' && (
            <DashboardView 
              members={membersCache} 
              classes={classesCache}
              positions={positionsCache}
              settings={settings}
              realtimeEvent={realtimeEvent} 
            />
          )}

          {currentTab === 'santri' && (
            <MembersView 
              tipe="siswa" 
              classes={classesCache}
              positions={positionsCache}
              settings={settings}
              appMode={settings.app_mode || 'pesantren'}
              onMembersUpdated={loadMembersCache} 
            />
          )}

          {currentTab === 'guru' && (
            <MembersView 
              tipe="guru" 
              classes={classesCache}
              positions={positionsCache}
              settings={settings}
              appMode={settings.app_mode || 'pesantren'}
              onMembersUpdated={loadMembersCache} 
            />
          )}

          {currentTab === 'fingerprint' && (
            <FingerprintsView 
              members={membersCache}
              settings={settings}
              appMode={settings.app_mode || 'pesantren'}
              onUpdated={loadMembersCache}
            />
          )}

          {currentTab === 'cards' && (
            <CardsView 
              members={membersCache}
              settings={settings}
              appMode={settings.app_mode || 'pesantren'}
              onUpdated={() => {
                loadMembersCache();
                loadSettings();
              }}
            />
          )}

          {currentTab === 'telegram' && (
            <TelegramView 
              settings={settings}
              appMode={settings.app_mode || 'pesantren'}
              onSettingsUpdated={loadSettings}
            />
          )}

          {currentTab === 'kelas' && (
            <ClassesView 
              settings={settings}
              onUpdated={() => {
                loadClasses();
                loadMembersCache();
              }} 
            />
          )}

          {currentTab === 'jabatan' && (
            <PositionsView 
              settings={settings}
              onUpdated={() => {
                loadPositions();
                loadMembersCache();
              }} 
            />
          )}

          {currentTab === 'cetak' && (
            <CetakView 
              settings={settings} 
              classes={classesCache}
              positions={positionsCache}
            />
          )}

          {currentTab === 'pengaturan' && (
            <PengaturanView 
              settings={settings} 
              onSettingsUpdated={() => {
                loadSettings();
                loadMembersCache();
                loadClasses();
                loadPositions();
              }} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
