import React, { useState, useEffect } from 'react';
import { X, PlusCircle, PenSquare, Lock, UserCheck, Clock } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function ModalAttendance({ 
  item = null, 
  members = [], 
  onClose, 
  onSuccess,
  defaultDate = ''
}) {
  const isEdit = !!(item && item.id);
  const today = defaultDate || new Date().toISOString().split('T')[0];
  const nowTime = new Date().toTimeString().split(' ')[0];

  const [selectedType, setSelectedType] = useState(item?.tipe || 'siswa');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  
  const [formData, setFormData] = useState({
    id: item?.id || '',
    nama: item?.nama || '',
    uid: item?.uid || '',
    tipe: item?.tipe || 'siswa',
    kelas: item?.kelas || '',
    tanggal: item?.tanggal || today,
    waktu_masuk: (item?.waktu_masuk && item?.waktu_masuk !== '-') ? item.waktu_masuk : (isEdit ? '' : nowTime),
    status_masuk: item?.status_masuk || 'tepat',
    waktu_keluar: (item?.waktu_keluar && item?.waktu_keluar !== '-') ? item.waktu_keluar : '',
    status_keluar: item?.status_keluar || '-',
    id_mesin: item?.id_mesin || (isEdit ? 'GATE-01' : 'MANUAL')
  });

  const [loading, setLoading] = useState(false);

  const filteredMembers = members.filter(
    m => (m.tipe || 'siswa').toLowerCase() === selectedType.toLowerCase()
  );

  const handleTypeChange = (t) => {
    setSelectedType(t);
    setSelectedMemberId('');
    setFormData(prev => ({
      ...prev,
      tipe: t,
      nama: '',
      uid: '',
      kelas: ''
    }));
  };

  const handleMemberSelect = (memberId) => {
    setSelectedMemberId(memberId);
    if (!memberId) {
      setFormData(prev => ({ ...prev, nama: '', uid: '', kelas: '' }));
      return;
    }
    const m = members.find(item => item.id.toString() === memberId.toString());
    if (m) {
      setFormData(prev => ({
        ...prev,
        nama: m.nama,
        uid: m.uid,
        tipe: m.tipe,
        kelas: m.kelas || '-'
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nama) {
      Swal.fire('Peringatan', 'Silakan pilih anggota dari Data Master terlebih dahulu.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        uid: formData.uid || 'MANUAL',
        nama: formData.nama,
        tipe: formData.tipe,
        kelas: formData.kelas,
        tanggal: formData.tanggal,
        waktu_masuk: formData.waktu_masuk || '-',
        status_masuk: formData.status_masuk,
        waktu_keluar: formData.waktu_keluar || '-',
        status_keluar: formData.status_keluar,
        id_mesin: formData.id_mesin || 'MANUAL'
      };

      if (isEdit) payload.id = parseInt(formData.id);

      const res = await apiFetch('/api/attendance', {
        method,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil',
          text: data.message,
          timer: 1500,
          showConfirmButton: false
        });
        onSuccess();
        onClose();
      } else {
        Swal.fire('Gagal', data.message || 'Terjadi kesalahan.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.message || 'Gagal menghubungi server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm modal">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            {isEdit ? (
              <>
                <PenSquare className="w-5 h-5 text-primary-600" />
                <span>Edit Presensi ({formData.nama})</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-5 h-5 text-emerald-600" />
                <span>Tambah Presensi Manual</span>
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* STEP PILIH MASTER (Hanya Mode Tambah) */}
          {!isEdit && (
            <div className="p-3.5 bg-primary-50/70 border border-primary-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-800 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" /> Pilih dari Data Master
                </span>
                <span className="text-[10px] text-primary-600 font-medium">1. Pilih Tipe & Anggota</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipe Anggota</label>
                  <select 
                    value={selectedType} 
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="siswa">Santri / Siswa</option>
                    <option value="guru">Guru / Ustadz</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Pilih Nama Anggota</label>
                  <select 
                    value={selectedMemberId} 
                    onChange={(e) => handleMemberSelect(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- Pilih Anggota --</option>
                    {filteredMembers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nama} ({m.kelas || m.uid})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* IDENTITAS ANGGOTA (LOCKED/READONLY) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Identitas Anggota</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                {isEdit ? 'Data Terkunci' : 'Auto-Fill dari Master'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nama Lengkap</label>
              <input 
                type="text" 
                value={formData.nama} 
                required 
                readOnly 
                placeholder="Otomatis terisi saat memilih anggota" 
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">UID Kartu RFID</label>
                <input 
                  type="text" 
                  value={formData.uid} 
                  readOnly 
                  placeholder="-" 
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kelas / Jabatan</label>
                <input 
                  type="text" 
                  value={formData.kelas} 
                  readOnly 
                  placeholder="-" 
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* EDIT JAM & STATUS PRESENSI */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Edit Jam & Status Presensi
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Tanggal Absensi <span className="text-rose-500">*</span>
              </label>
              <input 
                type="date" 
                value={formData.tanggal} 
                onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                required 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Waktu Masuk</label>
                <input 
                  type="time" 
                  step="1" 
                  value={formData.waktu_masuk} 
                  onChange={(e) => setFormData({ ...formData, waktu_masuk: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Status Masuk</label>
                <select 
                  value={formData.status_masuk} 
                  onChange={(e) => setFormData({ ...formData, status_masuk: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
                >
                  <option value="tepat">Tepat Waktu</option>
                  <option value="telat">Terlambat</option>
                  <option value="izin">Izin</option>
                  <option value="sakit">Sakit</option>
                  <option value="-">-</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Waktu Keluar</label>
                <input 
                  type="time" 
                  step="1" 
                  value={formData.waktu_keluar} 
                  onChange={(e) => setFormData({ ...formData, waktu_keluar: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Status Keluar</label>
                <select 
                  value={formData.status_keluar} 
                  onChange={(e) => setFormData({ ...formData, status_keluar: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
                >
                  <option value="-">-</option>
                  <option value="tepat">Tepat Waktu</option>
                  <option value="cepat">Pulang Cepat</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">ID Mesin / Keterangan</label>
              <input 
                type="text" 
                value={formData.id_mesin} 
                onChange={(e) => setFormData({ ...formData, id_mesin: e.target.value })}
                placeholder="GATE-01 / Manual" 
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Batal
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Simpan Absensi')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
