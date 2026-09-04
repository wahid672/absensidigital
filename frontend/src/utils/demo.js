import Swal from 'sweetalert2';

/**
 * Cek apakah aplikasi sedang dalam Mode Demo berdasarkan konfigurasi settings.
 */
export const isDemo = (settings) => {
  return !!(settings && (settings.demo_mode === 'true' || settings.demo_mode === true));
};

/**
 * Tampilkan modal pop up SweetAlert peringatan bahwa aksi tidak diizinkan dalam versi demo.
 */
export const showDemoAlert = (action = 'Aksi ini') => {
  Swal.fire({
    icon: 'warning',
    title: 'Versi Demo Aktif',
    html: `
      <div class="text-left space-y-2.5 text-xs text-slate-600 leading-relaxed">
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-semibold flex items-start gap-2">
          <span class="text-base leading-none mt-0.5">⚠️</span>
          <span><b>${action}</b> tidak diizinkan pada Versi Demo.</span>
        </div>
        <p class="text-slate-500">
          Aplikasi ini sedang berjalan dalam mode demonstrasi (<i>read-only</i>). Seluruh perubahan data master, pengaturan sistem, dan pencadangan database dikunci untuk menjaga integritas data demo.
        </p>
        <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
          💡 <b>Fitur yang tetap berfungsi normal:</b> Tambah presensi manual baru, uji coba kirim pesan Telegram, cetak PDF / ekspor data siswa & guru, serta seluruh endpoint mesin IoT ESP32.
        </div>
      </div>
    `,
    confirmButtonText: 'Saya Mengerti',
    confirmButtonColor: '#2563eb'
  });
};
