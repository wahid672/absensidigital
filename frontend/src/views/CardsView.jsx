import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Search, 
  Link, 
  Unlink, 
  Trash2, 
  Loader2, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  UserCheck, 
  X, 
  User,
  GraduationCap,
  Briefcase,
  RotateCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Radio
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function CardsView({ 
  members = [], 
  settings = {}, 
  appMode = 'pesantren',
  onUpdated 
}) {
  const isDemoActive = isDemo(settings);
  const isUmum = appMode === 'umum';
  const isPesantren = appMode === 'pesantren';
  const labelSiswa = isPesantren ? 'Santri' : 'Siswa';
  const labelGuru = isUmum ? 'Pegawai' : isPesantren ? 'Guru / Asatidz' : 'Guru';

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'unmapped' | 'mapped'

  // Settings & Toggle State
  const [autoRegister, setAutoRegister] = useState(settings.auto_register_card === '1');
  const [togglingPolicy, setTogglingPolicy] = useState(false);

  useEffect(() => {
    setAutoRegister(settings.auto_register_card === '1');
  }, [settings.auto_register_card]);

  // Modal Mapping State
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [targetMemberType, setTargetMemberType] = useState(isUmum ? 'guru' : 'siswa');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [savingMap, setSavingMap] = useState(false);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/cards');
      const result = await res.json();
      setCards(result.data || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Fetch cards error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  // Toggle Auto Register Card Policy
  const handleToggleAutoRegister = async () => {
    if (isDemoActive) {
      showDemoAlert('Mengubah kebijakan pendaftaran kartu baru');
      return;
    }

    const nextVal = !autoRegister;
    setAutoRegister(nextVal);
    setTogglingPolicy(true);

    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ auto_register_card: nextVal ? '1' : '0' })
      });
      const data = await res.json();

      if (res.ok) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: nextVal ? 'Pendaftaran Kartu Baru: ON' : 'Pendaftaran Kartu Baru: OFF',
          text: nextVal 
            ? 'Kartu RFID baru yang di-tap pada mesin akan dicatat ke antrean mapping.' 
            : 'Kartu RFID baru yang belum terdaftar akan ditolak oleh mesin.',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
        if (onUpdated) onUpdated();
      } else {
        setAutoRegister(!nextVal);
        Swal.fire('Gagal', data.message || 'Gagal mengubah kebijakan kartu.', 'error');
      }
    } catch (err) {
      setAutoRegister(!nextVal);
      Swal.fire('Error', 'Gagal menghubungi server.', 'error');
    } finally {
      setTogglingPolicy(false);
    }
  };

  // Open Modal Map
  const openMapModal = (card) => {
    if (isDemoActive) {
      showDemoAlert('Menghubungkan kartu RFID anggota');
      return;
    }
    setSelectedCard(card);
    setSelectedMemberId(card.member_id > 0 ? String(card.member_id) : '');
    setTargetMemberType(card.member?.tipe || (isUmum ? 'guru' : 'siswa'));
    setMemberSearch('');
    setMapModalOpen(true);
  };

  // Submit Mapping
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!selectedMemberId) {
      Swal.fire('Peringatan', `Silakan pilih ${targetMemberType === 'guru' ? labelGuru : labelSiswa} terlebih dahulu.`, 'warning');
      return;
    }

    setSavingMap(true);
    try {
      const res = await apiFetch('/api/cards/map', {
        method: 'POST',
        body: JSON.stringify({
          card_uid: selectedCard.card_uid,
          device_id: selectedCard.device_id || 'PRESENSI-V1',
          member_id: parseInt(selectedMemberId)
        })
      });
      const data = await res.json();

      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil Dihubungkan!',
          text: data.message,
          timer: 1600,
          showConfirmButton: false
        });
        setMapModalOpen(false);
        fetchCards();
      } else {
        Swal.fire('Gagal', data.message || 'Terjadi kesalahan.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menghubungi server.', 'error');
    } finally {
      setSavingMap(false);
    }
  };

  // Unmap Card
  const handleUnmap = (card) => {
    if (isDemoActive) {
      showDemoAlert('Melepas hubungan kartu RFID');
      return;
    }
    Swal.fire({
      title: `Lepas Hubungan Kartu RFID?`,
      html: `Kartu RFID UID <b>${card.card_uid}</b> tidak lagi terhubung ke <b>${card.member?.nama || 'anggota'}</b>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d97706',
      confirmButtonText: 'Ya, Lepas Hubungan',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch('/api/cards/unmap', {
            method: 'POST',
            body: JSON.stringify({
              card_uid: card.card_uid,
              member_id: card.member_id
            })
          });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
            fetchCards();
          } else {
            Swal.fire('Gagal', data.message || 'Gagal melepas mapping kartu.', 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        }
      }
    });
  };

  // Delete Card Record
  const handleDelete = (card) => {
    if (isDemoActive) {
      showDemoAlert('Menghapus data kartu RFID');
      return;
    }
    Swal.fire({
      title: `Hapus Kartu RFID ${card.card_uid}?`,
      html: `Data kartu UID <b>${card.card_uid}</b> (${card.member?.nama || 'Belum Terhubung'}) akan dihapus dari antrean server.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus Sekarang',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/cards?card_uid=${encodeURIComponent(card.card_uid)}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ 
              icon: 'success', 
              title: 'Kartu Dihapus!', 
              text: data.message,
              timer: 1500,
              showConfirmButton: false
            });
            fetchCards();
          } else {
            Swal.fire('Gagal', data.message || 'Gagal menghapus data kartu.', 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        }
      }
    });
  };

  // Filter & Search
  const filteredList = cards.filter(card => {
    if (filterStatus === 'unmapped' && card.status === 'mapped') return false;
    if (filterStatus === 'mapped' && card.status !== 'mapped') return false;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const uidMatch = (card.card_uid || '').toLowerCase().includes(q);
      const devMatch = (card.device_id || '').toLowerCase().includes(q);
      const nameMatch = (card.member?.nama || '').toLowerCase().includes(q);
      const nisMatch = (card.member?.nis_nip || '').toLowerCase().includes(q);
      const classMatch = (card.member?.kelas || '').toLowerCase().includes(q);
      return uidMatch || devMatch || nameMatch || nisMatch || classMatch;
    }
    return true;
  });

  const totalCount = cards.length;
  const mappedCount = cards.filter(c => c.status === 'mapped').length;
  const unmappedCount = cards.filter(c => c.status !== 'mapped').length;

  // Available members for modal dropdown
  const availableMembers = members.filter(m => {
    if (m.tipe !== targetMemberType) return false;
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase().trim();
      return (m.nama || '').toLowerCase().includes(q) ||
             (m.nis_nip || '').toLowerCase().includes(q) ||
             (m.kelas || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* 1. HEADER & AUTO-REGISTER POLICY TOGGLE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            <span>Perekaman & Mapping Kartu RFID</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar kartu RFID yang terekam dari mesin dan hubungkan ke data {isUmum ? 'Pegawai' : `${labelSiswa} / ${labelGuru}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* TOGGLE SWITCH PENDAFTARAN KARTU BARU */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-700 block">
                Izinkan Kartu Baru
              </span>
              <span className={`text-[10px] font-semibold ${autoRegister ? 'text-emerald-600' : 'text-slate-400'}`}>
                {autoRegister ? 'Status: ON (Rekam Otomatis)' : 'Status: OFF (Tolak Kartu)'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleAutoRegister}
              disabled={togglingPolicy}
              title={autoRegister ? 'Nonaktifkan pendaftaran kartu baru' : 'Aktifkan pendaftaran kartu baru'}
              className={`relative inline-flex h-6 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoRegister ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoRegister ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* REFRESH BUTTON */}
          <button 
            onClick={fetchCards}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-all"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. ALERT STATUS PENDAFTARAN KARTU */}
      <div className={`p-4 rounded-2xl border flex items-start gap-3 text-xs transition-all ${
        autoRegister 
          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' 
          : 'bg-amber-50/70 border-amber-200 text-amber-800'
      }`}>
        <div className={`p-2 rounded-xl flex-shrink-0 ${
          autoRegister ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {autoRegister ? <Radio className="w-5 h-5 animate-pulse" /> : <ShieldAlert className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-sm">
            {autoRegister ? 'Mode Perekaman Kartu Baru Sedang Aktif (ON)' : 'Perekaman Kartu Baru Dinonaktifkan (OFF)'}
          </h4>
          <p className="mt-0.5 text-slate-600">
            {autoRegister 
              ? 'Ketika kartu RFID yang belum terdaftar di-tap pada mesin, sistem akan merekam nomor UID kartu ke antrean tabel di bawah ini tanpa langsung mencatat absensi. Anda dapat menghubungkan kartu tersebut ke anggota kapan saja.' 
              : 'Kartu RFID yang belum terdaftar tidak akan dicatat dan akan ditolak oleh mesin presensi.'}
          </p>
        </div>
      </div>

      {/* 3. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xl flex-shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Kartu Terekam</p>
            <h3 className="text-2xl font-bold text-slate-800">{totalCount} <span className="text-xs font-normal text-slate-400">Kartu</span></h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Sudah Terhubung (Mapped)</p>
            <h3 className="text-2xl font-bold text-emerald-600">{mappedCount} <span className="text-xs font-normal text-slate-400">Orang</span></h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Belum Terhubung (Unmapped)</p>
            <h3 className="text-2xl font-bold text-amber-600">{unmappedCount} <span className="text-xs font-normal text-slate-400">Kartu</span></h3>
          </div>
        </div>
      </div>

      {/* 4. TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({totalCount})
            </button>
            <button
              onClick={() => setFilterStatus('unmapped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'unmapped' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Belum Terhubung ({unmappedCount})
            </button>
            <button
              onClick={() => setFilterStatus('mapped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'mapped' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Terhubung ({mappedCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Cari UID kartu, nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4 w-44">UID Kartu RFID</th>
                <th className="py-3.5 px-4 w-36">Status</th>
                <th className="py-3.5 px-4">Terhubung Ke Anggota</th>
                <th className="py-3.5 px-4">Mesin Presensi</th>
                <th className="py-3.5 px-4 text-slate-400">Waktu Rekam</th>
                <th className="py-3.5 px-4 text-center w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && cards.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data kartu RFID...</span>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 text-xs">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-600">Tidak ada data kartu RFID</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {search ? 'Tidak ada hasil kartu yang sesuai dengan kata kunci pencarian.' : 'Pastikan toggle "Izinkan Kartu Baru" aktif (ON) dan tap kartu RFID baru pada mesin.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((card, idx) => {
                  const isMapped = card.status === 'mapped' && card.member && card.member.id > 0;
                  return (
                    <tr key={card.id || card.card_uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center font-medium text-slate-400 text-xs">
                        {idx + 1}
                      </td>

                      {/* UID KARTU */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300">
                            <CreditCard className="w-3.5 h-3.5 text-primary-600" />
                            {card.card_uid}
                          </span>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4">
                        {isMapped ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Terhubung
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            <AlertCircle className="w-3 h-3" /> Belum Dihubungkan
                          </span>
                        )}
                      </td>

                      {/* ANGGOTA */}
                      <td className="py-3.5 px-4">
                        {isMapped ? (
                          <div>
                            <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              {card.member.tipe === 'guru' ? (
                                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <GraduationCap className="w-3.5 h-3.5 text-sky-600" />
                              )}
                              <span>{card.member.nama}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                              {card.member.nis_nip && (
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                  {card.member.nis_nip}
                                </span>
                              )}
                              <span>{card.member.kelas || '-'}</span>
                              <span className="text-slate-300">•</span>
                              <span className="capitalize font-medium text-slate-600">
                                {card.member.tipe === 'guru' ? labelGuru : labelSiswa}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-xs italic flex items-center gap-1.5">
                            <span>Belum ada pemilik kartu</span>
                          </div>
                        )}
                      </td>

                      {/* MESIN PRESENSI */}
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <Cpu className="w-3 h-3 text-slate-500" />
                          {card.device_id || 'PRESENSI-V1'}
                        </span>
                      </td>

                      {/* WAKTU REKAM */}
                      <td className="py-3.5 px-4 text-[11px] font-mono text-slate-400">
                        {card.created_at || '-'}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Tombol Hubungkan / Ubah Anggota */}
                          <button
                            onClick={() => openMapModal(card)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 transition-colors"
                            title={isMapped ? 'Ganti Hubungan Anggota' : 'Hubungkan ke Anggota'}
                          >
                            <Link className="w-3.5 h-3.5" />
                            <span>{isMapped ? 'Ganti' : 'Hubungkan'}</span>
                          </button>

                          {/* Tombol Lepas Hubungan (jika mapped) */}
                          {isMapped && (
                            <button
                              onClick={() => handleUnmap(card)}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200 transition-colors"
                              title="Lepas Hubungan Kartu"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Tombol Hapus */}
                          <button
                            onClick={() => handleDelete(card)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                            title="Hapus Kartu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* 5. MODAL MAPPING KARTU RFID KE ANGGOTA */}
      {mapModalOpen && selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Link className="w-5 h-5 text-primary-600" />
                <span>Hubungkan Kartu RFID ke Anggota</span>
              </h3>
              <button 
                onClick={() => setMapModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Kartu RFID */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">UID Kartu RFID</p>
                  <p className="text-sm font-mono font-bold text-slate-800">{selectedCard.card_uid}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-medium block">Mesin Sensor</span>
                <span className="text-xs font-mono font-semibold text-slate-700">{selectedCard.device_id || 'PRESENSI-V1'}</span>
              </div>
            </div>

            {/* Switch Kategori Santri / Siswa / Pegawai */}
            {!isUmum ? (
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setTargetMemberType('siswa'); setSelectedMemberId(''); }}
                  className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    targetMemberType === 'siswa' 
                      ? 'bg-white text-sky-700 shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>{labelSiswa}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setTargetMemberType('guru'); setSelectedMemberId(''); }}
                  className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    targetMemberType === 'guru' 
                      ? 'bg-white text-indigo-700 shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Briefcase className="w-4 h-4" />
                  <span>{labelGuru}</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200">
                <Briefcase className="w-4 h-4 text-emerald-600" />
                <span>Kategori Target: Pegawai Instansi</span>
              </div>
            )}

            {/* Pencarian Anggota */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Pilih {targetMemberType === 'guru' ? labelGuru : labelSiswa} Pemilik Kartu:
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder={`Cari nama, ${targetMemberType === 'guru' ? 'NIP' : 'NIS'}, kelas...`}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Daftar Pilihan Anggota */}
            <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-1.5 bg-slate-50/50">
              {availableMembers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Tidak ditemukan data {targetMemberType === 'guru' ? labelGuru : labelSiswa}.
                </div>
              ) : (
                availableMembers.map(m => {
                  const isSelected = selectedMemberId === String(m.id);
                  const hasCard = m.uid && !m.uid.startsWith('PENDING-') && !m.uid.startsWith('UNASSIGNED-');
                  return (
                    <div 
                      key={m.id}
                      onClick={() => setSelectedMemberId(String(m.id))}
                      className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                        isSelected 
                          ? 'bg-primary-50 border border-primary-300 text-primary-900 shadow-2xs' 
                          : 'bg-white hover:bg-slate-100 border border-transparent text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold truncate">{m.nama}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          {m.nis_nip && <span className="font-mono">{m.nis_nip}</span>}
                          <span>{m.kelas || '-'}</span>
                          {hasCard && (
                            <span className="text-amber-600 font-mono">
                              (Kartu saat ini: {m.uid})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMapModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!selectedMemberId || savingMap}
                onClick={handleSaveMapping}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                {savingMap && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan Hubungan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
