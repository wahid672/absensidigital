import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Settings, 
  Users, 
  Key, 
  Copy, 
  Check, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  ArrowLeft, 
  Edit3, 
  Search, 
  Eye, 
  EyeOff, 
  Save, 
  RotateCcw,
  Sparkles,
  Info,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function TelegramView({ settings = {}, onSettingsUpdated, appMode = 'pesantren' }) {
  const isPesantren = appMode !== 'umum';

  // Sub-view navigation: 'main' | 'template' | 'chat_id'
  const [subView, setSubView] = useState('main');

  // Telegram Config State
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [botStatus, setBotStatus] = useState({ isValid: false, botInfo: '', loading: false });
  const [notifyIn, setNotifyIn] = useState(true);
  const [notifyOut, setNotifyOut] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);

  // Template State
  const [templateIn, setTemplateIn] = useState('');
  const [templateOut, setTemplateOut] = useState('');
  const [templateLate, setTemplateLate] = useState('');
  const [activeTemplateTab, setActiveTemplateTab] = useState('in');

  // Chat ID Management State
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberTypeTab, setMemberTypeTab] = useState('siswa'); // 'siswa' (Wali Santri) | 'guru' (Pegawai)
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Edit Chat ID Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editNamaOrtu, setEditNamaOrtu] = useState('');
  const [editChatID, setEditChatID] = useState('');
  const [savingChatID, setSavingChatID] = useState(false);

  // Test Send Message Modal State (matching Screenshot 3)
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testTargetChatID, setTestTargetChatID] = useState('');
  const [testTargetNama, setTestTargetNama] = useState('');
  const [testMessageText, setTestMessageText] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Fetch Telegram Config
  const loadTelegramStatus = async () => {
    try {
      setBotStatus(prev => ({ ...prev, loading: true }));
      const res = await apiFetch('/api/telegram/status');
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        const d = json.data;
        setBotToken(d.bot_token || '');
        setTelegramEnabled(d.enabled !== false);
        setNotifyIn(d.notify_in !== false);
        setNotifyOut(d.notify_out !== false);
        setTemplateIn(d.template_in || '');
        setTemplateOut(d.template_out || '');
        setTemplateLate(d.template_late || '');
        setBotStatus({
          isValid: !!d.is_valid,
          botInfo: d.bot_info || '',
          loading: false
        });
      }
    } catch (err) {
      console.error(err);
      setBotStatus(prev => ({ ...prev, loading: false }));
    }
  };

  // Fetch Members for Chat ID table
  const loadMembers = async () => {
    try {
      setLoadingMembers(true);
      const res = await apiFetch('/api/members?tipe=all');
      const json = await res.json();
      if (json.status === 'success') {
        setMembers(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadTelegramStatus();
    loadMembers();
  }, []);

  // Copy Bot Token to Clipboard
  const handleCopyToken = () => {
    if (!botToken) return;
    navigator.clipboard.writeText(botToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Bot Token disalin ke clipboard!',
      showConfirmButton: false,
      timer: 2000
    });
  };

  // Test Bot Token with @BotFather
  const handleTestBot = async () => {
    if (!botToken.trim()) {
      Swal.fire('Perhatian', 'Silakan isi Bot Token terlebih dahulu.', 'warning');
      return;
    }
    setBotStatus(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch('/api/telegram/test-bot', {
        method: 'POST',
        body: JSON.stringify({ bot_token: botToken.trim() })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setBotStatus({
          isValid: true,
          botInfo: json.bot_info || 'Bot Aktif',
          loading: false
        });
        Swal.fire({
          icon: 'success',
          title: 'Bot Aktif & Terhubung!',
          html: `<b>${json.bot_info}</b><br><p class="text-sm text-slate-400 mt-2">Koneksi ke server Telegram Bot API berhasil.</p>`,
          confirmButtonColor: '#2563eb'
        });
      } else {
        setBotStatus({
          isValid: false,
          botInfo: '',
          loading: false
        });
        Swal.fire('Koneksi Gagal', json.message || 'Bot Token tidak valid.', 'error');
      }
    } catch (err) {
      setBotStatus(prev => ({ ...prev, loading: false }));
      Swal.fire('Error', 'Gagal menghubungi server backend.', 'error');
    }
  };

  // Save Bot Token Settings
  const handleSaveBotSettings = async () => {
    try {
      const res = await apiFetch('/api/telegram/settings', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken.trim(),
          enabled: telegramEnabled,
          notify_in: notifyIn,
          notify_out: notifyOut,
          template_in: templateIn,
          template_out: templateOut,
          template_late: templateLate
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Pengaturan Bot berhasil disimpan!',
          showConfirmButton: false,
          timer: 2500
        });
        loadTelegramStatus();
        if (onSettingsUpdated) onSettingsUpdated();
      } else {
        Swal.fire('Gagal', json.message || 'Gagal menyimpan pengaturan', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan pengaturan ke server.', 'error');
    }
  };

  // Save Templates
  const handleSaveTemplates = async () => {
    try {
      const res = await apiFetch('/api/telegram/settings', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken.trim(),
          enabled: telegramEnabled,
          notify_in: notifyIn,
          notify_out: notifyOut,
          template_in: templateIn,
          template_out: templateOut,
          template_late: templateLate
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil!',
          text: 'Template pesan notifikasi Telegram berhasil disimpan.',
          timer: 2000,
          showConfirmButton: false
        });
        loadTelegramStatus();
      } else {
        Swal.fire('Gagal', json.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Terjadi kesalahan saat menyimpan template.', 'error');
    }
  };

  // Reset Templates to Default
  const handleResetTemplates = () => {
    Swal.fire({
      title: 'Reset Template ke Default?',
      text: 'Semua kustomisasi template pesan masuk dan pulang akan dikembalikan ke teks standar bawaan.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Reset',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb'
    }).then((result) => {
      if (result.isConfirmed) {
        setTemplateIn("🔔 *NOTIFIKASI PRESENSI MASUK*\nAssalamu'alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nAlhamdulillah, santri telah tiba dan melakukan absensi masuk:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nTerima kasih.\n_{instansi}_");
        setTemplateOut("🔔 *NOTIFIKASI PRESENSI PULANG*\nAssalamu'alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nSantri telah melakukan absensi pulang:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nTerima kasih.\n_{instansi}_");
        setTemplateLate("⚠️ *PERINGATAN KETERLAMBATAN*\nAssalamu'alaikum Wr. Wb.\nYth. Orang Tua/Wali dari *{nama}*\n\nSantri tercatat terlambat melakukan absensi:\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📌 Status: {status}\n\nMohon perhatiannya. Terima kasih.\n_{instansi}_");
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'Template di-reset. Jangan lupa klik Simpan!',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  };

  // Insert tag helper at cursor
  const insertTag = (tag) => {
    if (activeTemplateTab === 'in') {
      setTemplateIn(prev => prev + ' ' + tag);
    } else if (activeTemplateTab === 'out') {
      setTemplateOut(prev => prev + ' ' + tag);
    } else {
      setTemplateLate(prev => prev + ' ' + tag);
    }
  };

  // Open Edit Chat ID Modal
  const openEditModal = (m) => {
    setSelectedMember(m);
    setEditNamaOrtu(m.nama_ortu || '');
    setEditChatID(m.telegram_chat_id || '');
    setEditModalOpen(true);
  };

  // Save Single Member Chat ID
  const handleSaveMemberChatID = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;
    setSavingChatID(true);
    try {
      const res = await apiFetch('/api/members/chat-id', {
        method: 'PUT',
        body: JSON.stringify({
          id: selectedMember.id,
          nama_ortu: editNamaOrtu.trim(),
          telegram_chat_id: editChatID.trim()
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Chat ID berhasil disimpan!',
          showConfirmButton: false,
          timer: 2000
        });
        setEditModalOpen(false);
        loadMembers();
      } else {
        Swal.fire('Gagal', json.message || 'Gagal menyimpan', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan ke database.', 'error');
    } finally {
      setSavingChatID(false);
    }
  };

  // Open Test Send Message Modal (Screenshot 3)
  const openTestModal = (targetChatID = '', targetNama = '') => {
    setTestTargetChatID(targetChatID);
    setTestTargetNama(targetNama);
    setTestMessageText(
      `🔔 *TES NOTIFIKASI TELEGRAM*\nAssalamu'alaikum Wr. Wb.\nYth. ${targetNama ? `Wali dari *${targetNama}*` : 'Pengguna'}\n\nIni adalah pesan uji coba (test) notifikasi absensi dari sistem ${settings.instansi_nama || 'SIAKAD ABSENSI'}.\n\nStatus: *Berhasil Terhubung! ✅*`
    );
    setTestModalOpen(true);
  };

  // Send Test Message via Telegram Bot API
  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    if (!testTargetChatID.trim()) {
      Swal.fire('Perhatian', 'Chat ID Tujuan wajib diisi.', 'warning');
      return;
    }
    if (!testMessageText.trim()) {
      Swal.fire('Perhatian', 'Isi pesan test tidak boleh kosong.', 'warning');
      return;
    }

    setSendingTest(true);
    try {
      const res = await apiFetch('/api/telegram/send-test', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken.trim(),
          chat_id: testTargetChatID.trim(),
          pesan: testMessageText.trim()
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setTestModalOpen(false);
        Swal.fire({
          icon: 'success',
          title: 'Pesan Berhasil Terkirim! ✈️',
          html: `<p class="text-sm text-slate-300">Pesan notifikasi berhasil dikirim ke Chat ID: <b>${testTargetChatID}</b>.</p>`,
          confirmButtonColor: '#2563eb'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal Kirim Pesan',
          text: json.message || 'Pastikan pengguna sudah menekan tombol START di bot Telegram.',
          confirmButtonColor: '#ef4444'
        });
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal mengirim pesan test ke Telegram.', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  // Filter Members for Table
  const filteredMembers = members.filter(m => {
    const matchType = (m.tipe || 'siswa').toLowerCase() === memberTypeTab;
    if (!matchType) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.nama && m.nama.toLowerCase().includes(q)) ||
      (m.nis_nip && m.nis_nip.toLowerCase().includes(q)) ||
      (m.kelas && m.kelas.toLowerCase().includes(q)) ||
      (m.nama_ortu && m.nama_ortu.toLowerCase().includes(q)) ||
      (m.telegram_chat_id && m.telegram_chat_id.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Variable tags helper
  const availableTags = [
    { tag: '{nama}', desc: 'Nama Santri/Guru' },
    { tag: '{nis}', desc: 'NIS/NIP' },
    { tag: '{tipe}', desc: 'Siswa / Guru' },
    { tag: '{kelas}', desc: 'Kelas / Jabatan' },
    { tag: '{tanggal}', desc: 'Tgl (YYYY-MM-DD)' },
    { tag: '{waktu}', desc: 'Jam (HH:MM:SS)' },
    { tag: '{status}', desc: 'Tepat / Terlambat' },
    { tag: '{instansi}', desc: 'Nama Pondok/Sekolah' },
    { tag: '{nama_ortu}', desc: 'Nama Wali/Ortu' }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">

      {/* ========================================================================= */}
      {/* 1. MAIN TELEGRAM VIEW (MATCHING SCREENSHOT 1) */}
      {/* ========================================================================= */}
      {subView === 'main' && (
        <>
          {/* Header Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-3">
                <Send className="w-7 h-7 text-primary-400" />
                Telegram
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Konfigurasi Bot Telegram Resmi untuk Notifikasi Presensi Otomatis ke Wali Santri & Asatidz
              </p>
            </div>

            {/* Quick Test Message Button */}
            <button
              onClick={() => openTestModal('', '')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm self-start sm:self-auto"
            >
              <Send className="w-4 h-4 text-sky-400" />
              <span>Test Kirim Pesan Bebas</span>
            </button>
          </div>

          {/* Blue Info Box: Cara Menggunakan Fitur (Matches Screenshot 1) */}
          <div className="bg-sky-950/40 border border-sky-800/60 rounded-2xl p-5 text-sky-100 shadow-md">
            <h3 className="font-bold text-sm text-sky-300 flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-sky-400" />
              Cara Menggunakan Fitur:
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-sky-200/90 leading-relaxed pl-1">
              <li>Pastikan <b>Bot Token</b> sudah diisi dan status API <b>Aktif</b>.</li>
              <li>User/Penerima pesan harus membuka bot Telegram yang telah dibuat.</li>
              <li>Klik tombol <b>'START'</b> atau kirim pesan <b>'/start'</b> pada bot tersebut.</li>
              <li>Hal ini diperlukan agar sistem dapat mengirimkan notifikasi melalui Telegram.</li>
              <li>Setiap pesan notifikasi absensi akan otomatis dikirimkan saat santri/pegawai tap kartu RFID atau sidik jari di mesin ESP32.</li>
            </ol>
          </div>

          {/* Navigation Action Buttons (Matches Screenshot 1: Red & Blue Buttons) */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setSubView('template')}
              className="px-5 py-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-2.5 transition shadow-lg shadow-rose-900/30 hover:scale-[1.02] active:scale-95"
            >
              <Settings className="w-4 h-4" />
              <span>Setting Template Pesan</span>
            </button>

            <button
              onClick={() => setSubView('chat_id')}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold flex items-center gap-2.5 transition shadow-lg shadow-primary-900/30 hover:scale-[1.02] active:scale-95"
            >
              <Users className="w-4 h-4" />
              <span>Manajemen Chat ID Telegram</span>
            </button>
          </div>

          {/* Card: Default / Bot Token Settings (Matches Screenshot 1) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-primary-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Default</h2>
                  <p className="text-[11px] text-slate-400">Pengaturan Kunci API Bot Telegram Utama</p>
                </div>
              </div>

              {botStatus.botInfo && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{botStatus.botInfo}</span>
                </div>
              )}
            </div>

            {/* Input Bot Token */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                TELEGRAM BOT TOKEN
              </label>
              
              <div className="relative flex items-center">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Contoh: 8668444866:AAE4IhFH4BIMd1kXTqHRPFQELsfk5upcDFo"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 pr-24"
                />

                <div className="absolute right-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? 'Sembunyikan' : 'Tampilkan'}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyToken}
                    title="Salin Token"
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  >
                    {tokenCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Token API yang didapatkan dari @BotFather. Setiap unit/instansi dapat memakai bot yang terdaftar.
              </p>
            </div>

            {/* Blue Info Box: Cara Mendapatkan Bot Token (Matches Screenshot 1) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
              <h4 className="font-bold text-sky-400 flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                Cara Mendapatkan Bot Token:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                <li>Buka aplikasi Telegram dan cari <b className="text-white">@BotFather</b>.</li>
                <li>Kirim perintah <code className="text-sky-300 bg-slate-900 px-1.5 py-0.5 rounded">/newbot</code> dan ikuti instruksi untuk mengatur nama dan username bot Anda.</li>
                <li>Salin <b>API Token</b> yang diberikan oleh @BotFather dan tempelkan pada kolom di atas.</li>
              </ol>
            </div>

            {/* Notification Trigger Checkboxes */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Pemicu Notifikasi Otomatis:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={notifyIn}
                    onChange={(e) => setNotifyIn(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 bg-slate-900 border-slate-700 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-white">Notifikasi Presensi Masuk</p>
                    <p className="text-[10px] text-slate-400">Kirim pesan otomatis saat santri/pegawai tap masuk</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={notifyOut}
                    onChange={(e) => setNotifyOut(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 bg-slate-900 border-slate-700 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-white">Notifikasi Presensi Pulang</p>
                    <p className="text-[10px] text-slate-400">Kirim pesan otomatis saat santri/pegawai tap pulang</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons: Save & Verify */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveBotSettings}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-900/30 hover:scale-[1.02] active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Simpan</span>
              </button>

              <button
                type="button"
                onClick={handleTestBot}
                disabled={botStatus.loading}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-sky-400 ${botStatus.loading ? 'animate-spin' : ''}`} />
                <span>{botStatus.loading ? 'Memeriksa...' : 'Cek Status Bot'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. SETTING TEMPLATE PESAN VIEW */}
      {/* ========================================================================= */}
      {subView === 'template' && (
        <>
          {/* Header & Back Button */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span>Home</span>
                <span>/</span>
                <span className="text-rose-400">Setting Template Pesan</span>
              </div>
              <h1 className="text-2xl font-black text-white flex items-center gap-3">
                <Settings className="w-7 h-7 text-rose-500" />
                Setting Template Pesan Telegram
              </h1>
            </div>

            <button
              onClick={() => setSubView('main')}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali</span>
            </button>
          </div>

          {/* Dynamic Variable Helper Badges */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Tag Variabel Dinamis (Klik untuk Menambahkan ke Template):
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertTag(item.tag)}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-primary-950/60 border border-slate-800 hover:border-primary-500/50 rounded-lg text-xs font-mono text-primary-300 flex items-center gap-1.5 transition group"
                >
                  <span className="font-bold">{item.tag}</span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-400">({item.desc})</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Format teks mendukung Markdown Telegram: <code className="text-white">*tebal*</code>, <code className="text-white">_miring_</code>, <code className="text-white">`kode`</code>.
            </p>
          </div>

          {/* Template Tabs: Masuk | Pulang | Terlambat */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTemplateTab('in')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateTab === 'in'
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🔔 Template Presensi Masuk</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplateTab('out')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateTab === 'out'
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🚪 Template Presensi Pulang</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplateTab('late')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateTab === 'late'
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>⚠️ Template Terlambat</span>
              </button>
            </div>

            {/* Active Template Editor & Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Textarea Editor */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  {activeTemplateTab === 'in' && 'Format Pesan Presensi Masuk:'}
                  {activeTemplateTab === 'out' && 'Format Pesan Presensi Pulang:'}
                  {activeTemplateTab === 'late' && 'Format Pesan Khusus Santri Terlambat:'}
                </label>

                {activeTemplateTab === 'in' && (
                  <textarea
                    rows={10}
                    value={templateIn}
                    onChange={(e) => setTemplateIn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 leading-relaxed"
                  />
                )}

                {activeTemplateTab === 'out' && (
                  <textarea
                    rows={10}
                    value={templateOut}
                    onChange={(e) => setTemplateOut(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 leading-relaxed"
                  />
                )}

                {activeTemplateTab === 'late' && (
                  <textarea
                    rows={10}
                    value={templateLate}
                    onChange={(e) => setTemplateLate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 leading-relaxed"
                  />
                )}
              </div>

              {/* Live Telegram Preview */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  Live Preview Pesan Telegram:
                </label>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 min-h-[220px] flex flex-col justify-between">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans shadow-inner border-l-4 border-l-sky-500">
                    {(() => {
                      let raw = activeTemplateTab === 'in' ? templateIn : activeTemplateTab === 'out' ? templateOut : templateLate;
                      return (raw || '')
                        .replace(/{nama}/g, 'Muhammad Rizky Pratama')
                        .replace(/{nis}/g, '20261001')
                        .replace(/{tipe}/g, 'Siswa')
                        .replace(/{kelas}/g, '10 IPA 1')
                        .replace(/{tanggal}/g, '2026-09-03')
                        .replace(/{waktu}/g, activeTemplateTab === 'in' ? '06:45:10' : '15:05:22')
                        .replace(/{status}/g, activeTemplateTab === 'late' ? 'Terlambat ⚠️' : 'Tepat Waktu ✅')
                        .replace(/{instansi}/g, settings.instansi_nama || 'YAYASAN PONDOK PESANTREN DIGITAL')
                        .replace(/{nama_ortu}/g, 'Bp. Halim & Ibu Siti');
                    })()}
                  </div>

                  <p className="text-[10px] text-slate-500 mt-3 text-right">
                    *Teks preview di atas menggunakan contoh data simulasi
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetTemplates}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Reset ke Default</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTemplates}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-900/30 hover:scale-[1.02] active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Template Pesan</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 3. MANAJEMEN CHAT ID TELEGRAM VIEW (MATCHING SCREENSHOT 2) */}
      {/* ========================================================================= */}
      {subView === 'chat_id' && (
        <>
          {/* Header & Breadcrumb (Matches Screenshot 2) */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span>Home</span>
                <span>/</span>
                <span className="text-primary-400">Manajemen Chat Id Telegram</span>
              </div>
              <h1 className="text-2xl font-black text-white flex items-center gap-3">
                <Users className="w-7 h-7 text-primary-500" />
                Manajemen Chat Id Telegram
              </h1>
            </div>

            <button
              onClick={() => setSubView('main')}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali</span>
            </button>
          </div>

          {/* Info Box: Cara Mendapatkan Chat ID (Matches Screenshot 2) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-slate-300 shadow-md space-y-2">
            <h3 className="font-bold text-xs text-slate-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-primary-400" />
              Cara Mendapatkan Chat ID:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-xs text-slate-400 leading-relaxed pl-1">
              <li>Buka aplikasi Telegram dan cari bot <b className="text-white">@userinfobot</b> atau <b className="text-white">@getmyid_bot</b>.</li>
              <li>Klik tombol <b>'Start'</b> atau kirim pesan apa saja ke bot tersebut.</li>
              <li>Bot akan membalas dengan <b>'ID'</b> atau <b>'Your User ID'</b>. Angka tersebut adalah Chat ID Anda.</li>
              <li>Masukkan angka tersebut ke dalam kolom Chat ID pada sistem ini.</li>
            </ol>
          </div>

          {/* Filter Tab & Search Bar (Matches Screenshot 2) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Tabs: Wali Santri | Pegawai (Matches Screenshot 2) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMemberTypeTab('siswa');
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    memberTypeTab === 'siswa'
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-900/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {isPesantren ? 'Wali Santri' : 'Wali Siswa'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMemberTypeTab('guru');
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    memberTypeTab === 'guru'
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-900/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {isPesantren ? 'Asatidz / Pegawai' : 'Guru / Pegawai'}
                </button>
              </div>

              {/* Search Bar */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search..."
                    className="bg-slate-950 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary-500 w-44 sm:w-56"
                  />
                </div>
              </div>
            </div>

            {/* Table (Matches Screenshot 2) */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4 w-32">{memberTypeTab === 'siswa' ? 'NIS' : 'NIP / ID'}</th>
                    <th className="py-3 px-4">Nama</th>
                    <th className="py-3 px-4">
                      {memberTypeTab === 'siswa' ? 'Nama Ayah & Ibu' : 'Jabatan / Posisi'}
                    </th>
                    <th className="py-3 px-4">Chat ID</th>
                    <th className="py-3 px-4 w-28 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Memuat data anggota...
                      </td>
                    </tr>
                  ) : paginatedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Tidak ada data yang cocok.
                      </td>
                    </tr>
                  ) : (
                    paginatedMembers.map((m, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1;
                      const hasChatID = !!(m.telegram_chat_id && m.telegram_chat_id.trim());

                      return (
                        <tr key={m.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 text-center text-slate-500">{rowNum}</td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {m.nis_nip || m.uid || '-'}
                          </td>
                          <td className="py-3 px-4 font-bold text-white uppercase">
                            {m.nama}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {memberTypeTab === 'siswa' 
                              ? (m.nama_ortu || <span className="text-slate-600 italic">Belum diisi</span>)
                              : (m.kelas || <span className="text-slate-600 italic">Guru</span>)
                            }
                          </td>
                          <td className="py-3 px-4">
                            {hasChatID ? (
                              <span className="font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[11px]">
                                {m.telegram_chat_id}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Edit Button (Amber) */}
                              <button
                                onClick={() => openEditModal(m)}
                                title="Edit Chat ID & Nama Ortu"
                                className="p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition shadow-sm"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Test Send Message Button (Blue Plane) */}
                              <button
                                onClick={() => openTestModal(m.telegram_chat_id || '', m.nama)}
                                title="Kirim Pesan Tes"
                                className={`p-1.5 rounded-lg transition shadow-sm ${
                                  hasChatID 
                                    ? 'bg-primary-600 hover:bg-primary-500 text-white' 
                                    : 'bg-slate-800 text-slate-500 hover:text-white'
                                }`}
                              >
                                <Send className="w-3.5 h-3.5" />
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <span>
                  Halaman {currentPage} dari {totalPages} ({filteredMembers.length} total data)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: EDIT CHAT ID & NAMA ORANG TUA */}
      {/* ========================================================================= */}
      {editModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                Edit Chat ID Telegram
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMemberChatID} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400">Nama Anggota</label>
                <p className="font-bold text-sm text-white">{selectedMember.nama}</p>
                <p className="text-[11px] text-slate-500 font-mono">NIS/UID: {selectedMember.nis_nip || selectedMember.uid}</p>
              </div>

              {selectedMember.tipe === 'siswa' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Nama Ayah & Ibu / Wali Santri
                  </label>
                  <input
                    type="text"
                    value={editNamaOrtu}
                    onChange={(e) => setEditNamaOrtu(e.target.value)}
                    placeholder="Contoh: Bp. Anwar & Ibu Nurhayati"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-primary-500"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={editChatID}
                  onChange={(e) => setEditChatID(e.target.value)}
                  placeholder="Contoh: 1234567890"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-primary-500"
                />
                <p className="text-[10px] text-slate-400">
                  Dapatkan Chat ID via bot Telegram <b>@userinfobot</b> atau <b>@getmyid_bot</b>.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingChatID}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {savingChatID ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: TEST KIRIM PESAN TELEGRAM (MATCHING SCREENSHOT 3) */}
      {/* ========================================================================= */}
      {testModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" />
                Test Kirim Pesan Telegram
              </h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} className="p-6 space-y-5">
              {/* Yellow Warning Box (Matches Screenshot 3) */}
              <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 text-amber-200 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Pastikan Chat ID yang digunakan sudah melakukan <b>'START'</b> pada bot agar dapat menerima pesan test ini.
                </p>
              </div>

              {/* Chat ID Tujuan (Matches Screenshot 3) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Chat ID Tujuan
                </label>
                <input
                  type="text"
                  value={testTargetChatID}
                  onChange={(e) => setTestTargetChatID(e.target.value)}
                  placeholder="Masukkan Chat ID"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Isi Pesan Test (Matches Screenshot 3) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Isi Pesan Test
                </label>
                <textarea
                  rows={5}
                  value={testMessageText}
                  onChange={(e) => setTestMessageText(e.target.value)}
                  placeholder="Tulis pesan test di sini..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-sans text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 leading-relaxed"
                />
              </div>

              {/* Modal Footer (Matches Screenshot 3: Batal & Kirim Pesan) */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-primary-900/30 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${sendingTest ? 'animate-spin' : ''}`} />
                  <span>{sendingTest ? 'Mengirim...' : 'Kirim Pesan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
