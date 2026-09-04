import React, { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, Loader2, Database } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch, setAuth } from '../api';
import AppLogo from '../components/AppLogo';

export default function LoginView({ onLoginSuccess, demoMode = null }) {
  const [isDemo, setIsDemo] = useState(demoMode === true);
  const [username, setUsername] = useState(demoMode ? 'admin' : '');
  const [password, setPassword] = useState(demoMode ? 'admin123' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        const demoActive = data.demo_mode === true || data.demo_mode === 'true';
        setIsDemo(demoActive);
        if (demoActive) {
          setUsername(prev => prev || 'admin');
          setPassword(prev => prev || 'admin123');
        } else {
          setUsername('');
          setPassword('');
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.token) {
        setAuth(data.token, data.user || { username });

        Swal.fire({
          icon: 'success',
          title: 'Login Berhasil!',
          text: 'Selamat datang di PresensiRFID',
          timer: 1500,
          showConfirmButton: false
        });

        onLoginSuccess();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Login Gagal',
          text: data.message || 'Username atau password salah.',
          confirmButtonColor: '#0284c7'
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Koneksi Gagal',
        text: 'Tidak dapat terhubung ke server backend.',
        confirmButtonColor: '#0284c7'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden flex-1">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <AppLogo className="w-20 h-20 mb-3" glowing={true} />
          <h1 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            PresensiRFID
          </h1>
          <p className="text-slate-400 text-xs mt-1 font-medium">Sistem Absensi Fingerprint & RFID</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">Masuk ke Web Admin</h2>
            <p className="text-sm text-slate-500 mt-1">Gunakan akun administrator untuk mengelola sistem.</p>
          </div>

          {isDemo && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="font-bold">Mode Demo Aktif</span>
              </div>
              <span className="text-[11px] text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded font-mono font-semibold">admin / admin123</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  placeholder={isDemo ? "admin" : ""} 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  placeholder={isDemo ? "••••••••" : ""} 
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium rounded-xl shadow-lg shadow-primary-600/30 transition-all duration-150 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Masuk ke Dashboard</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Database className="w-4 h-4 text-emerald-500" />
            <span>Database Terintegrasi & Aman</span>
          </div>
        </div>
      </div>
    </section>
  );
}
