import React, { useState } from 'react';
import { X, UserPlus, PenSquare, CreditCard, GraduationCap, Briefcase, Hash, Fingerprint } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function ModalMember({ 
  member = null, 
  tipe = 'siswa', 
  classes = [],
  positions = [],
  appMode = 'pesantren',
  onClose, 
  onSuccess 
}) {
  const isEdit = !!(member && member.id);
  const isGuru = tipe === 'guru';
  const isUmum = appMode === 'umum';
  const isPesantren = appMode === 'pesantren';

  const labelMember = isUmum
    ? 'Pegawai'
    : isGuru 
    ? (isPesantren ? 'Guru / Asatidz' : 'Guru / Pendidik') 
    : (isPesantren ? 'Santri' : 'Siswa');

  const labelIdNumber = isUmum ? 'NIP / NIK Pegawai' : isGuru ? 'NIP (Nomor Induk Pegawai / Guru)' : (isPesantren ? 'NIS (Nomor Induk Santri)' : 'NIS (Nomor Induk Siswa)');
  const labelGroup = isUmum ? 'Jabatan / Divisi' : isGuru ? 'Jabatan / Tugas Mengajar' : 'Pilih Kelas / Rombel';

  const [formData, setFormData] = useState({
    id: member?.id || '',
    uid: member?.uid || '',
    fingerprint_id: member?.fingerprint_id || '',
    nis_nip: member?.nis_nip || '',
    nama: member?.nama || '',
    tipe: member?.tipe || tipe,
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

    if (!formData.kelas.trim()) {
      Swal.fire('Peringatan', `Silakan pilih ${isGuru ? 'Jabatan / Mapel' : 'Kelas'} terlebih dahulu.`, 'warning');
      return;
    }

    setLoading(true);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        uid: formData.uid.trim(),
        fingerprint_id: formData.fingerprint_id ? parseInt(formData.fingerprint_id) : 0,
        nis_nip: formData.nis_nip.trim(),
        nama: formData.nama.trim(),
        tipe: tipe,
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
                <span>Edit Data {labelMember}</span>
              </>
            ) : (
              <>
                <UserPlus className={`w-5 h-5 ${isGuru ? 'text-indigo-600' : 'text-sky-600'}`} />
                <span>Tambah Data {labelMember}</span>
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Badge Kategori Terkunci */}
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">Kategori Pengguna:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
              isGuru ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-sky-100 text-sky-800 border border-sky-200'
            }`}>
              {labelMember}
            </span>
          </div>

          {/* INPUT NIS / NIP */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {labelIdNumber}
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={formData.nis_nip} 
                onChange={(e) => setFormData({ ...formData, nis_nip: e.target.value })}
                placeholder={isUmum ? 'Contoh: 1985071201' : isGuru ? 'Contoh: 198507122010011001' : 'Contoh: 20261001'} 
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              placeholder={isUmum ? 'Contoh: Hendra Wijaya, S.T.' : isGuru ? 'Contoh: Ustadz Ahmad Fauzi, S.Pd.I' : 'Contoh: Muhammad Rizky Pratama'} 
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* UID KARTU RFID & SLOT FINGERPRINT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                UID Kartu RFID <span className="text-rose-500">*</span>
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
                Slot Sidik Jari <span className="text-[10px] text-slate-400">(Opsional)</span>
              </label>
              <div className="relative">
                <Fingerprint className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="number" 
                  min="1"
                  max="500"
                  value={formData.fingerprint_id} 
                  onChange={(e) => setFormData({ ...formData, fingerprint_id: e.target.value })}
                  placeholder="Slot # (1-500)" 
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* DROPDOWN KELAS / JABATAN */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {labelGroup} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              {isUmum || isGuru ? (
                <Briefcase className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              ) : (
                <GraduationCap className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              )}
              <select 
                value={formData.kelas} 
                onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                required 
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
              >
                <option value="">-- Pilih {isUmum ? 'Jabatan / Divisi' : isGuru ? 'Jabatan / Mapel' : 'Kelas'} --</option>
                {isUmum || isGuru ? (
                  positions.map(p => (
                    <option key={p.id} value={p.nama}>
                      {p.nama} {p.keterangan ? `(${p.keterangan})` : ''}
                    </option>
                  ))
                ) : (
                  classes.map(c => (
                    <option key={c.id} value={c.nama}>
                      {c.nama} {c.keterangan ? `(${c.keterangan})` : ''}
                    </option>
                  ))
                )}
              </select>
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
              {loading ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : `Simpan ${labelMember}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
