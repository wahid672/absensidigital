import React, { useState, useEffect } from 'react';
import { School, Plus, Search, PenSquare, Trash2, Loader2, X, BookOpen } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';

export default function ClassesView({ onUpdated }) {
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const [formData, setFormData] = useState({ id: '', nama: '', tingkat: '10', keterangan: '' });
  const [saving, setSaving] = useState(false);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/classes');
      const data = await res.json();
      setClasses(data.data || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const openAdd = () => {
    setEditItem(null);
    setFormData({ id: '', nama: '', tingkat: '10', keterangan: '' });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditItem(c);
    setFormData({ id: c.id, nama: c.nama, tingkat: c.tingkat || '10', keterangan: c.keterangan || '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nama.trim()) {
      Swal.fire('Peringatan', 'Nama kelas wajib diisi.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const method = editItem ? 'PUT' : 'POST';
      const payload = {
        nama: formData.nama.trim(),
        tingkat: formData.tingkat.trim(),
        keterangan: formData.keterangan.trim()
      };
      if (editItem) payload.id = parseInt(formData.id);

      const res = await apiFetch('/api/classes', {
        method,
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
        setModalOpen(false);
        fetchClasses();
      } else {
        Swal.fire('Gagal', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Gagal menyimpan kelas.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, nama) => {
    Swal.fire({
      title: 'Hapus Kelas?',
      html: `Apakah Anda yakin ingin menghapus kelas <b>${nama}</b>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/classes?id=${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Terhapus', text: data.message, timer: 1500, showConfirmButton: false });
            fetchClasses();
          } else {
            Swal.fire('Gagal', data.message, 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghapus kelas.', 'error');
        }
      }
    });
  };

  const filtered = classes.filter(c => 
    c.nama.toLowerCase().includes(search.toLowerCase().trim()) ||
    (c.keterangan || '').toLowerCase().includes(search.toLowerCase().trim()) ||
    (c.tingkat || '').toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Manajemen Master Data Kelas</h3>
          <p className="text-xs text-slate-500">Kelola daftar kelas dan rombel untuk pilihan dropdown santri/siswa</p>
        </div>
        <button 
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Kelas Baru</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Total Kelas:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              {classes.length} Kelas
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kelas / tingkat..." 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4 w-20 text-center">ID</th>
                <th className="py-3.5 px-4">Nama Kelas</th>
                <th className="py-3.5 px-4">Tingkat / Jenjang</th>
                <th className="py-3.5 px-4">Keterangan</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && classes.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data kelas...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                    Belum ada data kelas. Silakan klik Tambah Kelas.
                  </td>
                </tr>
              ) : (
                filtered.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-center font-medium text-slate-400 text-xs">{idx + 1}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-700 border border-slate-200">
                        #{c.id}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-primary-600" />
                      <span>{c.nama}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                        Kelas {c.tingkat}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{c.keterangan || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button 
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" 
                          title="Edit"
                        >
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(c.id, c.nama)}
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

      {/* MODAL FORM KELAS */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm modal">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <School className="w-5 h-5 text-primary-600" />
                <span>{editItem ? 'Edit Data Kelas' : 'Tambah Kelas Baru'}</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Kelas <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.nama} 
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  required 
                  placeholder="Contoh: 10 IPA 1" 
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat / Jenjang</label>
                <input 
                  type="text" 
                  value={formData.tingkat} 
                  onChange={(e) => setFormData({ ...formData, tingkat: e.target.value })}
                  placeholder="10 / 11 / 12 / Khusus" 
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan / Deskripsi</label>
                <input 
                  type="text" 
                  value={formData.keterangan} 
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  placeholder="Contoh: Kelas 10 Peminatan IPA 1" 
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
                  {saving ? 'Menyimpan...' : (editItem ? 'Simpan Perubahan' : 'Simpan Kelas')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
