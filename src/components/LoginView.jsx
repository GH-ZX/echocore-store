import { useState } from 'react';
import { Mail, Lock, User } from 'lucide-react';
import EchoLogo from './EchoLogo';

export default function LoginView({ t, handleAuthLogin, handleAuthSignup, onLoginSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (isSignup) {
        const result = await handleAuthSignup(email, password, name);
        if (result.autoLogin && result.userData) {
          // Email confirmation is disabled in Supabase → auto login
          onLoginSuccess(result.userData);
        } else {
          setSuccessMsg(result.message || 'Account created! Check your email to confirm.');
          setIsSignup(false);
        }
      } else {
        const userData = await handleAuthLogin(email, password);
        onLoginSuccess(userData);
      }
    } catch (err) {
      setError(err.message || t.authError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 animate-fade-in">
      <div className="card p-10">
        <div className="text-center mb-8">
          <EchoLogo className="w-16 h-16 mx-auto mb-5" />
          <h2 className="text-3xl font-black mb-1">{isSignup ? 'Create Account' : t.login}</h2>
          <p className="text-[var(--text-sec)] text-sm">{t.loginDesc}</p>
        </div>

        <form onSubmit={onFormSubmit} className="space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-3 rounded-xl text-sm font-semibold">{error}</div>}
          {successMsg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl text-sm">{successMsg}</div>}

          {isSignup && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <User className="w-4 h-4 text-[var(--accent)]" /> Name
              </label>
              <input 
                type="text" 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="input w-full" 
                placeholder="Your name" 
              />
            </div>
          )}

          <div>
            <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
              <Mail className="w-4 h-4 text-[var(--accent)]" /> {t.email}
            </label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="input w-full" 
            />
          </div>

          <div>
            <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
              <Lock className="w-4 h-4 text-[var(--accent)]" /> {t.password}
            </label>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="input w-full" 
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading} 
            className="btn btn-primary w-full py-4 disabled:opacity-60"
          >
            {isLoading ? '...' : (isSignup ? 'Create Account' : t.login)}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          {isSignup ? (
            <>Already have an account? <button onClick={() => setIsSignup(false)} className="text-[var(--accent)] font-semibold hover:underline">Log in</button></>
          ) : (
            <>New here? <button onClick={() => setIsSignup(true)} className="text-[var(--accent)] font-semibold hover:underline">Create account</button></>
          )}
        </div>

        <div className="text-[10px] text-center text-[var(--text-muted)] mt-6">
          Demo store — Use any email. Create an admin in Supabase dashboard.
        </div>
      </div>
    </div>
  );
}

