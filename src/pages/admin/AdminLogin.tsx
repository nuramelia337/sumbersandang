import { useState } from 'react';
import { BRAND } from '../../lib/constants';
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.user) {
      setError(signInError?.message || 'Email atau password salah');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('id, is_active')
      .eq('id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      setError('Akun belum terdaftar sebagai admin aktif.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-accent-50 px-4 dark:from-secondary-900 dark:to-secondary-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={BRAND.logo} alt="Sumber Sandang" className="mx-auto h-24 w-24 rounded-2xl bg-white object-contain p-2 ring-4 ring-accent-200" />
          <h1 className="mt-4 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Admin Panel</h1>
          <p className="mt-1 text-sm text-neutral-500">Sumber Sandang Management System</p>
        </div>

        <div className="card p-8">
          <h2 className="mb-6 text-center font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">Masuk ke Admin</h2>

          {error && <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/30 dark:text-error-400">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field pl-10" placeholder="admin@sumbersandang.id" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input required type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pl-10 pr-10" placeholder="Password admin" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight size={18} />}
              Masuk
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Admin pertama dibuat di Supabase Auth dan diberi row di tabel admin_profiles.
        </p>
      </div>
    </div>
  );
}
