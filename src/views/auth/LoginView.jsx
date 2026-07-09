import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, KeyRound, ArrowLeft } from 'lucide-react';
import EchoLogo from '../../components/ui/EchoLogo';
import { supabase } from '../../lib/supabase';
import {
  signInWithGoogle,
  sendEmailOtp,
  verifyEmailOtp,
  requestPasswordReset,
  updatePassword,
} from '../../lib/auth';

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
  lang = 'ar',
  handleAuthLogin,
  handleAuthSignup,
  onLoginSuccess,
  resolveUserAfterAuth,
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = typeof location.state?.from === 'string' ? location.state.from : '/';
  const isAr = lang === 'ar';

  const [mode, setMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const otpInputRef = useRef(null);

  useEffect(() => {
    if (searchParams.get('recovery') === '1') {
      setMode('recovery');
    }
  }, [searchParams]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (otpSent && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpSent]);

  const resetMessages = () => {
    setError('');
    setSuccessMsg('');
  };

  const finishAuth = async (authUser) => {
    const userData = await resolveUserAfterAuth(authUser);
    onLoginSuccess(userData, redirectTo);
  };

  const onGoogleLogin = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || (isAr ? 'فشل تسجيل الدخول بجوجل' : 'Google sign-in failed'));
      setIsLoading(false);
    }
  };

  const onFormSubmit = async (e) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
        }
        const result = await handleAuthSignup(email, password, name);
        if (result.autoLogin && result.userData) {
          onLoginSuccess(result.userData, redirectTo);
        } else {
          setSuccessMsg(result.message || (t.createAccount + '. ' + (isAr ? 'تحقق من بريدك للتأكيد.' : 'Check your email to confirm.')));
          setMode('login');
        }
        return;
      }

      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setSuccessMsg(isAr
          ? 'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.'
          : 'We sent a password reset link to your email.');
        return;
      }

      if (mode === 'recovery') {
        if (password.length < 6) {
          throw new Error(isAr ? 'كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters');
        }
        if (password !== confirmPassword) {
          throw new Error(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
        }
        await updatePassword(password);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await finishAuth(user);
        setSuccessMsg(isAr ? 'تم تحديث كلمة المرور بنجاح' : 'Password updated successfully');
        return;
      }

      if (mode === 'otp') {
        if (!otpSent) {
          await sendEmailOtp(email, { shouldCreateUser: true });
          setOtpSent(true);
          setSuccessMsg(isAr
            ? 'أرسلنا رمز التحقق إلى بريدك. أدخل الرمز خلال 10 دقائق.'
            : 'We sent a verification code to your email. Enter it within 10 minutes.');
          return;
        }

        const { user } = await verifyEmailOtp(email, otpCode);
        if (!user) throw new Error(isAr ? 'رمز غير صالح' : 'Invalid code');
        await finishAuth(user);
        return;
      }

      if (mode === 'login' && loginMethod === 'otp') {
        await sendEmailOtp(email, { shouldCreateUser: true });
        setMode('otp');
        setOtpSent(true);
        setSuccessMsg(isAr
          ? 'أرسلنا رمز التحقق إلى بريدك. أدخل الرمز خلال 10 دقائق.'
          : 'We sent a verification code to your email. Enter it within 10 minutes.');
        return;
      }

      const userData = await handleAuthLogin(email, password);
      onLoginSuccess(userData, redirectTo);
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
  };

  const title = () => {
    if (mode === 'signup') return t.createAccount;
    if (mode === 'forgot') return isAr ? 'نسيت كلمة المرور' : 'Forgot password';
    if (mode === 'recovery') return isAr ? 'كلمة مرور جديدة' : 'New password';
    if (mode === 'otp') return isAr ? 'دخول برمز OTP' : 'Sign in with OTP';
    return t.login;
  };

  const subtitle = () => {
    if (mode === 'forgot') {
      return isAr ? 'أدخل بريدك وسنرسل رابط إعادة التعيين' : 'Enter your email and we will send a reset link';
    }
    if (mode === 'recovery') {
      return isAr ? 'اختر كلمة مرور جديدة لحسابك' : 'Choose a new password for your account';
    }
    if (mode === 'otp') {
      return otpSent
        ? (isAr ? 'أدخل الرمز من البريد الإلكتروني' : 'Enter the code from your email')
        : (isAr ? 'سنرسل رمزاً لمرة واحدة إلى بريدك' : 'We will email you a one-time code');
    }
    if (mode === 'signup') return t.loginDesc;
    return t.loginDesc;
  };

  const showGoogle = mode === 'login' || mode === 'signup';
  const showMethodTabs = mode === 'login';

  return (
    <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in px-2">
      <div className="card p-6 sm:p-10">
        <div className="text-center mb-8">
          <EchoLogo className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5" />
          <h2 className="text-2xl sm:text-3xl font-black mb-1">{title()}</h2>
          <p className="text-[var(--text-sec)] text-sm">{subtitle()}</p>
        </div>

        {showGoogle && (
          <>
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={isLoading}
              className="btn w-full py-3.5 bg-white text-gray-800 border border-[var(--border)] hover:bg-gray-50 disabled:opacity-60 flex items-center justify-center gap-3 font-semibold"
            >
              <GoogleIcon />
              {isAr ? 'المتابعة مع Google' : 'Continue with Google'}
            </button>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                {isAr ? 'أو' : 'or'}
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
              {isAr ? 'كلمة المرور' : 'Password'}
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
              {isAr ? 'رمز OTP' : 'Email OTP'}
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
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <User className="w-4 h-4 text-[var(--accent)]" /> {t.yourName}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                placeholder={t.yourName}
              />
            </div>
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
                className="input w-full"
                autoComplete="email"
                disabled={mode === 'otp' && otpSent}
              />
            </div>
          )}

          {mode === 'otp' && otpSent && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <KeyRound className="w-4 h-4 text-[var(--accent)]" /> {isAr ? 'رمز التحقق' : 'Verification code'}
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="input w-full text-center text-2xl tracking-[0.35em] font-mono"
                placeholder="000000"
              />
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtpCode(''); resetMessages(); }}
                className="text-xs text-[var(--accent)] mt-2 hover:underline"
              >
                {isAr ? 'إرسال رمز جديد' : 'Send a new code'}
              </button>
            </div>
          )}

          {(mode === 'login' && loginMethod === 'password') || mode === 'signup' || mode === 'recovery' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold flex items-center gap-2 text-[var(--text-sec)]">
                  <Lock className="w-4 h-4 text-[var(--accent)]" />
                  {mode === 'recovery' ? (isAr ? 'كلمة المرور الجديدة' : 'New password') : t.password}
                </label>
                {mode === 'login' && loginMethod === 'password' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                autoComplete={mode === 'recovery' ? 'new-password' : mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          ) : null}

          {mode === 'recovery' && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> {isAr ? 'تأكيد كلمة المرور' : 'Confirm password'}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full"
                autoComplete="new-password"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-1.5 text-[var(--text-sec)]">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> {isAr ? 'تأكيد كلمة المرور' : 'Confirm password'}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full"
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full py-4 disabled:opacity-60"
          >
            {isLoading ? (t.processing || '...') : (
              mode === 'signup' ? t.createAccount
                : mode === 'forgot' ? (isAr ? 'إرسال الرابط' : 'Send reset link')
                  : mode === 'recovery' ? (isAr ? 'حفظ كلمة المرور' : 'Save password')
                    : mode === 'otp' ? (otpSent ? (isAr ? 'تحقق والدخول' : 'Verify & sign in') : (isAr ? 'إرسال الرمز' : 'Send code'))
                      : loginMethod === 'otp' ? (isAr ? 'متابعة برمز OTP' : 'Continue with OTP')
                        : t.login
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm space-y-2">
          {(mode === 'forgot' || mode === 'recovery' || mode === 'otp') && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="inline-flex items-center gap-1.5 text-[var(--text-sec)] hover:text-[var(--accent)]"
            >
              <ArrowLeft className="w-4 h-4" />
              {isAr ? 'العودة لتسجيل الدخول' : 'Back to login'}
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