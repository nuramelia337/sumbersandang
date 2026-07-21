import { useEffect, useState } from 'react';
import { Download, Loader2, Plus, Shield, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ActivityLog, AdminProfile } from '../../lib/types';
import { downloadJson, loadActivityLogs, loadAdminProfiles, loadBackupData, logActivity } from '../../lib/business';
import { formatDateTime } from '../../lib/constants';
import { useAlert } from '../../components/AlertProvider';

export default function AdminManagement() {
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [adminSaving, setAdminSaving] = useState(false);
  const { showAlert, showConfirm } = useAlert();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [profiles, activity] = await Promise.all([loadAdminProfiles(), loadActivityLogs()]);
    setAdmins(profiles);
    setLogs(activity);
    setLoading(false);
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSaving(true);
    const { data, error } = await supabase.functions.invoke('create-admin', {
      body: {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
      },
    });
    if (error || data?.error) showAlert({ title: 'Gagal tambah admin', message: data?.error || error?.message || 'Gagal membuat akun admin.', variant: 'error' });
    else {
      setForm({ email: '', password: '', full_name: '' });
      loadData();
    }
    setAdminSaving(false);
  };

  const toggleAdmin = async (admin: AdminProfile) => {
    await supabase.from('admin_profiles').update({ is_active: !admin.is_active, updated_at: new Date().toISOString() }).eq('id', admin.id);
    await logActivity('admin_profile_toggled', 'admin_profile', admin.id, `Toggled admin profile: ${admin.email}`);
    loadData();
  };

  const deleteAdmin = async (admin: AdminProfile) => {
    showConfirm({
      title: 'Hapus profil admin?',
      message: `Profil ${admin.email} akan dihapus.`,
      variant: 'error',
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        const { data, error } = await supabase.functions.invoke('delete-admin', {
          body: { admin_id: admin.id },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal menghapus admin.');
        setAdmins((prev) => prev.filter((item) => item.id !== admin.id));
        loadData();
      },
    });
  };

  const backup = async () => {
    setBackupLoading(true);
    const data = await loadBackupData();
    downloadJson(`sumber-sandang-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    await logActivity('database_backup_exported', 'backup', undefined, 'Exported database backup JSON');
    setBackupLoading(false);
  };

  if (loading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Admin</h1>
          <p className="text-sm text-neutral-500">Multi-admin, log aktivitas, dan backup database</p>
        </div>
        <button onClick={backup} disabled={backupLoading} className="btn-primary w-full sm:w-auto">
          {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download size={18} />} Backup Database
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 font-serif text-lg font-bold">Tambah Profil Admin</h2>
          <p className="mb-4 text-xs text-neutral-500">Buat akun admin langsung dari sini. Admin baru bisa login memakai email dan password yang dibuat.</p>
          <form onSubmit={addAdmin} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Nama</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Password Sementara</label>
              <input required minLength={6} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" placeholder="Minimal 6 karakter" />
            </div>
            <button disabled={adminSaving} className="btn-primary disabled:opacity-50">
              {adminSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={18} />} Buat Admin
            </button>
          </form>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="font-serif text-lg font-bold">Daftar Admin</h2>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {admins.map((admin) => (
              <div key={admin.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-neutral-800">
                    <Shield size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{admin.full_name || admin.email}</p>
                    <p className="text-xs text-neutral-500">{admin.email} · {admin.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <button type="button" onClick={() => toggleAdmin(admin)} className={`badge min-h-9 justify-center px-3 ${admin.is_active ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-500'}`}>
                    {admin.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                  {admin.id !== currentUserId && admin.role !== 'owner' && (
                    <button type="button" onClick={() => deleteAdmin(admin)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-error-600 hover:bg-error-50"><Trash2 size={16} /> <span className="text-sm font-semibold">Hapus</span></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="font-serif text-lg font-bold">Log Aktivitas Admin</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left">Waktu</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">Aksi</th>
                <th className="px-4 py-3 text-left">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-xs text-neutral-500">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{log.admin_profiles?.full_name || log.admin_profiles?.email || 'System'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{log.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
