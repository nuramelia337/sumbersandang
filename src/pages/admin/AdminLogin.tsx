import { useState } from 'react';
import { BRAND } from '../../lib/constants';
import { Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const ADMIN_USERNAME = 'sumber sandang';
const ADMIN_PASSWORD = '12345';

export default function AdminLogin({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.trim().toLowerCase() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_auth', 'true');
      onLogin();
    } else {
      setError('Username atau password salah');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-accent-50 px-4 dark:from-neutral-900 dark:to-neutral-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={BRAND.logo}
            alt="Sumber Sandang"
            className="mx-auto h-20 w-20 rounded-full object-cover ring-4 ring-primary-200"
          />
          <h1 className="mt-4 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Admin Panel
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Sumber Sandang Management System</p>
        </div>

        <div className="card p-8">
          <h2 className="mb-6 text-center font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">
            Masuk ke Admin
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/30 dark:text-error-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Username</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  required
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field pl-10"
                  placeholder="sumber sandang"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  required
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              Masuk
              <ArrowRight size={18} />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
