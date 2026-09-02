import React, { useState, useEffect } from 'react';
import { UserPlus, Search, PenSquare, Trash2, Loader2, CreditCard, Hash, Contact } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import ModalMember from '../components/ModalMember';

export default function MembersView({ tipe = 'siswa', classes = [], positions = [], onMembersUpdated }) {
  const isGuru = tipe === 'guru';
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState(null);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/members?tipe=${tipe}&search=${encodeURIComponent(search)}`);
      const result = await res.json();
      setMembers(result.data || []);
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [tipe, search]);

  const handleDelete = (id, nama) => {
    Swal.fire({
      title: `Hapus Data ${isGuru ? 'Guru' : 'Santri'}?`,
      html: `Apakah Anda yakin ingin menghapus <b>${nama}</b> dari sistem?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await apiFetch(`/api/members?id=${id}`, { method: 'DELETE' });
          const json = await res.json();
          if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Terhapus', text: json.message, timer: 1500, showConfirmButton: false });
            fetchMembers();
          } else {
            Swal.fire('Gagal', json.message, 'error');
          }
        } catch (e) {
          Swal.fire('Error', 'Gagal menghapus data.', 'error');
        }
      }
    });
  };

  return (
    <section className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Manajemen Data {isGuru ? 'Guru & Asatidz' : 'Santri & Siswa'}
          </h3>
          <p className="text-xs text-slate-500">
            {isGuru 
              ? 'Kelola data NIP, nama, kartu RFID, jabatan/tugas pengampu, dan kontak guru' 
              : 'Kelola data NIS, nama, kartu RFID, kelas/rombel, dan kontak santri'}
          </p>
        </div>
        <button 
          onClick={() => { setEditMember(null); setModalOpen(true); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-white text-xs font-semibold rounded-xl shadow-md transition-all ${
            isGuru ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah Data {isGuru ? 'Guru' : 'Santri'}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Total {isGuru ? 'Guru' : 'Santri'}:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isGuru ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-primary-50 text-primary-700 border-primary-200'
            }`}>
              {members.length} Orang
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Cari nama / ${isGuru ? 'NIP' : 'NIS'} / RFID / ${isGuru ? 'jabatan' : 'kelas'}...`} 
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4 w-36">{isGuru ? 'NIP' : 'NIS'}</th>
                <th className="py-3.5 px-4">Nama Lengkap & Kartu RFID</th>
                <th className="py-3.5 px-4">Tipe</th>
                <th className="py-3.5 px-4">{isGuru ? 'Jabatan / Mapel' : 'Kelas / Rombel'}</th>
                <th className="py-3.5 px-4">No. WhatsApp</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    <span>Memuat data...</span>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                    Belum ada data {isGuru ? 'guru' : 'santri'}. Silakan klik Tambah Data.
                  </td>
                </tr>
              ) : (
                members.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 text-center font-medium text-slate-400 text-xs">{idx + 1}</td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                      {m.nis_nip ? (
                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          {m.nis_nip}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 text-sm">{m.nama}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                          <CreditCard className="w-3 h-3 text-primary-500" /> RFID: {m.uid}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        m.tipe === 'guru' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'
                      }`}>
                        {m.tipe}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium text-xs">{m.kelas || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs font-mono">{m.no_hp || '-'}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button 
                          onClick={() => { setEditMember(m); setModalOpen(true); }}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" 
                          title="Edit"
                        >
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(m.id, m.nama)}
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

      {modalOpen && (
        <ModalMember 
          member={editMember}
          tipe={tipe}
          classes={classes}
          positions={positions}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchMembers}
        />
      )}
    </section>
  );
}
