import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Search, PenSquare, Trash2, Loader2, X, Award } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function PositionsView({ onUpdated }) {
  const [positions, setPositions] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const [formData, setFormData] = useState({ id: '', nama: '', keterangan: '' });
  const [saving, setSaving] = useState(false);

  const fetchPositions = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/positions');
      const data = await res.json();
      setPositions(data.data || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, []);

  const openAdd = () => {
    setEditItem(null);
    setFormData({ id: '', nama: '', keterangan: '' });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditItem(p);
    setFormData({ id: p.id, nama: p.nama, keterangan: p.keterangan || '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nama.trim()) {
      Swal.fire('Peringatan', 'Nama jabatan / mapel wajib diisi.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const method = editItem ? 'PUT' : 'POST';
      const payload = {
        nama: formData.nama.trim(),
        keterangan: formData.keterangan.trim()
      };
      if (editItem) payload.id = parseInt(formData.id);

      const res = await apiFetch('/api/positions', {
        method,
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
        setModalOpen(false);
        fetchPositions();
      } else {
        Swal.fire('Gagal', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan jabatan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, nama) => {
    Swal.fire({
      title: 'Hapus Jabatan?',
      html: `Apakah Anda yakin ingin menghapus jabatan <b>${nama}</b>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/positions?id=${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Terhapus', text: data.message, timer: 1500, showConfirmButton: false });
            fetchPositions();
          } else {
            Swal.fire('Gagal', data.message, 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghapus jabatan.', 'error');
        }
      }
    });
  };

  const filtered = positions.filter(p => 
    p.nama.toLowerCase().includes(search.toLowerCase().trim()) ||
    (p.keterangan || '').toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Manajemen Master Data Jabatan / Mapel Guru</h3>
          <p className="text-xs text-slate-500">Kelola daftar jabatan, mata pelajaran, dan tugas pengampu guru / asatidz</p>
        </div>
        <button 
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Jabatan Baru</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Total Posisi:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {positions.length} Jabatan
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari jabatan / tugas..." 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4">Nama Jabatan / Mapel</th>
                <th className="py-3.5 px-4">Keterangan / Tugas</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && positions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data jabatan...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-400 text-xs">
                    Belum ada data jabatan. Silakan klik Tambah Jabatan.
                  </td>
                </tr>
              ) : (
                filtered.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-center font-medium text-slate-400 text-xs">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-600" />
                      <span>{p.nama}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.keterangan || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button 
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" 
                          title="Edit"
                        >
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, p.nama)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM JABATAN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm modal">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <span>{editItem ? 'Edit Data Jabatan' : 'Tambah Jabatan Baru'}</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Jabatan / Tugas Guru <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.nama} 
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  required 
                  placeholder="Contoh: Guru Fiqih & Hadits" 
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan / Deskripsi Tugas</label>
                <input 
                  type="text" 
                  value={formData.keterangan} 
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  placeholder="Contoh: Pengampu Pelajaran Fiqih Tingkat Aliyah" 
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)} 
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : (editItem ? 'Simpan Perubahan' : 'Simpan Jabatan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
