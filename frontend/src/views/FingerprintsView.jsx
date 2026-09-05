import React, { useState, useEffect } from 'react';
import { 
  Fingerprint, 
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
  Sparkles
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import { isDemo, showDemoAlert } from '../utils/demo';

export default function FingerprintsView({ 
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

  const [fingerprints, setFingerprints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'unmapped' | 'mapped'

  // Modal Mapping State
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [selectedFp, setSelectedFp] = useState(null);
  const [targetMemberType, setTargetMemberType] = useState(isUmum ? 'guru' : 'siswa');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [savingMap, setSavingMap] = useState(false);

  const fetchFingerprints = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/fingerprints');
      const result = await res.json();
      setFingerprints(result.data || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFingerprints();
  }, []);

  // Open Modal Map
  const openMapModal = (fp) => {
    if (isDemoActive) {
      showDemoAlert('Menghubungkan sidik jari anggota');
      return;
    }
    setSelectedFp(fp);
    setSelectedMemberId(fp.member_id > 0 ? String(fp.member_id) : '');
    setTargetMemberType(fp.member?.tipe || 'siswa');
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
      const res = await apiFetch('/api/fingerprints/map', {
        method: 'POST',
        body: JSON.stringify({
          fingerprint_id: selectedFp.fingerprint_id,
          device_id: selectedFp.device_id,
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
        fetchFingerprints();
      } else {
        Swal.fire('Gagal', data.message || 'Terjadi kesalahan.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menghubungi server.', 'error');
    } finally {
      setSavingMap(false);
    }
  };

  // Unmap
  const handleUnmap = (fp) => {
    if (isDemoActive) {
      showDemoAlert('Melepas hubungan sidik jari');
      return;
    }
    Swal.fire({
      title: `Lepas Hubungan Sidik Jari Slot #${fp.fingerprint_id}?`,
      text: `Sidik jari tidak lagi terhubung ke ${fp.member?.nama || 'anggota'}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d97706',
      confirmButtonText: 'Ya, Lepas Hubungan',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch('/api/fingerprints/unmap', {
            method: 'POST',
            body: JSON.stringify({
              fingerprint_id: fp.fingerprint_id,
              device_id: fp.device_id
            })
          });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
            fetchFingerprints();
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal melepas mapping.', 'error');
        }
      }
    });
  };

  // Delete Fingerprint Record
  const handleDelete = (fp) => {
    if (isDemoActive) {
      showDemoAlert('Menghapus data sidik jari');
      return;
    }
    Swal.fire({
      title: `Hapus Sidik Jari Slot #${fp.fingerprint_id}?`,
      html: `Data sidik jari slot <b>#${fp.fingerprint_id}</b> (${fp.member?.nama || 'Belum Terhubung'}) akan dihapus dari server database.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus Sekarang',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/fingerprints?id=${fp.id}&fingerprint_id=${fp.fingerprint_id}&device_id=${encodeURIComponent(fp.device_id || 'PRESENSI-V1')}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ 
              icon: 'success', 
              title: 'Sidik Jari Dihapus!', 
              html: `Data sidik jari slot <b>#${fp.fingerprint_id}</b> telah berhasil dihapus dari server.<br><br><div class="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs text-left border border-amber-200"><strong>⚠️ PENTING: Silakan RESTART Mesin Presensi</strong><br>Agar slot sidik jari ini otomatis terhapus dari memori fisik sensor saat booting sinkronisasi.</div>`,
              confirmButtonColor: '#0284c7',
              confirmButtonText: 'Mengerti'
            });
            fetchFingerprints();
          } else {
            Swal.fire('Gagal', data.message || 'Gagal menghapus data.', 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        }
      }
    });
  };

  // Filter & Search
  const filteredList = fingerprints.filter(fp => {
    if (filterStatus === 'unmapped' && fp.status === 'mapped') return false;
    if (filterStatus === 'mapped' && fp.status !== 'mapped') return false;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const slotMatch = String(fp.fingerprint_id).includes(q);
      const devMatch = (fp.device_id || '').toLowerCase().includes(q);
      const nameMatch = (fp.member?.nama || '').toLowerCase().includes(q);
      const nisMatch = (fp.member?.nis_nip || '').toLowerCase().includes(q);
      const classMatch = (fp.member?.kelas || '').toLowerCase().includes(q);
      return slotMatch || devMatch || nameMatch || nisMatch || classMatch;
    }
    return true;
  });

  const totalCount = fingerprints.length;
  const mappedCount = fingerprints.filter(f => f.status === 'mapped').length;
  const unmappedCount = fingerprints.filter(f => f.status !== 'mapped').length;

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
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-primary-600" />
            <span>Perekaman & Mapping Sidik Jari (Fingerprint)</span>
          </h3>
          <p className="text-xs text-slate-500">
            Daftar slot sidik jari yang terekam dari mesin dan hubungkan ke data {isUmum ? 'Pegawai' : `${labelSiswa} / ${labelGuru}`}
          </p>
        </div>

        <button 
          onClick={fetchFingerprints}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-all self-start sm:self-auto"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary-600' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xl flex-shrink-0">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Sidik Jari di Sensor</p>
            <h3 className="text-2xl font-bold text-slate-800">{totalCount} <span className="text-xs font-normal text-slate-400">Slot</span></h3>
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
            <h3 className="text-2xl font-bold text-amber-600">{unmappedCount} <span className="text-xs font-normal text-slate-400">Slot</span></h3>
          </div>
        </div>
      </div>

      {/* 3. TABLE SECTION */}
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
              Sudah Terhubung ({mappedCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari slot # / nama / NIS / NIP..." 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-16">Slot ID</th>
                <th className="py-3.5 px-4 w-36">ID Perangkat</th>
                <th className="py-3.5 px-4 w-36">Status</th>
                <th className="py-3.5 px-4">Data Anggota Terhubung</th>
                <th className="py-3.5 px-4">Kategori</th>
                <th className="py-3.5 px-4">Kelas / Jabatan</th>
                <th className="py-3.5 px-4 text-center w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && fingerprints.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data sidik jari...</span>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400 text-xs">
                    <Fingerprint className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p>Tidak ada data slot sidik jari yang sesuai filter.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Rekam sidik jari baru melalui mesin presensi (Tap Master 1x) untuk menambahkan data ke sistem.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((fp) => {
                  const isMapped = fp.status === 'mapped' && fp.member;

                  return (
                    <tr key={fp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-mono font-bold text-xs bg-primary-50 text-primary-700 border border-primary-200">
                          #{fp.fingerprint_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-medium text-slate-600">
                        {fp.device_id || 'PRESENSI-V1'}
                      </td>
                      <td className="py-3.5 px-4">
                        {isMapped ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Terhubung
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Belum Terhubung
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isMapped ? (
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{fp.member.nama}</p>
                            <p className="text-xs text-slate-500 font-mono mt-0.5">
                              {fp.member.tipe === 'guru' ? 'NIP: ' : 'NIS: '} {fp.member.nis_nip || '-'} • RFID: {fp.member.uid}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">-- Belum Dimapping ke Pengguna --</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isMapped ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            fp.member.tipe === 'guru' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'
                          }`}>
                            {fp.member.tipe}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                        {isMapped ? (fp.member.kelas || '-') : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Button Map / Re-Map */}
                          <button
                            onClick={() => openMapModal(fp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 transition-colors"
                            title={isUmum ? 'Hubungkan ke data Pegawai' : `Hubungkan ke data ${labelSiswa} / ${labelGuru}`}
                          >
                            <Link className="w-3.5 h-3.5" />
                            <span>{isMapped ? 'Ubah' : 'Hubungkan'}</span>
                          </button>

                          {/* Button Unlink */}
                          {isMapped && (
                            <button
                              onClick={() => handleUnmap(fp)}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Lepas Hubungan"
                            >
                              <Unlink className="w-4 h-4" />
                            </button>
                          )}

                          {/* Button Delete */}
                          <button
                            onClick={() => handleDelete(fp)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Hapus Data Slot"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* 4. MODAL MAPPING FINGERPRINT */}
      {mapModalOpen && selectedFp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm modal">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-primary-600" />
                <span>Hubungkan Sidik Jari Slot #{selectedFp.fingerprint_id}</span>
              </h3>
              <button onClick={() => setMapModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="space-y-4">
              {/* Info Slot */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block">Slot Sidik Jari:</span>
                  <span className="font-bold text-slate-800 font-mono text-sm">Slot #{selectedFp.fingerprint_id}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">ID Perangkat Mesin:</span>
                  <span className="font-bold text-slate-800 font-mono">{selectedFp.device_id}</span>
                </div>
              </div>

              {/* Pilihan Kategori Siswa atau Guru (Disembunyikan jika Mode Umum) */}
              {!isUmum ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Pilih Kategori Anggota
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setTargetMemberType('siswa'); setSelectedMemberId(''); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        targetMemberType === 'siswa'
                          ? 'bg-sky-50 text-sky-700 border-sky-300 ring-2 ring-sky-500/20'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>{labelSiswa}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setTargetMemberType('guru'); setSelectedMemberId(''); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        targetMemberType === 'guru'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300 ring-2 ring-indigo-500/20'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Briefcase className="w-4 h-4" />
                      <span>{labelGuru}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-primary-50/70 p-3 rounded-xl border border-primary-200 text-xs font-semibold text-primary-800 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary-600" />
                  <span>Target Mapping: Data Pegawai</span>
                </div>
              )}

              {/* Search Member Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cari & Pilih Nama {targetMemberType === 'guru' ? labelGuru : labelSiswa}
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder={`Ketik nama / ${targetMemberType === 'guru' ? 'NIP' : 'NIS'}...`}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* List Radio Selection */}
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                  {availableMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Tidak ditemukan data {targetMemberType === 'guru' ? labelGuru : labelSiswa}.
                    </div>
                  ) : (
                    availableMembers.map(m => (
                      <label 
                        key={m.id} 
                        className={`flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer text-xs transition-colors ${
                          selectedMemberId === String(m.id) ? 'bg-primary-50/60 font-semibold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="radio" 
                            name="selectedMember" 
                            value={m.id}
                            checked={selectedMemberId === String(m.id)}
                            onChange={(e) => setSelectedMemberId(e.target.value)}
                            className="text-primary-600 focus:ring-primary-500"
                          />
                          <div>
                            <p className="text-slate-800 font-bold">{m.nama}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {m.tipe === 'guru' ? 'NIP: ' : 'NIS: '} {m.nis_nip || '-'} • {m.kelas || '-'}
                            </p>
                          </div>
                        </div>

                        {m.fingerprint_id > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            Slot #{m.fingerprint_id}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setMapModalOpen(false)} 
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={savingMap || !selectedMemberId}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                  <span>Simpan Hubungan Mapping</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
