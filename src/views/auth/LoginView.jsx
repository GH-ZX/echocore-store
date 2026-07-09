import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mail, Lock, User } from 'lucide-react';
import EchoLogo from '../../components/ui/EchoLogo';

export default function LoginView({ t, lang = 'ar', handleAuthLogin, handleAuthSignup, onLoginSuccess }) {
  const location = useLocation();
  const redirectTo = typeof location.state?.from === 'string' ? location.state.from : '/';

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
          onLoginSuccess(result.userData, redirectTo);
        } else {
          setSuccessMsg(result.message || (t.createAccount + '. ' + (lang === 'ar' ? 'تحقق من بريدك الإلكتروني للتأكيد.' : 'Check your email to confirm.')));
          setIsSignup(false);
        }
      } else {
        const userData = await handleAuthLogin(email, password);
        onLoginSuccess(userData, redirectTo);
      }
    } catch (err) {
      setError(err.message || t.authError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in px-2">
      <div className="card p-6 sm:p-10">
        <div className="text-center mb-8">
          <EchoLogo className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5" />
          <h2 className="text-2xl sm:text-3xl font-black mb-1">{isSignup ? t.createAccount : t.login}</h2>
          <p className="text-[var(--text-sec)] text-sm">{t.loginDesc}</p>
        </div>

        <form onSubmit={onFormSubmit} className="space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-3 rounded-xl text-sm font-semibold">{error}</div>}
          {successMsg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl text-sm">{successMsg}</div>}

          {isSignup && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <User className="w-4 h-4 text-[var(--accent)]" /> {t.yourName}
              </label>
              <input 
                type="text" 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="input w-full" 
                placeholder={t.yourName} 
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
            {isLoading ? (t.processing || '...') : (isSignup ? t.createAccount : t.login)}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          {isSignup ? (
            <>{t.alreadyHaveAccount} <button onClick={() => setIsSignup(false)} className="text-[var(--accent)] font-semibold hover:underline">{t.logInLink}</button></>
          ) : (
            <>{t.newHere} <button onClick={() => setIsSignup(true)} className="text-[var(--accent)] font-semibold hover:underline">{t.createAccount}</button></>
          )}
        </div>

        <div className="text-[10px] text-center text-[var(--text-muted)] mt-6">
          {t.demoStoreNote}
        </div>
      </div>
    </div>
  );
}

