import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  AtSign,
  Calendar,
  KeyRound,
  ArrowLeft,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import EchoLogo from '../../components/ui/EchoLogo';
import { supabase } from '../../lib/supabase';
import {
  signInWithGoogle,
  sendEmailOtp,
  verifyEmailOtp,
  verifySignupOtp,
  resendSignupConfirmation,
  requestPasswordReset,
  updatePassword,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  isPasswordRecoveryUrl,
  markPasswordRecoveryPending,
  setOAuthIntent,
  validatePasswordLength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../../lib/auth';
import {
  getDateOfBirthMax,
  getDateOfBirthMin,
  normalizeProfileDateOfBirth,
  normalizeProfileGender,
} from '../../lib/profile';
import { normalizeUsernameInput, validateUsername } from '../../lib/username';
import { checkUsernameAvailable, getUsernameErrorMessage } from '../../lib/usernameChange';

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginView({
  t,
  user = null,
  loadingAuth = false,
  navigate,
  siteStatus,
  handleAuthLogin,
  handleAuthSignup,
  onLoginSuccess,
  resolveUserAfterAuth,
}) {
  const maintenanceOn = !!siteStatus?.maintenanceEnabled;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
    ? location.state.from
    : '/';

  const authPath = String(location.pathname || '').replace(/\/+$/, '');
  const isSignupPath = authPath === '/signup' || authPath.endsWith('/signup');
  const isLoginPath = authPath === '/login' || authPath.endsWith('/login');

  const [mode, setMode] = useState(() => {
    if (isPasswordRecoveryUrl() || isPasswordRecoveryPending()) return 'recovery';
    const path = typeof window !== 'undefined'
      ? String(window.location.pathname || '').replace(/\/+$/, '')
      : '';
    if (path === '/signup' || path.endsWith('/signup')) return 'signup';
    return 'login';
  });
  const [loginMethod, setLoginMethod] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle' }); // idle|checking|ok|bad
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const otpInputRef = useRef(null);
  const usernameCheckTimer = useRef(null);

  const isRecoveryFlow = mode === 'recovery'
    || searchParams.get('recovery') === '1'
    || isPasswordRecoveryUrl()
    || isPasswordRecoveryPending();

  // Already signed in (customer or admin): show redirect screen, skip login form.
  // Password recovery is allowed while a session exists.
  useEffect(() => {
    if (loadingAuth || !user?.id || isRecoveryFlow) return undefined;
    const timer = window.setTimeout(() => {
      if (typeof navigate === 'function') {
        const dest = (redirectTo === '/login' || redirectTo === '/signup') ? '/' : redirectTo;
        navigate(dest, { replace: true });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [loadingAuth, user?.id, isRecoveryFlow, navigate, redirectTo]);

  // Keep mode in sync with /login vs /signup URL
  useEffect(() => {
    if (
      searchParams.get('recovery') === '1'
      || isPasswordRecoveryUrl()
      || isPasswordRecoveryPending()
    ) {
      return;
    }
    if (isSignupPath) {
      setMode((m) => (m === 'signup' || m === 'confirm' ? m : 'signup'));
    } else if (isLoginPath) {
      setMode((m) => (
        m === 'login' || m === 'forgot' || m === 'otp' || m === 'recovery' || m === 'confirm'
          ? m
          : 'login'
      ));
    }
  }, [isSignupPath, isLoginPath, searchParams]);

  useEffect(() => {
    if (
      searchParams.get('recovery') === '1'
      || isPasswordRecoveryUrl()
      || isPasswordRecoveryPending()
    ) {
      markPasswordRecoveryPending();
      setMode('recovery');
    }
  }, [searchParams]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending();
        setMode('recovery');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ((otpSent || mode === 'confirm') && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpSent, mode]);

  useEffect(() => () => {
    if (usernameCheckTimer.current) window.clearTimeout(usernameCheckTimer.current);
  }, []);

  useEffect(() => {
    if (mode !== 'signup') return undefined;
    const value = normalizeUsernameInput(username);
    if (!value) {
      setUsernameStatus({ state: 'idle' });
      return undefined;
    }
    const local = validateUsername(value);
    if (!local.ok) {
      setUsernameStatus({ state: 'bad', reason: local.code });
      return undefined;
    }
    setUsernameStatus({ state: 'checking' });
    if (usernameCheckTimer.current) window.clearTimeout(usernameCheckTimer.current);
    usernameCheckTimer.current = window.setTimeout(async () => {
      try {
        const result = await checkUsernameAvailable(value);
        if (!result.available) {
          setUsernameStatus({ state: 'bad', reason: result.reason || 'username_taken' });
        } else {
          setUsernameStatus({ state: 'ok', username: result.username || value });
        }
      } catch {
        // Network/RPC hiccup — allow submit; server will re-validate
        setUsernameStatus({ state: 'idle' });
      }
    }, 420);
    return () => {
      if (usernameCheckTimer.current) window.clearTimeout(usernameCheckTimer.current);
    };
  }, [username, mode]);

  const resetMessages = () => {
    setError('');
    setSuccessMsg('');
  };

  const assertPasswordLength = (value) => {
    const result = validatePasswordLength(value);
    if (!result.valid) {
      throw new Error(result.code === 'too_long' ? t.passwordMaxLength : t.passwordLengthRange);
    }
  };

  const finishAuth = async (authUser) => {
    const userData = await resolveUserAfterAuth(authUser);
    onLoginSuccess(userData, redirectTo);
  };

  const onGoogleLogin = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      // Survives OAuth redirect so we can warn if signup used an existing Gmail.
      setOAuthIntent(mode === 'signup' ? 'signup' : 'login');
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || t.googleSignInFailed);
      setIsLoading(false);
    }
  };

  const onFormSubmit = async (e) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        assertPasswordLength(password);
        if (password !== confirmPassword) {
          throw new Error(t.passwordMismatch);
        }
        const uname = normalizeUsernameInput(username);
        if (uname) {
          const format = validateUsername(uname);
          if (!format.ok) {
            throw new Error(getUsernameErrorMessage(format.code, t));
          }
          const availability = await checkUsernameAvailable(format.value);
          if (!availability.available) {
            throw new Error(getUsernameErrorMessage(availability.reason || 'username_taken', t));
          }
        }
        const dob = normalizeProfileDateOfBirth(dateOfBirth);
        if (!dob.ok) {
          throw new Error(t.dateOfBirthInvalid || t.authError);
        }
        const result = await handleAuthSignup(email, password, {
          name: name.trim(),
          username: uname,
          gender: normalizeProfileGender(gender),
          dateOfBirth: dob.value,
        });
        if (result.autoLogin && result.userData) {
          onLoginSuccess(result.userData, redirectTo);
        } else if (result.needsEmailConfirm) {
          // Stay here: enter code or open the confirmation link — don't dump to login.
          setMode('confirm');
          setOtpCode('');
          setOtpSent(true);
          setSuccessMsg(result.message || t.confirmEmailSent);
        } else {
          setSuccessMsg(result.message || t.confirmEmailSent);
          setMode('confirm');
          setOtpSent(true);
        }
        return;
      }

      if (mode === 'confirm') {
        if (!otpCode.trim()) {
          throw new Error(t.invalidOtpCode);
        }
        const { user } = await verifySignupOtp(email, otpCode);
        if (!user) throw new Error(t.invalidOtpCode);
        await finishAuth(user);
        return;
      }

      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setSuccessMsg(t.resetLinkSent);
        return;
      }

      if (mode === 'recovery') {
        assertPasswordLength(password);
        if (password !== confirmPassword) {
          throw new Error(t.passwordMismatch);
        }
        await updatePassword(password);
        clearPasswordRecoveryPending();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await finishAuth(user);
        setSuccessMsg(t.passwordUpdatedSuccess);
        return;
      }

      if (mode === 'otp') {
        if (!otpSent) {
          await sendEmailOtp(email, { shouldCreateUser: true });
          setOtpSent(true);
          setSuccessMsg(t.otpSentNotice);
          return;
        }

        const { user } = await verifyEmailOtp(email, otpCode);
        if (!user) throw new Error(t.invalidOtpCode);
        await finishAuth(user);
        return;
      }

      if (mode === 'login' && loginMethod === 'otp') {
        await sendEmailOtp(email, { shouldCreateUser: true });
        setMode('otp');
        setOtpSent(true);
        setSuccessMsg(t.otpSentNotice);
        return;
      }

      if (mode === 'login' && loginMethod === 'password') {
        assertPasswordLength(password);
      }

      const userData = await handleAuthLogin(email, password);
      onLoginSuccess(userData, redirectTo);
    } catch (err) {
      if (err?.code === 'email_not_confirmed') {
        setMode('confirm');
        setOtpSent(true);
        setSuccessMsg(t.emailNotConfirmed);
        setError('');
      } else {
        setError(err.message || t.authError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onResendConfirm = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      if (!email.trim()) throw new Error(t.authError);
      await resendSignupConfirmation(email);
      setSuccessMsg(t.confirmEmailResent);
    } catch (err) {
      setError(err.message || t.authError);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (next) => {
    resetMessages();
    setMode(next);
    setOtpSent(false);
    setOtpCode('');
    setPassword('');
    setConfirmPassword('');
    if (next !== 'signup') {
      setUsername('');
      setGender('');
      setDateOfBirth('');
      setUsernameStatus({ state: 'idle' });
    }
    if (typeof navigate === 'function') {
      const state = location.state;
      if (next === 'signup') {
        navigate('/signup', { replace: true, state });
      } else if (next === 'login' || next === 'forgot' || next === 'otp') {
        navigate('/login', { replace: true, state });
      }
    }
  };

  const usernameHint = () => {
    if (!username.trim() || usernameStatus.state === 'idle') return '';
    if (usernameStatus.state === 'checking') return t.usernameChecking;
    if (usernameStatus.state === 'ok') return t.usernameAvailable;
    if (usernameStatus.state === 'bad') {
      return getUsernameErrorMessage(usernameStatus.reason, t);
    }
    return '';
  };

  const title = () => {
    if (mode === 'signup') return t.createAccount;
    if (mode === 'confirm') return t.confirmEmailTitle;
    if (mode === 'forgot') return t.forgotPasswordTitle;
    if (mode === 'recovery') return t.newPasswordTitle;
    if (mode === 'otp') return t.signInWithOtpTitle;
    return t.login;
  };

  const subtitle = () => {
    if (mode === 'signup') return t.signupDesc;
    if (mode === 'confirm') return t.confirmEmailDesc;
    if (mode === 'forgot') return t.forgotPasswordDesc;
    if (mode === 'recovery') return t.newPasswordDesc;
    if (mode === 'otp') return otpSent ? t.otpSentDesc : t.otpDesc;
    return t.loginDesc;
  };

  const showGoogle = mode === 'login' || mode === 'signup';
  const showMethodTabs = mode === 'login';
  const showCodeInput = (mode === 'otp' && otpSent) || mode === 'confirm';

  if (loadingAuth) {
    return (
      <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in px-2">
        <div className="card p-8 sm:p-10 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto mb-4" />
          <p className="text-sm text-[var(--text-sec)]">{t.loading || '…'}</p>
        </div>
      </div>
    );
  }

  if (user?.id && !isRecoveryFlow) {
    return (
      <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in px-2">
        <div className="card p-8 sm:p-10 text-center">
          <EchoLogo className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5" />
          <h2 className="text-2xl sm:text-3xl font-black mb-2">
            {t.alreadyLoggedInTitle}
          </h2>
          <p className="text-[var(--text-sec)] text-sm mb-6 leading-relaxed">
            {t.alreadyLoggedInRedirect}
          </p>
          <div className="flex items-center justify-center gap-2 text-[var(--accent)] text-sm font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t.alreadyLoggedInRedirecting}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in px-2">
      <div className="card p-6 sm:p-10">
        <div className="text-center mb-8">
          <EchoLogo className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5" />
          <h2 className="text-2xl sm:text-3xl font-black mb-1">{title()}</h2>
          <p className="text-[var(--text-sec)] text-sm">{subtitle()}</p>
        </div>

        {maintenanceOn && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="font-bold text-amber-50 mb-1">{t.maintenanceLoginPageTitle}</div>
            <p className="leading-relaxed">{t.maintenanceLoginPageDesc}</p>
          </div>
        )}

        {showGoogle && (
          <>
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={isLoading}
              className="btn w-full py-3.5 bg-white text-gray-800 border border-[var(--border)] hover:bg-gray-50 disabled:opacity-60 flex items-center justify-center gap-3 font-semibold"
            >
              <GoogleIcon />
              {t.continueWithGoogle}
            </button>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                {t.orDivider}
              </span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>
          </>
        )}

        {showMethodTabs && (
          <div className="flex rounded-xl border border-[var(--border)] p-1 mb-5 bg-[var(--bg-primary)]/50">
            <button
              type="button"
              onClick={() => { setLoginMethod('password'); resetMessages(); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                loginMethod === 'password'
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--text-sec)] hover:text-white'
              }`}
            >
              {t.passwordTab}
            </button>
            <button
              type="button"
              onClick={() => { setLoginMethod('otp'); resetMessages(); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                loginMethod === 'otp'
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--text-sec)] hover:text-white'
              }`}
            >
              {t.emailOtp}
            </button>
          </div>
        )}

        <form onSubmit={onFormSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-3 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl text-sm">
              {successMsg}
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div>
                <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                  <User className="w-4 h-4 text-[var(--accent)]" /> {t.yourName}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  className="input w-full"
                  placeholder={t.yourName}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                  <AtSign className="w-4 h-4 text-[var(--accent)]" /> {t.profileUsername}
                </label>
                <div className="relative" dir="ltr">
                  <span className="absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)] font-mono text-sm pointer-events-none">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
                    maxLength={20}
                    className="input w-full font-mono pl-7 pr-10 text-left"
                    dir="ltr"
                    placeholder={t.profileUsernamePlaceholder}
                    autoComplete="username"
                    spellCheck={false}
                    aria-invalid={usernameStatus.state === 'bad'}
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                    {usernameStatus.state === 'checking' && (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                    )}
                    {usernameStatus.state === 'ok' && (
                      <Check className="w-4 h-4 text-emerald-400" aria-hidden />
                    )}
                    {usernameStatus.state === 'bad' && (
                      <X className="w-4 h-4 text-red-400" aria-hidden />
                    )}
                  </span>
                </div>
                {usernameHint() ? (
                  <p className={`text-[10px] mt-1 ${
                    usernameStatus.state === 'ok'
                      ? 'text-emerald-400'
                      : usernameStatus.state === 'bad'
                        ? 'text-red-400'
                        : 'text-[var(--text-muted)]'
                  }`}
                  >
                    {usernameHint()}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                  <Calendar className="w-4 h-4 text-[var(--accent)]" /> {t.dateOfBirth}
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  min={getDateOfBirthMin()}
                  max={getDateOfBirthMax()}
                  className="input w-full text-left"
                  dir="ltr"
                  autoComplete="bday"
                />
              </div>

              <div>
                <span className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                  {t.gender}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'male', label: t.genderMale },
                    { id: 'female', label: t.genderFemale },
                  ].map((opt) => {
                    const active = gender === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setGender((prev) => (prev === opt.id ? '' : opt.id))}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)] hover:border-[var(--accent)]/40'
                        }`}
                        aria-pressed={active}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {(mode !== 'recovery') && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <Mail className="w-4 h-4 text-[var(--accent)]" /> {t.email}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full text-left"
                dir="ltr"
                autoComplete="email"
                disabled={(mode === 'otp' && otpSent) || mode === 'confirm'}
              />
            </div>
          )}

          {showCodeInput && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <KeyRound className="w-4 h-4 text-[var(--accent)]" /> {t.verificationCode}
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required={mode === 'otp'}
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="input w-full text-center text-2xl tracking-[0.35em] font-mono"
                placeholder="000000"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                {mode === 'otp' && (
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtpCode(''); resetMessages(); }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {t.sendNewCode}
                  </button>
                )}
                {mode === 'confirm' && (
                  <button
                    type="button"
                    onClick={onResendConfirm}
                    disabled={isLoading}
                    className="text-xs text-[var(--accent)] hover:underline disabled:opacity-60"
                  >
                    {t.resendConfirmEmail}
                  </button>
                )}
              </div>
              {mode === 'confirm' && (
                <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  {t.confirmEmailLinkHint}
                </p>
              )}
            </div>
          )}

          {(mode === 'login' && loginMethod === 'password') || mode === 'signup' || mode === 'recovery' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold flex items-center gap-2 text-[var(--text-sec)]">
                  <Lock className="w-4 h-4 text-[var(--accent)]" />
                  {mode === 'recovery' ? t.newPasswordLabel : t.password}
                </label>
                {mode === 'login' && loginMethod === 'password' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {t.forgotPassword}
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full text-left"
                dir="ltr"
                autoComplete={mode === 'recovery' ? 'new-password' : mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          ) : null}

          {mode === 'recovery' && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> {t.confirmPasswordLabel}
              </label>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full text-left"
                dir="ltr"
                autoComplete="new-password"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> {t.confirmPasswordLabel}
              </label>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full text-left"
                dir="ltr"
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full py-4 disabled:opacity-60"
          >
            {isLoading ? t.processing : (
              mode === 'signup' ? t.createAccount
                : mode === 'confirm' ? t.verifyAndSignIn
                  : mode === 'forgot' ? t.sendResetLink
                    : mode === 'recovery' ? t.savePassword
                      : mode === 'otp' ? (otpSent ? t.verifyAndSignIn : t.sendCode)
                        : loginMethod === 'otp' ? t.continueWithOtp
                          : t.login
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm space-y-2">
          {(mode === 'forgot' || mode === 'recovery' || mode === 'otp' || mode === 'confirm') && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="inline-flex items-center gap-1.5 text-[var(--text-sec)] hover:text-[var(--accent)]"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.backToLogin}
            </button>
          )}

          {mode === 'login' && (
            <p>
              {t.newHere}{' '}
              <button type="button" onClick={() => switchMode('signup')} className="text-[var(--accent)] font-semibold hover:underline">
                {t.createAccount}
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p>
              {t.alreadyHaveAccount}{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-[var(--accent)] font-semibold hover:underline">
                {t.logInLink}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}