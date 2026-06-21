import { useState, useEffect, useRef } from 'react';
import { Palette, Loader2, CheckCircle, AlertCircle, RefreshCw, Save, RotateCcw, Sparkles } from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../lib/storeSettings';
import echoCoreLogo from '../assets/echo-core-logo.png';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  THEME_FIELD_GROUPS,
  EDITABLE_THEME_FIELDS,
  applyTheme,
  buildFullTheme,
  normalizeThemeOverrides,
  detectPresetId,
} from '../lib/theme';

function ColorField({ field, value, onChange, isAr }) {
  const pickerValue = value?.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#040812';

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[var(--text-muted)] block">
        {isAr ? field.labelAr : field.labelEn}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="w-11 h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] cursor-pointer p-1"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 font-mono text-xs outline-none"
        />
      </div>
    </div>
  );
}

function ThemePreview({ theme, isAr }) {
  const full = buildFullTheme(theme);

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: full.border,
        background: full['gradient-surface'],
      }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{
          background: full['bg-header'],
          borderColor: full.border,
        }}
      >
        <div className="flex items-center gap-2">
          <img src={echoCoreLogo} alt="" className="echo-logo w-8 h-8 object-contain" />
          <div className="font-black tracking-wide" style={{ color: full.accent }}>
            ECHOCORE
          </div>
        </div>
        <div className="flex gap-2">
          <div
            className="w-8 h-8 rounded-lg border"
            style={{ background: full['bg-elevated'], borderColor: full.border }}
          />
          <div
            className="px-3 h-8 rounded-lg text-xs font-semibold flex items-center"
            style={{
              background: `color-mix(in srgb, ${full.accent} 18%, ${full['bg-surface']})`,
              color: full.accent,
              border: `1px solid color-mix(in srgb, ${full.accent} 35%, ${full.border})`,
            }}
          >
            {isAr ? 'شراء' : 'Buy'}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div
          className="rounded-xl p-4 border"
          style={{
            background: full['bg-surface'],
            borderColor: full.border,
            boxShadow: full['shadow-card'],
          }}
        >
          <div className="text-sm font-bold mb-1" style={{ color: full['text-primary'] }}>
            {isAr ? 'بطاقة رقمية' : 'Digital Card'}
          </div>
          <div className="text-xs mb-3" style={{ color: full['text-secondary'] }}>
            {isAr ? 'توصيل فوري بعد الدفع' : 'Instant delivery after payment'}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold" style={{ color: full.accent }}>
              $24.99
            </span>
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{
                background: `color-mix(in srgb, ${full.success} 18%, transparent)`,
                color: full.success,
              }}
            >
              {isAr ? 'متوفر' : 'In stock'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: full['sale-title'] }}>
              {isAr ? 'عروض الخصم' : 'Sale Offers'}
            </div>
            <div className="h-px w-8 mx-auto mb-2" style={{ background: full['sale-divider'] }} />
            <span
              className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold"
              style={{ background: full['sale-badge'], color: full['sale-badge-text'] }}
            >
              SALE
            </span>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: full['games-title'] }}>
              {isAr ? 'الألعاب' : 'Games'}
            </div>
            <div className="h-px w-8 mx-auto mb-2" style={{ background: full['games-divider'] }} />
            <div
              className="mx-auto w-full max-w-[88px] h-10 rounded-lg border text-[10px] font-bold flex items-center justify-center"
              style={{
                borderColor: `color-mix(in srgb, ${full['games-card-hover']} 55%, ${full.border})`,
                color: full['games-title'],
                background: full['bg-surface'],
              }}
            >
              Game
            </div>
          </div>
        </div>

        <div className="flex gap-2 text-[10px] font-semibold">
          <span style={{ color: full.error }}>{isAr ? 'خطأ' : 'Error'}</span>
          <span style={{ color: full.warning }}>{isAr ? 'تحذير' : 'Warning'}</span>
          <span style={{ color: full.success }}>{isAr ? 'نجاح' : 'Success'}</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminThemeSettings({ t = {}, lang = 'ar', onSaved }) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [presetId, setPresetId] = useState('cyber');
  const [form, setForm] = useState({});
  const savedRef = useRef({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoreSettings();
      const overrides = normalizeThemeOverrides(data.theme);
      savedRef.current = overrides;
      setForm(overrides);
      setPresetId(detectPresetId(overrides));
      applyTheme(overrides);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      applyTheme(savedRef.current);
    };
  }, []);

  const handleFieldChange = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setPresetId('custom');
      applyTheme(next);
      return next;
    });
  };

  const applyPreset = (preset) => {
    const next = { ...preset.overrides };
    setForm(next);
    setPresetId(preset.id);
    applyTheme(next);
  };

  const handleReset = () => {
    setForm({});
    setPresetId('cyber');
    applyTheme({});
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const current = await fetchStoreSettings();
      const overrides = normalizeThemeOverrides(form);
      await saveStoreSettings({ ...current, theme: overrides });
      savedRef.current = overrides;
      setSuccess(t.themeSettingsSaved || (isAr ? 'تم حفظ الثيم لجميع المستخدمين' : 'Theme saved for all users'));
      onSaved?.(overrides);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      applyTheme(savedRef.current);
      setForm(savedRef.current);
      setPresetId(detectPresetId(savedRef.current));
      setError(err.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-10 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  const displayTheme = buildFullTheme(form);

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Palette className="w-5 h-5 text-[var(--accent)]" />
              {t.themeSettings || (isAr ? 'ثيم الموقع' : 'Site Theme')}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.themeSettingsHelp || (isAr
                ? 'غيّر ألوان الموقع لجميع الزوار. التغييرات تُطبَّق فور الحفظ.'
                : 'Change the store colors for every visitor. Changes apply globally after you save.')}
            </p>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
            {t.livePreview || (isAr ? 'معاينة مباشرة' : 'Live preview')}
          </div>
        </div>

        <div className="mb-6">
          <div className="text-xs text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t.themePresets || (isAr ? 'قوالب جاهزة' : 'Presets')}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.values(THEME_PRESETS).map((preset) => {
              const active = presetId === preset.id;
              const accent = preset.overrides.accent || DEFAULT_THEME.accent;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    active
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
                  }`}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                    style={{ background: accent }}
                  />
                  {isAr ? preset.labelAr : preset.labelEn}
                </button>
              );
            })}
            {presetId === 'custom' && (
              <span className="px-3 py-2 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)]">
                {t.customTheme || (isAr ? 'مخصص' : 'Custom')}
              </span>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
              <div className="text-xs text-[var(--text-muted)] mb-3">
                {t.logoThemeNote || (isAr
                  ? 'الشعار يتلون تلقائياً حسب لون التمييز عبر فلتر الثيم.'
                  : 'The logo auto-tints from the accent color via the theme filter.')}
              </div>
              <div className="flex items-center gap-3">
                <img src={echoCoreLogo} alt="ECHOCORE" className="echo-logo w-14 h-14 object-contain" />
                <div className="text-sm text-[var(--text-secondary)]">
                  {isAr ? 'معاينة الشعار مع الثيم الحالي' : 'Logo preview with current theme'}
                </div>
              </div>
            </div>

            {THEME_FIELD_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">
                  {isAr ? group.labelAr : group.labelEn}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {EDITABLE_THEME_FIELDS.filter((field) => field.group === group.id).map((field) => (
                    <ColorField
                      key={field.key}
                      field={field}
                      value={form[field.key] || displayTheme[field.key] || ''}
                      onChange={handleFieldChange}
                      isAr={isAr}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ThemePreview theme={form} isAr={isAr} />
        </div>

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveTheme || (isAr ? 'حفظ الثيم للجميع' : 'Save Theme for Everyone')}
          </button>
          <button type="button" onClick={handleReset} className="action-chip gap-2">
            <RotateCcw className="w-4 h-4" />
            {t.resetTheme || (isAr ? 'إعادة الافتراضي' : 'Reset to Default')}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh || (isAr ? 'تحديث' : 'Refresh')}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}
      </div>
    </div>
  );
}