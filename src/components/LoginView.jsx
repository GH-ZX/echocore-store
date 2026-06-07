import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import EchoLogo from './EchoLogo';

export default function LoginView({ t, handleAuthLogin, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const userData = await handleAuthLogin(email, password);
      onLoginSuccess(userData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 animate-fade-in">
      <div className="bg-[#0a1329] p-10 rounded-3xl border border-cyan-900/30">
        <div className="text-center mb-10">
          <EchoLogo className="w-16 h-16 mx-auto mb-6" />
          <h2 className="text-3xl font-black text-white mb-2">{t.login}</h2>
        </div>
        <form onSubmit={onFormSubmit} className="space-y-6">
          {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm font-semibold text-center">{error}</div>}
          <div>
            <label className="text-slate-300 text-sm font-semibold flex items-center gap-2 mb-2"><Mail className="w-4 h-4 text-cyan-500" /> {t.email}</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-cyan-500 outline-none" />
          </div>
          <div>
            <label className="text-slate-300 text-sm font-semibold flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-cyan-500" /> {t.password}</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-cyan-500 outline-none" />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-4 rounded-xl font-bold shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:opacity-50">
            {isLoading ? '...' : t.login}
          </button>
        </form>
      </div>
    </div>
  );
}
