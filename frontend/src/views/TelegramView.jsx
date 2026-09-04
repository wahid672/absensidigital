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
  MessageSquare,
  Bot,
  BellRing,
  UserCheck,
  CheckCircle,
  X
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function TelegramView({ settings = {}, onSettingsUpdated, appMode = 'pesantren' }) {
  const isDemoActive = isDemo(settings);
  const isPesantren = appMode !== 'umum';
  const labelSiswa = isPesantren ? 'Santri' : 'Siswa';
  const labelWali = isPesantren ? 'Wali Santri' : 'Wali Siswa';
  const labelGuru = isPesantren ? 'Guru / Asatidz' : 'Guru / Pegawai';

  // Sub-view tab navigation: 'main' (Konfigurasi Bot) | 'template' (Template Pesan) | 'chat_id' (Manajemen Chat ID)
  const [activeTab, setActiveTab] = useState('main');

  // Telegram Config State
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [botStatus, setBotStatus] = useState({ isValid: false, botInfo: '', loading: false });
  const [notifyIn, setNotifyIn] = useState(true);
  const [notifyOut, setNotifyOut] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Template State
  const [templateIn, setTemplateIn] = useState('');
  const [templateOut, setTemplateOut] = useState('');
  const [templateLate, setTemplateLate] = useState('');
  const [templateAdmin, setTemplateAdmin] = useState('');
  const [activeTemplateType, setActiveTemplateType] = useState('in'); // 'in' | 'out' | 'late' | 'admin'
  const [savingTemplates, setSavingTemplates] = useState(false);

  // Admin Live Monitoring State
  const [adminChatIDs, setAdminChatIDs] = useState('');
  const [notifyAdmin, setNotifyAdmin] = useState(true);

  // Chat ID Management State
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberTypeTab, setMemberTypeTab] = useState('siswa'); // 'siswa' | 'guru'
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Edit Chat ID Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editNamaOrtu, setEditNamaOrtu] = useState('');
  const [editChatID, setEditChatID] = useState('');
  const [savingChatID, setSavingChatID] = useState(false);

  // Test Send Message Modal State
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
        setTemplateAdmin(d.template_admin || '');
        setAdminChatIDs(d.admin_chat_ids || '');
        setNotifyAdmin(d.notify_admin !== false);
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
    if (isDemoActive) {
      showDemoAlert('Menyalin Telegram Bot Token');
      return;
    }
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
          html: `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold">${json.bot_info}</div><p class="text-xs text-slate-500 mt-2">Koneksi ke server Telegram Bot API berhasil.</p>`,
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

  // Save Bot Token & Admin Settings
  const handleSaveBotSettings = async () => {
    if (isDemoActive) {
      showDemoAlert('Menyimpan pengaturan Bot Telegram');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/telegram/settings', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken.trim(),
          enabled: telegramEnabled,
          notify_in: notifyIn,
          notify_out: notifyOut,
          admin_chat_ids: adminChatIDs.trim(),
          notify_admin: notifyAdmin,
          template_in: templateIn,
          template_out: templateOut,
          template_late: templateLate,
          template_admin: templateAdmin
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil Disimpan',
          text: 'Konfigurasi Bot Telegram & Admin Lembaga berhasil disimpan.',
          timer: 1500,
          showConfirmButton: false
        });
        loadTelegramStatus();
        if (onSettingsUpdated) onSettingsUpdated();
      } else {
        Swal.fire('Gagal', json.message || 'Gagal menyimpan pengaturan', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan pengaturan ke server.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Save Templates
  const handleSaveTemplates = async () => {
    if (isDemoActive) {
      showDemoAlert('Menyimpan template pesan Telegram');
      return;
    }
    setSavingTemplates(true);
    try {
      const res = await apiFetch('/api/telegram/settings', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken.trim(),
          enabled: telegramEnabled,
          notify_in: notifyIn,
          notify_out: notifyOut,
          admin_chat_ids: adminChatIDs.trim(),
          notify_admin: notifyAdmin,
          template_in: templateIn,
          template_out: templateOut,
          template_late: templateLate,
          template_admin: templateAdmin
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'Template Tersimpan',
          text: 'Template pesan notifikasi Telegram berhasil disimpan.',
          timer: 1500,
          showConfirmButton: false
        });
        loadTelegramStatus();
      } else {
        Swal.fire('Gagal', json.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Terjadi kesalahan saat menyimpan template.', 'error');
    } finally {
      setSavingTemplates(false);
    }
  };

  // Reset Templates to Default
  const handleResetTemplates = () => {
    if (isDemoActive) {
      showDemoAlert('Reset template pesan Telegram');
      return;
    }
    Swal.fire({
      title: 'Reset Template ke Default?',
      text: 'Semua template notifikasi pesan masuk, pulang, terlambat, dan admin lembaga akan dikembalikan ke format standar bawaan.',
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
        setTemplateAdmin("📋 *LIVE MONITOR PRESENSI ADMIN*\n👤 Nama: *{nama}*\n🏷️ Tipe: {tipe}\n🏫 Kelas/Jabatan: {kelas}\n🔄 Aksi: *{aksi}* ({status})\n📅 Tanggal: {tanggal}\n⏰ Jam: {waktu}\n📍 Mesin: {id_mesin}\n_{instansi}_");
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'Template di-reset. Jangan lupa klik Simpan Template!',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  };

  // Insert tag helper at cursor
  const insertTag = (tag) => {
    if (activeTemplateType === 'in') {
      setTemplateIn(prev => prev + ' ' + tag);
    } else if (activeTemplateType === 'out') {
      setTemplateOut(prev => prev + ' ' + tag);
    } else if (activeTemplateType === 'late') {
      setTemplateLate(prev => prev + ' ' + tag);
    } else if (activeTemplateType === 'admin') {
      setTemplateAdmin(prev => prev + ' ' + tag);
    }
  };

  // Open Edit Chat ID Modal
  const openEditModal = (m) => {
    if (isDemoActive) {
      showDemoAlert('Mengubah Chat ID Telegram penerima');
      return;
    }
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

  // Open Test Send Message Modal
  const openTestModal = (targetChatID = '', targetNama = '') => {
    setTestTargetChatID(targetChatID);
    setTestTargetNama(targetNama);
    setTestMessageText(
      `🔔 *TES NOTIFIKASI TELEGRAM*\nAssalamu'alaikum Wr. Wb.\nYth. ${targetNama ? `Wali dari *${targetNama}*` : 'Pengguna'}\n\nIni adalah pesan uji coba (test) notifikasi absensi dari sistem ${settings.instansi_nama || 'PresensiRFID'}.\n\nStatus: *Berhasil Terhubung! ✅*`
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
          title: 'Pesan Terkirim! ✈️',
          html: `<p class="text-sm text-slate-600">Pesan notifikasi berhasil dikirim ke Chat ID: <b>${testTargetChatID}</b>.</p>`,
          confirmButtonColor: '#2563eb'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal Kirim Pesan',
          text: json.message || 'Pastikan penerima sudah menekan tombol START di bot Telegram.',
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
    { tag: '{nama}', desc: 'Nama Lengkap' },
    { tag: '{nis}', desc: 'NIS/NIP' },
    { tag: '{tipe}', desc: 'Siswa / Guru' },
    { tag: '{kelas}', desc: 'Kelas / Jabatan' },
    { tag: '{aksi}', desc: 'Presensi Masuk / Pulang' },
    { tag: '{tanggal}', desc: 'Tgl (YYYY-MM-DD)' },
    { tag: '{waktu}', desc: 'Jam (HH:MM:SS)' },
    { tag: '{status}', desc: 'Tepat / Terlambat' },
    { tag: '{id_mesin}', desc: 'ID Mesin Presensi' },
    { tag: '{instansi}', desc: 'Nama Instansi' },
    { tag: '{nama_ortu}', desc: 'Nama Wali/Ortu' }
  ];

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto animate-fade-in">

      {/* ========================================================================= */}
      {/* 1. HEADER SECTION (MATCHING APP-WIDE STANDARD) */}
      {/* ========================================================================= */}
      {activeTab === 'main' && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Send className="w-5 h-5 text-primary-600" />
              <span>Notifikasi Telegram</span>
            </h3>
            <p className="text-xs text-slate-500">
              Konfigurasi Bot Telegram resmi untuk pengiriman notifikasi absensi otomatis ke {labelWali} & {labelGuru}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              type="button"
              onClick={() => setActiveTab('template')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Setting Template Pesan</span>
            </button>

            <button 
              type="button"
              onClick={() => setActiveTab('chat_id')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Manajemen Chat ID Telegram</span>
            </button>

            <button 
              type="button"
              onClick={() => openTestModal('', '')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all"
            >
              <Send className="w-3.5 h-3.5 text-sky-300" />
              <span>Test Kirim Pesan</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'template' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-rose-600" />
              <span>Setting Template Pesan Telegram</span>
            </h3>
            <p className="text-xs text-slate-500">
              Kustomisasi format teks notifikasi presensi masuk, pulang, dan peringatan terlambat
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span>Home</span>
              <span>/</span>
              <span className="text-rose-600 font-semibold">Setting Template Pesan</span>
            </div>

            <button 
              type="button"
              onClick={() => setActiveTab('main')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'chat_id' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" />
              <span>Manajemen Chat Id Telegram</span>
            </h3>
            <p className="text-xs text-slate-500">
              Daftar dan kelola nomor Chat ID Telegram {labelWali} dan {labelGuru}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span>Home</span>
              <span>/</span>
              <span className="text-primary-600 font-semibold">Manajemen Chat Id Telegram</span>
            </div>

            <button 
              type="button"
              onClick={() => setActiveTab('main')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TAB 1: KONFIGURASI BOT TELEGRAM */}
      {/* ========================================================================= */}
      {activeTab === 'main' && (
        <div className="space-y-6 animate-fade-in">
          {/* Blue Info Box: Cara Menggunakan Fitur */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 text-sky-900 shadow-sm">
            <h3 className="font-bold text-sm text-sky-950 flex items-center gap-2 mb-2.5">
              <Info className="w-4 h-4 text-sky-600" />
              Cara Menggunakan Fitur:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-xs text-sky-800 leading-relaxed pl-1">
              <li>Pastikan <b>Bot Token</b> sudah diisi dan status API <b>Aktif</b>.</li>
              <li>User/Penerima pesan harus membuka bot Telegram yang telah dibuat.</li>
              <li>Klik tombol <b>'START'</b> atau kirim pesan <b>'/start'</b> pada bot tersebut.</li>
              <li>Hal ini diperlukan agar sistem dapat mengirimkan notifikasi melalui Telegram.</li>
              <li>Setiap pesan notifikasi absensi akan otomatis dikirimkan saat santri/pegawai tap kartu RFID atau sidik jari di mesin presensi.</li>
            </ol>
          </div>

          {/* Settings Card: Default */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <Key className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Default</h3>
                  <p className="text-xs text-slate-500">Pengaturan Kunci API Bot Telegram Utama</p>
                </div>
              </div>

              {botStatus.botInfo && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl self-start sm:self-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{botStatus.botInfo}</span>
                </div>
              )}
            </div>

            {/* Input Bot Token */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                TELEGRAM BOT TOKEN
              </label>

              <div className="relative flex items-center">
                <input
                  type={isDemoActive ? 'password' : (showToken ? 'text' : 'password')}
                  value={isDemoActive ? '••••••••••••••••••••••••••••••••••••••••••••••••' : botToken}
                  readOnly={isDemoActive}
                  onChange={(e) => {
                    if (isDemoActive) {
                      showDemoAlert('Mengubah Telegram Bot Token');
                      return;
                    }
                    setBotToken(e.target.value);
                  }}
                  placeholder="Contoh: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white pr-24"
                />

                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isDemoActive) {
                        showDemoAlert('Melihat Telegram Bot Token');
                        return;
                      }
                      setShowToken(!showToken);
                    }}
                    title={showToken ? 'Sembunyikan' : 'Tampilkan'}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
                  >
                    {showToken && !isDemoActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyToken}
                    title="Salin Token"
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
                  >
                    {tokenCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Token API yang didapatkan dari @BotFather. Setiap unit wajib memakai bot yang berbeda.
              </p>
            </div>

            {/* Panduan @BotFather Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-primary-600" />
                Cara Mendapatkan Bot Token:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
                <li>Buka Telegram dan cari <b className="text-slate-800">@BotFather</b>.</li>
                <li>Kirim perintah <code className="text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded font-bold">/newbot</code> dan ikuti instruksi untuk mengatur nama dan username.</li>
                <li>Salin <b>API Token</b> yang diberikan dan tempelkan pada kolom di atas.</li>
              </ol>
            </div>

            {/* Pemicu Notifikasi Switches */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <BellRing className="w-4 h-4 text-slate-500" />
                Pemicu Notifikasi Otomatis:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition">
                  <input
                    type="checkbox"
                    checked={notifyIn}
                    onChange={(e) => setNotifyIn(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 border-slate-300 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Notifikasi Presensi Masuk</p>
                    <p className="text-[11px] text-slate-500">Kirim pesan otomatis saat santri/pegawai tap masuk</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition">
                  <input
                    type="checkbox"
                    checked={notifyOut}
                    onChange={(e) => setNotifyOut(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 border-slate-300 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Notifikasi Presensi Pulang</p>
                    <p className="text-[11px] text-slate-500">Kirim pesan otomatis saat santri/pegawai tap pulang</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions: Save & Verify */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveBotSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'Menyimpan...' : 'Simpan'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestBot}
                disabled={botStatus.loading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-slate-600 ${botStatus.loading ? 'animate-spin' : ''}`} />
                <span>{botStatus.loading ? 'Memeriksa...' : 'Cek Status Bot'}</span>
              </button>
            </div>
          </div>

          {/* Settings Card: Admin Lembaga (Multi-Admin Live Monitoring) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>Admin Lembaga & Pimpinan</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      Multi-Admin Live Monitoring
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kirim notifikasi absensi realtime ke beberapa Chat ID Admin/Pimpinan sekaligus saat ada yang tap di mesin
                  </p>
                </div>
              </div>

              {(() => {
                const count = adminChatIDs.split(/[,\n;]/).map(s => s.trim()).filter(Boolean).length;
                return (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl self-start sm:self-auto">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>{count > 0 ? `${count} Admin Terdaftar` : 'Belum Ada Admin'}</span>
                  </div>
                );
              })()}
            </div>

            {/* Input Daftar Chat ID Admin */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>DAFTAR CHAT ID TELEGRAM ADMIN</span>
                  <span className="text-[10px] text-primary-600 font-normal normal-case">(Bisa lebih dari 1 ID)</span>
                </label>
                <span className="text-[11px] text-slate-400">Pisahkan dengan koma (,) atau baris baru</span>
              </div>

              <textarea
                rows={3}
                value={adminChatIDs}
                onChange={(e) => setAdminChatIDs(e.target.value)}
                placeholder="Contoh: 123456789, 987654321, 555444333"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
              />
              <p className="text-[11px] text-slate-500">
                Masukkan ID Telegram Admin lembaga. Semua admin yang terdaftar di sini akan menerima update live absensi secara otomatis.
              </p>
            </div>

            {/* Panduan Admin Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-primary-600" />
                Cara Admin Mendapatkan ID & Mengaktifkan Bot:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
                <li>Buka bot Telegram Anda di aplikasi Telegram, lalu klik <b>'START'</b> (wajib agar bot dapat mengirim pesan ke admin).</li>
                <li>Dapatkan Chat ID akun Telegram Anda melalui bot <b>@userinfobot</b> atau <b>@getmyid_bot</b>.</li>
                <li>Salin angka ID tersebut dan masukkan ke kolom di atas. Jika lebih dari 1 admin, pisahkan dengan koma atau baris baru.</li>
                <li>Klik tombol <b>Simpan</b>, lalu lakukan uji coba via tombol <b>Test Kirim ke Seluruh Admin</b>.</li>
              </ol>
            </div>

            {/* Switch Notifikasi Admin */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition">
                <input
                  type="checkbox"
                  checked={notifyAdmin}
                  onChange={(e) => setNotifyAdmin(e.target.checked)}
                  className="w-4 h-4 rounded text-primary-600 border-slate-300 focus:ring-primary-500"
                />
                <div>
                  <p className="text-xs font-bold text-slate-800">Notifikasi Realtime Admin Lembaga</p>
                  <p className="text-[11px] text-slate-500">
                    Kirim broadcast pesan live monitor ke seluruh Chat ID Admin di atas saat siapapun (santri/siswa/guru) tap presensi di mesin IoT
                  </p>
                </div>
              </label>
            </div>

            {/* Actions: Save & Test Admin */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveBotSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Admin'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const cleaned = adminChatIDs.trim();
                  if (!cleaned) {
                    Swal.fire('Perhatian', 'Silakan isi kolom Daftar Chat ID Admin terlebih dahulu.', 'warning');
                    return;
                  }
                  openTestModal(cleaned, 'Seluruh Admin Lembaga');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-semibold transition"
              >
                <Send className="w-4 h-4 text-sky-600" />
                <span>Test Kirim ke Seluruh Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TAB 2: SETTING TEMPLATE PESAN */}
      {/* ========================================================================= */}
      {activeTab === 'template' && (
        <div className="space-y-6 animate-fade-in">
          {/* Dynamic Variable Badges */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Tag Variabel Dinamis (Klik untuk Menambahkan ke Template):
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertTag(item.tag)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-primary-50 border border-slate-200 hover:border-primary-300 rounded-lg text-xs font-mono text-primary-700 flex items-center gap-1.5 transition group shadow-2xs"
                  title="Klik untuk menyisipkan tag"
                >
                  <span className="font-bold">{item.tag}</span>
                  <span className="text-[10px] text-slate-400 group-hover:text-primary-600">({item.desc})</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Format teks mendukung Markdown Telegram: <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded font-bold">*tebal*</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded italic">_miring_</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded font-mono">`kode`</code>.
            </p>
          </div>

          {/* Template Editor Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            {/* Sub-tabs: Masuk | Pulang | Terlambat */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => setActiveTemplateType('in')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateType === 'in'
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>🔔 Template Presensi Masuk</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplateType('out')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateType === 'out'
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>🚪 Template Presensi Pulang</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplateType('late')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateType === 'late'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>⚠️ Template Terlambat</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplateType('admin')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTemplateType === 'admin'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>📋 Template Admin Lembaga</span>
              </button>
            </div>

            {/* Editor & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Textarea Editor */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">
                  {activeTemplateType === 'in' && 'Format Pesan Presensi Masuk:'}
                  {activeTemplateType === 'out' && 'Format Pesan Presensi Pulang:'}
                  {activeTemplateType === 'late' && 'Format Pesan Peringatan Terlambat:'}
                  {activeTemplateType === 'admin' && 'Format Pesan Live Monitor Admin Lembaga:'}
                </label>

                {activeTemplateType === 'in' && (
                  <textarea
                    rows={10}
                    value={templateIn}
                    onChange={(e) => setTemplateIn(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
                  />
                )}

                {activeTemplateType === 'out' && (
                  <textarea
                    rows={10}
                    value={templateOut}
                    onChange={(e) => setTemplateOut(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
                  />
                )}

                {activeTemplateType === 'late' && (
                  <textarea
                    rows={10}
                    value={templateLate}
                    onChange={(e) => setTemplateLate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
                  />
                )}

                {activeTemplateType === 'admin' && (
                  <textarea
                    rows={10}
                    value={templateAdmin}
                    onChange={(e) => setTemplateAdmin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
                  />
                )}
              </div>

              {/* Realistic Telegram Live Preview */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  Live Preview Tampilan Pesan Telegram:
                </label>

                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 min-h-[220px] flex flex-col justify-between shadow-inner">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans shadow-sm border-l-4 border-l-sky-500">
                    {(() => {
                      let raw = activeTemplateType === 'in' 
                        ? templateIn 
                        : activeTemplateType === 'out' 
                        ? templateOut 
                        : activeTemplateType === 'late' 
                        ? templateLate 
                        : templateAdmin;
                      return (raw || '')
                        .replace(/{nama}/g, 'Muhammad Rizky Pratama')
                        .replace(/{nis}/g, '20261001')
                        .replace(/{tipe}/g, 'Siswa')
                        .replace(/{kelas}/g, '10 IPA 1')
                        .replace(/{aksi}/g, activeTemplateType === 'out' ? 'Presensi Pulang' : 'Presensi Masuk')
                        .replace(/{tanggal}/g, '2026-09-04')
                        .replace(/{waktu}/g, activeTemplateType === 'out' ? '15:05:22' : '06:45:10')
                        .replace(/{status}/g, activeTemplateType === 'late' ? 'Terlambat ⚠️' : 'Tepat Waktu ✅')
                        .replace(/{id_mesin}/g, 'PRESENSI-V1')
                        .replace(/{instansi}/g, settings.instansi_nama || 'YAYASAN PONDOK PESANTREN DIGITAL')
                        .replace(/{nama_ortu}/g, 'Bp. Halim & Ibu Siti');
                    })()}
                  </div>

                  <p className="text-[10px] text-slate-500 mt-3 text-right">
                    *Tampilan pesan di atas menggunakan data simulasi contoh
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetTemplates}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Reset ke Default</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTemplates}
                disabled={savingTemplates}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingTemplates ? 'Menyimpan...' : 'Simpan Template Pesan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TAB 3: MANAJEMEN CHAT ID TELEGRAM */}
      {/* ========================================================================= */}
      {activeTab === 'chat_id' && (
        <div className="space-y-6 animate-fade-in">
          {/* Info Box: Cara Mendapatkan Chat ID */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-slate-700 shadow-sm space-y-2">
            <h3 className="font-bold text-xs text-slate-800 flex items-center gap-2">
              <Info className="w-4 h-4 text-primary-600" />
              Cara Mendapatkan Chat ID:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600 leading-relaxed pl-1">
              <li>Buka aplikasi Telegram dan cari bot <b className="text-slate-800">@userinfobot</b> atau <b className="text-slate-800">@getmyid_bot</b>.</li>
              <li>Klik tombol <b>'Start'</b> atau kirim pesan apa saja ke bot tersebut.</li>
              <li>Bot akan membalas dengan <b>'ID'</b> atau <b>'Your User ID'</b>. Angka tersebut adalah Chat ID Anda.</li>
              <li>Masukkan angka tersebut ke dalam kolom Chat ID pada sistem ini.</li>
            </ol>
          </div>

          {/* Table Container Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Header: Filters & Search */}
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Tabs: Wali Santri vs Pegawai */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMemberTypeTab('siswa');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    memberTypeTab === 'siswa'
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {labelWali}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMemberTypeTab('guru');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    memberTypeTab === 'guru'
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {labelGuru}
                </button>
              </div>

              {/* Show Entries & Search Input */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[320px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
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
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Memuat data anggota...
                      </td>
                    </tr>
                  ) : paginatedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Tidak ada data yang cocok.
                      </td>
                    </tr>
                  ) : (
                    paginatedMembers.map((m, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1;
                      const hasChatID = !!(m.telegram_chat_id && m.telegram_chat_id.trim());

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 text-center text-slate-500">{rowNum}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {m.nis_nip || m.uid || '-'}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 uppercase">
                            {m.nama}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {memberTypeTab === 'siswa' 
                              ? (m.nama_ortu || <span className="text-slate-400 italic">Belum diisi</span>)
                              : (m.kelas || <span className="text-slate-400 italic">Guru</span>)
                            }
                          </td>
                          <td className="py-3 px-4">
                            {hasChatID ? (
                              <span className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                                {m.telegram_chat_id}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Edit Button (Amber) */}
                              <button
                                type="button"
                                onClick={() => openEditModal(m)}
                                title="Edit Chat ID & Nama Ortu"
                                className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition shadow-2xs"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Test Send Message Button (Blue Plane) */}
                              <button
                                type="button"
                                onClick={() => openTestModal(m.telegram_chat_id || '', m.nama)}
                                title="Kirim Pesan Tes"
                                className={`p-1.5 rounded-lg transition shadow-2xs ${
                                  hasChatID 
                                    ? 'bg-sky-600 hover:bg-sky-700 text-white' 
                                    : 'bg-slate-200 text-slate-400 hover:bg-slate-300 hover:text-slate-700'
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
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Halaman {currentPage} dari {totalPages} ({filteredMembers.length} total data)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: EDIT CHAT ID & NAMA ORANG TUA */}
      {/* ========================================================================= */}
      {editModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Edit Chat ID Telegram
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMemberChatID} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <label className="text-xs font-semibold text-slate-500">Nama Anggota</label>
                <p className="font-bold text-sm text-slate-800">{selectedMember.nama}</p>
                <p className="text-[11px] text-slate-500 font-mono">NIS/UID: {selectedMember.nis_nip || selectedMember.uid}</p>
              </div>

              {selectedMember.tipe === 'siswa' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Nama Ayah & Ibu / Wali Santri
                  </label>
                  <input
                    type="text"
                    value={editNamaOrtu}
                    onChange={(e) => setEditNamaOrtu(e.target.value)}
                    placeholder="Contoh: Bp. Anwar & Ibu Nurhayati"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={editChatID}
                  onChange={(e) => setEditChatID(e.target.value)}
                  placeholder="Contoh: 1234567890"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-semibold"
                />
                <p className="text-[10px] text-slate-500">
                  Dapatkan Chat ID via bot Telegram <b>@userinfobot</b> atau <b>@getmyid_bot</b>.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingChatID}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {savingChatID ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: TEST KIRIM PESAN TELEGRAM */}
      {/* ========================================================================= */}
      {testModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-600" />
                Test Kirim Pesan Telegram
              </h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} className="p-6 space-y-5">
              {/* Yellow Warning Box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Pastikan Chat ID yang digunakan sudah menekan tombol <b>'START'</b> pada bot Telegram Anda agar bot memiliki izin untuk mengirimkan pesan test ini.
                </p>
              </div>

              {/* Chat ID Tujuan */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Chat ID Tujuan
                </label>
                <input
                  type="text"
                  value={testTargetChatID}
                  onChange={(e) => setTestTargetChatID(e.target.value)}
                  placeholder="Masukkan nomor Chat ID"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono text-emerald-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white font-semibold"
                />
              </div>

              {/* Isi Pesan Test */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Isi Pesan Test
                </label>
                <textarea
                  rows={5}
                  value={testMessageText}
                  onChange={(e) => setTestMessageText(e.target.value)}
                  placeholder="Tulis pesan test di sini..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-sans text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white leading-relaxed"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={sendingTest}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${sendingTest ? 'animate-spin' : ''}`} />
                  <span>{sendingTest ? 'Mengirim...' : 'Kirim Pesan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
}
