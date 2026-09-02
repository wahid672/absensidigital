import React, { useState } from 'react';
import { X, UserPlus, PenSquare, CreditCard } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function ModalMember({ 
  member = null, 
  defaultType = 'siswa', 
  onClose, 
  onSuccess 
}) {
  const isEdit = !!(member && member.id);
  const [formData, setFormData] = useState({
    id: member?.id || '',
    uid: member?.uid || '',
    nama: member?.nama || '',
    tipe: member?.tipe || defaultType,
    kelas: member?.kelas || '',
    no_hp: member?.no_hp || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.uid.trim() || !formData.nama.trim()) {
      Swal.fire('Peringatan', 'UID Kartu RFID dan Nama Lengkap wajib diisi.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        uid: formData.uid.trim(),
        nama: formData.nama.trim(),
        tipe: formData.tipe,
        kelas: formData.kelas.trim(),
        no_hp: formData.no_hp.trim()
      };
      if (isEdit) payload.id = parseInt(formData.id);

      const res = await apiFetch('/api/members', {
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
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            {isEdit ? (
              <>
                <PenSquare className="w-5 h-5 text-primary-600" />
                <span>Edit Data {formData.nama}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5 text-primary-600" />
                <span>Tambah Data {formData.tipe === 'guru' ? 'Guru' : 'Santri'}</span>
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              UID Kartu RFID / Tag Fingerprint <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={formData.uid} 
                onChange={(e) => setFormData({ ...formData, uid: e.target.value.toUpperCase() })}
                required 
                placeholder="Contoh: A1B2C301" 
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              value={formData.nama} 
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              required 
              placeholder="Contoh: Muhammad Rizky" 
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Anggota</label>
              <select 
                value={formData.tipe} 
                onChange={(e) => setFormData({ ...formData, tipe: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="siswa">Santri / Siswa</option>
                <option value="guru">Guru / Ustadz</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas / Jabatan</label>
              <input 
                type="text" 
                value={formData.kelas} 
                onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                placeholder="10 IPA 1 / Guru Fiqih" 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp / HP</label>
            <input 
              type="text" 
              value={formData.no_hp} 
              onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })}
              placeholder="081234567890" 
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
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
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Simpan Data')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
