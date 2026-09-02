import React, { useState, useEffect } from 'react';
import { getAuthToken, getUserInfo, clearAuth, apiFetch, getApiBaseUrl } from './api';
import Swal from 'sweetalert2';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginView from './views/LoginView';
import LaporanView from './views/LaporanView';
import MembersView from './views/MembersView';
import CetakView from './views/CetakView';
import PengaturanView from './views/PengaturanView';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
  const [user, setUser] = useState(getUserInfo());
  const [currentTab, setCurrentTab] = useState('laporan');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [membersCache, setMembersCache] = useState([]);
  const [settings, setSettings] = useState({});
  const [realtimeEvent, setRealtimeEvent] = useState(null);

  // Play audio chime on realtime event
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

  // Fetch Members Cache
  const loadMembersCache = async () => {
    try {
      const res = await apiFetch('/api/members?tipe=all');
      const data = await res.json();
      setMembersCache(data.data || []);
    } catch {}
  };

  // Fetch Settings
  const loadSettings = async () => {
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      setSettings(data.data || {});
    } catch {}
  };

  // Setup SSE
  useEffect(() => {
    if (!isAuthenticated) return;

    loadMembersCache();
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

        const rec = payload.record || {};
        const isAlready = payload.status === 'already_attended' || payload.already_recorded;

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: isAlready ? 'info' : 'success',
          title: isAlready ? `ℹ️ ${rec.nama || 'Anggota'}` : `🎉 ${rec.nama || 'Anggota'}`,
          text: `${payload.message} (${rec.id_mesin || 'ESP32'})`,
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true
        });
      } catch (err) {
        console.error('SSE Parse Error:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setUser(getUserInfo());
    setCurrentTab('laporan');
  };

  const handleLogout = () => {
    clearAuth();
    setIsAuthenticated(false);
    setUser({});
  };

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen">
      <Sidebar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      <main id="main-viewport" className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto">
        <Navbar 
          currentTab={currentTab}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        <div className="flex-1 flex flex-col">
          {currentTab === 'laporan' && (
            <LaporanView 
              members={membersCache} 
              realtimeEvent={realtimeEvent} 
            />
          )}

          {currentTab === 'santri' && (
            <MembersView 
              tipe="siswa" 
              onMembersUpdated={loadMembersCache} 
            />
          )}

          {currentTab === 'guru' && (
            <MembersView 
              tipe="guru" 
              onMembersUpdated={loadMembersCache} 
            />
          )}

          {currentTab === 'cetak' && (
            <CetakView 
              settings={settings} 
            />
          )}

          {currentTab === 'pengaturan' && (
            <PengaturanView 
              settings={settings} 
              onSettingsUpdated={() => {
                loadSettings();
                loadMembersCache();
              }} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
