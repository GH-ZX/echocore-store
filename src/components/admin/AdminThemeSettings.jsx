import { useState, useEffect, useRef } from 'react';
import { Palette, Loader2, CheckCircle, AlertCircle, RefreshCw, Save, RotateCcw, Sparkles, Sparkle, ImageIcon, Check, Sun, Moon } from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { uploadImage } from '../../lib/uploadImage';
import EchoLogo from '../ui/EchoLogo';

import {
  getPresetsForMode,
  getDefaultPresetForMode,
  isLightColorMode,
  THEME_FIELD_GROUPS,
  EDITABLE_THEME_FIELDS,
  BACKGROUND_TYPES,
  isGrid3DBackground,
  applyTheme,
  buildFullTheme,
  normalizeThemeOverrides,
  detectPresetId,
  getPresetPreviewColors,
  pickAppearanceOverrides,
  parseLogoGlow,
  formatLogoGlow,
  glowToHex,
  parseHueDegrees,
  parseLogoPosition,
  getEffectiveLogoCoreColor,
  isLogoCoreColorDefault,
  getEffectiveLogoBgColor,
  isLogoBgColorDefault,
} from '../../lib/theme';

function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-[var(--text-muted)] block">
          {label}
        </label>
        <span className="text-xs font-mono text-[var(--accent)]">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--border)] accent-[var(--accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--accent)]"
      />
    </div>
  );
}

function ToggleField({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[var(--text-primary)] font-medium">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(value === 'true' ? 'false' : 'true')}
        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
          value === 'true' ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 shadow-sm ${
            value === 'true' ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function AppearanceSettings({ form, t, onChange, onPatch, onColorModeChange }) {
  const colorMode = form['color-mode'] ?? 'dark';
  const glowsEnabled = form['glows-enabled'] ?? 'true';
  const surfacesOpacityEnabled = form['surfaces-opacity-enabled'] ?? 'false';
  const surfacesOpacity = form['surfaces-opacity'] ?? '0.88';
  const surfacesStyle = form['surfaces-style'] ?? (surfacesOpacityEnabled === 'true' ? 'transparent' : 'solid');
  const surfacesGlassBlur = form['surfaces-glass-blur'] ?? '24';
  const surfacesActive = surfacesStyle !== 'solid' || surfacesOpacityEnabled === 'true';

  const setSurfacesEnabled = (enabled) => {
    if (enabled) {
      onPatch({
        'surfaces-opacity-enabled': 'true',
        ...((form['surfaces-style'] ?? 'solid') === 'solid' ? { 'surfaces-style': 'transparent' } : {}),
      });
    } else {
      onPatch({
        'surfaces-opacity-enabled': 'false',
        'surfaces-style': 'solid',
      });
    }
  };

  return (
    <div className="mb-6 pb-6 border-b border-[var(--border)]">
      <h3 className="text-lg font-black flex items-center gap-2 mb-1">
        <Sparkles className="w-4.5 h-4.5 text-[var(--accent)]" />
        {t.appearanceSettings}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        {t.appearanceSettingsHelp}
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-2">
            {t.colorMode}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onColorModeChange('dark')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                colorMode === 'dark'
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
              }`}
            >
              <Moon className="w-4 h-4" />
              {t.colorModeDark}
            </button>
            <button
              type="button"
              onClick={() => onColorModeChange('light')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                colorMode === 'light'
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
              }`}
            >
              <Sun className="w-4 h-4" />
              {t.colorModeLight}
            </button>
          </div>
        </div>

        <div>
          <ToggleField
            label={t.glowsEnabled}
            value={glowsEnabled}
            onChange={(v) => onChange('glows-enabled', v)}
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            {t.glowsEnabledHelp}
          </p>
        </div>

        <div className="sm:col-span-2">
          <ToggleField
            label={t.surfacesOpacityEnabled}
            value={surfacesActive ? 'true' : 'false'}
            onChange={(v) => setSurfacesEnabled(v === 'true')}
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            {t.surfacesOpacityEnabledHelp}
          </p>
          {surfacesActive && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-2">
                  {t.surfacesStyle}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onPatch({
                      'surfaces-opacity-enabled': 'true',
                      'surfaces-style': 'transparent',
                    })}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      surfacesStyle === 'transparent'
                        ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
                    }`}
                  >
                    {t.surfacesStyleTransparent}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPatch({
                      'surfaces-opacity-enabled': 'true',
                      'surfaces-style': 'frosted',
                    })}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      surfacesStyle === 'frosted'
                        ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
                    }`}
                  >
                    {t.surfacesStyleFrosted}
                  </button>
                </div>
              </div>
              {surfacesStyle === 'frosted' ? (
                <>
                  <SliderField
                    label={t.surfacesGlassBlur}
                    value={surfacesGlassBlur}
                    min="12"
                    max="32"
                    step="1"
                    onChange={(v) => onChange('surfaces-glass-blur', v)}
                  />
                  <SliderField
                    label={t.surfacesGlassFill}
                    value={surfacesOpacity}
                    min="0.35"
                    max="1"
                    step="0.01"
                    onChange={(v) => onChange('surfaces-opacity', v)}
                  />
                </>
              ) : (
                <SliderField
                  label={t.surfacesOpacity}
                  value={surfacesOpacity}
                  min="0.35"
                  max="1"
                  step="0.01"
                  onChange={(v) => onChange('surfaces-opacity', v)}
                />
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                {surfacesStyle === 'frosted' ? t.surfacesStyleFrostedHelp : t.surfacesStyleTransparentHelp}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BackgroundSettings({ form, t, lang, onChange }) {
  const isAr = lang === 'ar';
  const bgType = form['background-type'] ?? 'aurora';
  const auroraEnabled = form['aurora-enabled'] ?? 'true';
  const auroraResponsive = form['aurora-responsive'] ?? 'true';
  const auroraAmplitude = form['aurora-amplitude'] ?? '0.6';
  const auroraSpeed = form['aurora-speed'] ?? '0.4';
  const auroraBlend = form['aurora-blend'] ?? '0.36';
  const auroraIntensity = form['aurora-intensity'] ?? '1';
  const effectOpacity = form['bg-effect-opacity'] ?? '0.4';
  const circuitSpeed = form['circuit-speed'] ?? '1';
  const circuitPulseSpeed = form['circuit-pulse-speed'] ?? '1';
  const circuitDensity = form['circuit-density'] ?? '1';
  const circuitPulses = form['circuit-pulses'] ?? '5';
  const circuitGlowStrength = form['circuit-glow-strength'] ?? '1';
  const grid3dSpeed = form['grid3d-speed'] ?? '1';
  const grid3dDepth = form['grid3d-depth'] ?? '1';
  const hexgridSpeed = form['hexgrid-speed'] ?? '1';
  const hexgridDensity = form['hexgrid-density'] ?? '1';
  const hexgridTilt = form['hexgrid-tilt'] ?? '1';
  const particlesSpeed = form['particles-speed'] ?? '1';
  const particlesDensity = form['particles-density'] ?? '1';
  const particlesSize = form['particles-size'] ?? '1';
  const nebulaSpeed = form['nebula-speed'] ?? '1';
  const nebulaSize = form['nebula-size'] ?? '1';
  const nebulaBlur = form['nebula-blur'] ?? '1';
  const scanlinesSpeed = form['scanlines-speed'] ?? '1';
  const scanlinesDensity = form['scanlines-density'] ?? '1';
  const scanlinesBeam = form['scanlines-beam'] ?? '1';
  const starfieldSpeed = form['starfield-speed'] ?? '1';
  const starfieldDensity = form['starfield-density'] ?? '1';
  const starfieldTwinkle = form['starfield-twinkle'] ?? '1';

  return (
    <div className="mt-8 pt-6 border-t border-[var(--border)]">
      <h3 className="text-lg font-black flex items-center gap-2 mb-1">
        <Sparkle className="w-4.5 h-4.5 text-[var(--accent)]" />
        {t.backgroundSettings}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        {t.backgroundSettingsHelp}
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {Object.values(BACKGROUND_TYPES).map((bg) => {
          const active = bgType === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange('background-type', bg.id)}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                active
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
              }`}
            >
              {isAr ? bg.labelAr : bg.labelEn}
            </button>
          );
        })}
      </div>

      <SliderField
        label={t.effectIntensity}
        value={effectOpacity}
        min="0.1"
        max="1.0"
        step="0.05"
        onChange={(v) => onChange('bg-effect-opacity', v)}
      />

      {bgType === 'aurora' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <ToggleField
            label={t.enableAurora}
            value={auroraEnabled}
            onChange={(v) => onChange('aurora-enabled', v)}
          />

          <ToggleField
            label={t.auroraTouchResponsive}
            value={auroraResponsive}
            onChange={(v) => onChange('aurora-responsive', v)}
          />

          <SliderField
            label={t.waveHeight}
            value={auroraAmplitude}
            min="0.2"
            max="0.9"
            step="0.02"
            onChange={(v) => onChange('aurora-amplitude', v)}
          />

          <SliderField
            label={t.animationSpeed}
            value={auroraSpeed}
            min="0.1"
            max="0.8"
            step="0.02"
            onChange={(v) => onChange('aurora-speed', v)}
          />

          <SliderField
            label={t.edgeSoftness}
            value={auroraBlend}
            min="0.15"
            max="0.65"
            step="0.01"
            onChange={(v) => onChange('aurora-blend', v)}
          />

          <SliderField
            label={t.auroraBrightness}
            value={auroraIntensity}
            min="0.3"
            max="1.2"
            step="0.05"
            onChange={(v) => onChange('aurora-intensity', v)}
          />
        </div>
      )}

      {bgType === 'circuit' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.circuitTraceSpeed}
            value={circuitSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('circuit-speed', v)}
          />

          <SliderField
            label={t.circuitPulseSpeed}
            value={circuitPulseSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('circuit-pulse-speed', v)}
          />

          <SliderField
            label={t.circuitDensity}
            value={circuitDensity}
            min="0.5"
            max="2"
            step="0.1"
            onChange={(v) => onChange('circuit-density', v)}
          />

          <SliderField
            label={t.circuitPulseCount}
            value={circuitPulses}
            min="1"
            max="12"
            step="1"
            onChange={(v) => onChange('circuit-pulses', v)}
          />

          <SliderField
            label={t.circuitGlowStrength}
            value={circuitGlowStrength}
            min="0.2"
            max="2"
            step="0.1"
            onChange={(v) => onChange('circuit-glow-strength', v)}
          />
        </div>
      )}

      {isGrid3DBackground(bgType) && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.grid3dSpeed}
            value={grid3dSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('grid3d-speed', v)}
          />

          <SliderField
            label={t.grid3dDepth}
            value={grid3dDepth}
            min="0.6"
            max="1.8"
            step="0.05"
            onChange={(v) => onChange('grid3d-depth', v)}
          />
        </div>
      )}

      {bgType === 'hexgrid' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.hexgridSpeed}
            value={hexgridSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('hexgrid-speed', v)}
          />

          <SliderField
            label={t.hexgridDensity}
            value={hexgridDensity}
            min="0.5"
            max="2"
            step="0.1"
            onChange={(v) => onChange('hexgrid-density', v)}
          />

          <SliderField
            label={t.hexgridTilt}
            value={hexgridTilt}
            min="0.7"
            max="1.4"
            step="0.05"
            onChange={(v) => onChange('hexgrid-tilt', v)}
          />
        </div>
      )}

      {bgType === 'particles' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.particlesSpeed}
            value={particlesSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('particles-speed', v)}
          />

          <SliderField
            label={t.particlesDensity}
            value={particlesDensity}
            min="0.4"
            max="2"
            step="0.1"
            onChange={(v) => onChange('particles-density', v)}
          />

          <SliderField
            label={t.particlesSize}
            value={particlesSize}
            min="0.5"
            max="2"
            step="0.1"
            onChange={(v) => onChange('particles-size', v)}
          />
        </div>
      )}

      {bgType === 'nebula' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.nebulaSpeed}
            value={nebulaSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('nebula-speed', v)}
          />

          <SliderField
            label={t.nebulaSize}
            value={nebulaSize}
            min="0.6"
            max="1.6"
            step="0.05"
            onChange={(v) => onChange('nebula-size', v)}
          />

          <SliderField
            label={t.nebulaBlur}
            value={nebulaBlur}
            min="0.5"
            max="2"
            step="0.1"
            onChange={(v) => onChange('nebula-blur', v)}
          />
        </div>
      )}

      {bgType === 'scanlines' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.scanlinesSpeed}
            value={scanlinesSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('scanlines-speed', v)}
          />

          <SliderField
            label={t.scanlinesDensity}
            value={scanlinesDensity}
            min="0.5"
            max="2"
            step="0.1"
            onChange={(v) => onChange('scanlines-density', v)}
          />

          <SliderField
            label={t.scanlinesBeam}
            value={scanlinesBeam}
            min="0.3"
            max="2"
            step="0.1"
            onChange={(v) => onChange('scanlines-beam', v)}
          />
        </div>
      )}

      {bgType === 'starfield' && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <SliderField
            label={t.starfieldSpeed}
            value={starfieldSpeed}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('starfield-speed', v)}
          />

          <SliderField
            label={t.starfieldDensity}
            value={starfieldDensity}
            min="0.4"
            max="2"
            step="0.1"
            onChange={(v) => onChange('starfield-density', v)}
          />

          <SliderField
            label={t.starfieldTwinkle}
            value={starfieldTwinkle}
            min="0.3"
            max="2.5"
            step="0.1"
            onChange={(v) => onChange('starfield-twinkle', v)}
          />
        </div>
      )}
    </div>
  );
}

function LogoSettings({ form, displayTheme, t, onChange, onCoreColorChange, onBgColorChange, onClearLogo }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [liveCoreHex, setLiveCoreHex] = useState(null);
  const [liveBgHex, setLiveBgHex] = useState(null);

  const logoUrl = form['logo-url'] || '';
  const logoAuto = (form['logo-filter-auto'] ?? displayTheme['logo-filter-auto'] ?? 'true') !== 'false';
  const hue = parseHueDegrees(form['logo-hue-rotate'] ?? displayTheme['logo-hue-rotate']);
  const glow = parseLogoGlow(form['logo-glow'] ?? displayTheme['logo-glow']);
  const glowHex = glowToHex(form['logo-glow'] ?? displayTheme['logo-glow']);
  const saturate = parseFloat(form['logo-saturate'] ?? displayTheme['logo-saturate'] ?? '1.04');
  const brightness = parseFloat(form['logo-brightness'] ?? displayTheme['logo-brightness'] ?? '1.02');
  const zoom = parseFloat(form['logo-zoom'] ?? displayTheme['logo-zoom'] ?? '1');
  const posX = parseLogoPosition(form['logo-pos-x'] ?? displayTheme['logo-pos-x'], 50);
  const posY = parseLogoPosition(form['logo-pos-y'] ?? displayTheme['logo-pos-y'], 50);
  const previewSrc = logoUrl.trim() || undefined;
  const logoCoreDefault = isLogoCoreColorDefault(form) && !liveCoreHex;
  const logoCorePicker = liveCoreHex || getEffectiveLogoCoreColor(form, displayTheme.accent);
  const logoBgEnabled = (form['logo-bg-enabled'] ?? displayTheme['logo-bg-enabled'] ?? 'true') !== 'false';
  const logoBgDefault = isLogoBgColorDefault(form) && !liveBgHex;
  const logoBgPicker = liveBgHex || getEffectiveLogoBgColor(form, displayTheme);
  const previewOverrides = { ...form };
  if (liveCoreHex) previewOverrides['logo-core-color'] = liveCoreHex;
  if (liveBgHex) previewOverrides['logo-bg-color'] = liveBgHex;
  const previewTheme = buildFullTheme(previewOverrides);

  const setManual = (key, value) => {
    onChange(key, value);
    if (logoAuto && key !== 'logo-filter-auto') {
      onChange('logo-filter-auto', 'false');
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadImage(file, 'store-logo');
      if (url) onChange('logo-url', url);
    } catch (err) {
      setUploadError(err.message || t.logoUploadFailed);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-6 pt-6 border-t border-[var(--border)]">
      <h3 className="text-lg font-black flex items-center gap-2 mb-1">
        <ImageIcon className="w-4.5 h-4.5 text-[var(--accent)]" />
        {t.logoSettings}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        {t.logoSettingsHelp}
      </p>

      <div className="grid lg:grid-cols-[auto_1fr] gap-5 items-start">
        <div className="flex flex-col items-center gap-2 mx-auto lg:mx-0 w-full max-w-[11rem]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t.livePreview}
          </span>
          <div
            className="flex items-center justify-center w-28 h-28 rounded-2xl border overflow-hidden transition-colors duration-150"
            style={{
              background: logoBgEnabled
                ? `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${previewTheme.accent} 14%, ${previewTheme['logo-bg']}), ${previewTheme['logo-bg']})`
                : previewTheme['bg-surface'],
              borderColor: logoBgEnabled ? previewTheme['logo-border'] : previewTheme.border,
              ['--logo-hue-rotate']: previewTheme['logo-hue-rotate'],
              ['--logo-glow']: previewTheme['logo-glow'],
              ['--logo-saturate']: previewTheme['logo-saturate'],
              ['--logo-brightness']: previewTheme['logo-brightness'],
              ['--logo-zoom']: previewTheme['logo-zoom'],
              ['--logo-translate-x']: previewTheme['logo-translate-x'],
              ['--logo-translate-y']: previewTheme['logo-translate-y'],
            }}
          >
            <EchoLogo className="w-full h-full" alt="ECHOCORE" src={previewSrc} />
          </div>
          <ToggleField
            label={t.logoBgEnabled}
            value={logoBgEnabled ? 'true' : 'false'}
            onChange={(v) => onChange('logo-bg-enabled', v)}
          />
          {logoBgEnabled && (
            <div className="w-full pt-1">
              <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">
                {t.logoBgColor}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={logoBgPicker}
                  onInput={(e) => {
                    setLiveBgHex(e.target.value);
                    onBgColorChange(e.target.value);
                  }}
                  onChange={(e) => {
                    setLiveBgHex(e.target.value);
                    onBgColorChange(e.target.value);
                  }}
                  className="w-11 h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] cursor-pointer p-1"
                  aria-label={t.logoBgColor}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-mono text-[var(--accent)] block truncate">
                    {logoBgPicker}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    {logoBgDefault ? t.logoBgColorDefault : t.logoBgColorCustom}
                  </span>
                </div>
              </div>
              {!logoBgDefault && (
                <button
                  type="button"
                  onClick={() => {
                    setLiveBgHex(null);
                    onBgColorChange('');
                  }}
                  className="action-chip text-xs gap-1.5 !h-8 !min-h-8 mt-2 w-full justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.logoBgColorReset}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <div>
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1 min-w-0">
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">
                  {t.logoFile}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg,image/svg+xml"
                    disabled={uploading}
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                    className="input flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]"
                  />
                  <input
                    type="url"
                    placeholder={t.logoUrlPlaceholder}
                    value={logoUrl}
                    onChange={(e) => onChange('logo-url', e.target.value)}
                    className="input flex-1 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex-shrink-0 lg:w-44">
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">
                  {t.logoCoreColor}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={logoCorePicker}
                    onInput={(e) => {
                      setLiveCoreHex(e.target.value);
                      onCoreColorChange(e.target.value);
                    }}
                    onChange={(e) => {
                      setLiveCoreHex(e.target.value);
                      onCoreColorChange(e.target.value);
                    }}
                    className="w-11 h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] cursor-pointer p-1"
                    aria-label={t.logoCoreColor}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-mono text-[var(--accent)] block truncate">
                      {logoCorePicker}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      {logoCoreDefault ? t.logoCoreColorDefault : t.logoCoreColorCustom}
                    </span>
                  </div>
                </div>
                {!logoCoreDefault && (
                  <button
                    type="button"
                    onClick={() => {
                      setLiveCoreHex(null);
                      onCoreColorChange('');
                    }}
                    className="action-chip text-xs gap-1.5 !h-8 !min-h-8 mt-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t.logoCoreColorReset}
                  </button>
                )}
              </div>
            </div>
            {uploading && (
              <p className="text-xs text-[var(--accent)] mt-1.5 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t.uploading}
              </p>
            )}
            {uploadError && <p className="text-xs text-red-400 mt-1.5">{uploadError}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={onClearLogo}
                className="action-chip text-xs gap-1.5 !h-9 !min-h-9"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.resetLogoFile}
              </button>
              {logoUrl && (
                <a href={logoUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] hover:underline self-center">
                  {t.viewLogo}
                </a>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">
              {t.logoFileHelp}
            </p>
          </div>

          <SliderField
            label={t.logoZoom}
            value={Number.isFinite(zoom) ? zoom.toFixed(2) : '1'}
            min="1"
            max="3"
            step="0.05"
            onChange={(v) => onChange('logo-zoom', v)}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <SliderField
              label={t.logoPositionX}
              value={String(posX)}
              min="0"
              max="100"
              step="1"
              onChange={(v) => onChange('logo-pos-x', v)}
            />
            <SliderField
              label={t.logoPositionY}
              value={String(posY)}
              min="0"
              max="100"
              step="1"
              onChange={(v) => onChange('logo-pos-y', v)}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] -mt-2">
            {t.logoPositionHelp}
          </p>

          <ToggleField
            label={t.logoAutoTint}
            value={logoAuto ? 'true' : 'false'}
            onChange={(v) => onChange('logo-filter-auto', v)}
          />

          {!logoAuto && (
            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <SliderField
                label={t.logoHueShift}
                value={String(hue)}
                min="-90"
                max="90"
                step="1"
                onChange={(v) => setManual('logo-hue-rotate', `${v}deg`)}
              />
              <SliderField
                label={t.logoSaturation}
                value={Number.isFinite(saturate) ? saturate.toFixed(2) : '1.04'}
                min="0.5"
                max="2"
                step="0.02"
                onChange={(v) => setManual('logo-saturate', v)}
              />
              <SliderField
                label={t.logoBrightness}
                value={Number.isFinite(brightness) ? brightness.toFixed(2) : '1.02'}
                min="0.7"
                max="1.4"
                step="0.02"
                onChange={(v) => setManual('logo-brightness', v)}
              />
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-muted)] block">
                  {t.logoGlowColor}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={glowHex}
                    onChange={(e) => {
                      const hex = e.target.value;
                      const r = parseInt(hex.slice(1, 3), 16);
                      const g = parseInt(hex.slice(3, 5), 16);
                      const b = parseInt(hex.slice(5, 7), 16);
                      setManual('logo-glow', formatLogoGlow(r, g, b, glow.a));
                    }}
                    className="w-11 h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] cursor-pointer p-1"
                  />
                  <span className="text-xs font-mono text-[var(--accent)] flex-1 truncate">
                    {form['logo-glow'] || displayTheme['logo-glow']}
                  </span>
                </div>
              </div>
              <SliderField
                label={t.logoGlowOpacity}
                value={glow.a.toFixed(2)}
                min="0"
                max="0.8"
                step="0.02"
                onChange={(v) => setManual('logo-glow', formatLogoGlow(glow.r, glow.g, glow.b, parseFloat(v)))}
              />
            </div>
          )}

          {logoAuto && (
            <p className="text-xs text-[var(--text-muted)]">
              {t.logoThemeNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorField({ field, value, onChange, t, lang }) {
  const isAr = lang === 'ar';
  const pickerValue = value?.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#040812';
  const labelKey = `themeField_${field.key.replace(/-/g, '_')}`;
  const label = t[labelKey] || (isAr ? field.labelAr : field.labelEn);

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[var(--text-muted)] block">
        {label}
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

function ThemePresetCard({ preset, active, isAr, mode, onSelect }) {
  const colors = getPresetPreviewColors(preset, mode);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`theme-preset-card group text-left ${active ? 'theme-preset-card--active' : ''}`}
      aria-pressed={active}
    >
      <div
        className="theme-preset-card__swatch"
        style={{
          background: `linear-gradient(145deg, ${colors.bgPrimary} 0%, ${colors.bgSurface} 55%, ${colors.bgPrimary} 100%)`,
        }}
      >
        <span
          className="theme-preset-card__accent"
          style={{ background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentHover})` }}
        />
        <span className="theme-preset-card__dot" style={{ background: colors.accent }} />
        <span className="theme-preset-card__text" style={{ color: colors.textPrimary }}>
          Aa
        </span>
        {active && (
          <span className="theme-preset-card__check">
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="theme-preset-card__label">
        {isAr ? preset.labelAr : preset.labelEn}
      </span>
    </button>
  );
}

function ThemePreview({ theme, t }) {
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
          <EchoLogo className="w-8 h-8" alt="" src={full['logo-url']?.trim() || undefined} />
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
            {t.themePreviewBuy}
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
            {t.digitalCard}
          </div>
          <div className="text-xs mb-3" style={{ color: full['text-secondary'] }}>
            {t.instantDeliveryAfterPayment}
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
              {t.inStock}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: full['sale-title'] }}>
              {t.saleOffers}
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
              {t.themePreviewGames}
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
              {t.game}
            </div>
          </div>
        </div>

        <div className="flex gap-2 text-[10px] font-semibold">
          <span style={{ color: full.error }}>{t.statusError}</span>
          <span style={{ color: full.warning }}>{t.statusWarning}</span>
          <span style={{ color: full.success }}>{t.statusSuccess}</span>
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
      applyTheme(overrides, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      applyTheme(savedRef.current, { replace: true });
    };
  }, []);

  const handleFieldChange = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setPresetId('custom');
      applyTheme(next, { replace: true });
      return next;
    });
  };

  const patchForm = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      setPresetId('custom');
      applyTheme(next, { replace: true });
      return next;
    });
  };

  const colorMode = form['color-mode'] ?? 'dark';
  const activePresets = getPresetsForMode(colorMode);

  const applyPreset = (preset, mode = colorMode) => {
    setForm((prev) => {
      const next = {
        ...pickAppearanceOverrides(prev),
        'color-mode': mode,
        ...preset.overrides,
      };
      setPresetId(preset.id);
      applyTheme(next, { replace: true });
      return next;
    });
  };

  const handleColorModeChange = (mode) => {
    const defaultPreset = getDefaultPresetForMode(mode);
    applyPreset(defaultPreset, mode);
  };

  const handleReset = () => {
    setForm({});
    setPresetId('cyber');
    applyTheme({}, { replace: true });
  };

  const handleLogoCoreColorChange = (hex) => {
    setForm((prev) => {
      const next = { ...prev, 'logo-filter-auto': 'true' };
      if (hex?.trim()) {
        next['logo-core-color'] = hex.trim();
      } else {
        delete next['logo-core-color'];
      }
      setPresetId('custom');
      applyTheme(next, { replace: true });
      return next;
    });
  };

  const handleLogoBgColorChange = (hex) => {
    setForm((prev) => {
      const next = { ...prev };
      if (hex?.trim()) {
        next['logo-bg-color'] = hex.trim();
        next['logo-bg-enabled'] = 'true';
      } else {
        delete next['logo-bg-color'];
      }
      setPresetId('custom');
      applyTheme(next, { replace: true });
      return next;
    });
  };

  const handleClearLogo = () => {
    setForm((prev) => {
      const next = { ...prev };
      delete next['logo-url'];
      setPresetId('custom');
      applyTheme(next, { replace: true });
      return next;
    });
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
      setSuccess(t.themeSettingsSaved);
      onSaved?.(overrides);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      applyTheme(savedRef.current, { replace: true });
      setForm(savedRef.current);
      setPresetId(detectPresetId(savedRef.current));
      setError(err.message || t.saveFailed);
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
              {t.themeSettings}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.themeSettingsHelp}
            </p>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
            {t.livePreview}
          </div>
        </div>

        <AppearanceSettings
          form={form}
          t={t}
          onChange={handleFieldChange}
          onPatch={patchForm}
          onColorModeChange={handleColorModeChange}
        />

        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              {isLightColorMode(form) ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              {isLightColorMode(form) ? t.lightThemePresets : t.darkThemePresets}
            </div>
            {presetId === 'custom' && (
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-dashed border-[var(--accent)]/40 text-[var(--accent)]">
                {t.customTheme}
              </span>
            )}
          </div>
          <div className="theme-preset-grid">
            {Object.values(activePresets).map((preset) => (
              <ThemePresetCard
                key={preset.id}
                preset={preset}
                active={presetId === preset.id}
                isAr={isAr}
                mode={colorMode}
                onSelect={() => applyPreset(preset)}
              />
            ))}
          </div>
        </div>

        <LogoSettings
          form={form}
          displayTheme={displayTheme}
          t={t}
          onChange={handleFieldChange}
          onCoreColorChange={handleLogoCoreColorChange}
          onBgColorChange={handleLogoBgColorChange}
          onClearLogo={handleClearLogo}
        />

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-5">
            {THEME_FIELD_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">
                  {t[`themeGroup_${group.id}`] || (isAr ? group.labelAr : group.labelEn)}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {EDITABLE_THEME_FIELDS.filter((field) => field.group === group.id).map((field) => (
                    <ColorField
                      key={field.key}
                      field={field}
                      value={form[field.key] || displayTheme[field.key] || ''}
                      onChange={handleFieldChange}
                      t={t}
                      lang={lang}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ThemePreview theme={form} t={t} />
        </div>

        <BackgroundSettings
          form={form}
          t={t}
          lang={lang}
          onChange={handleFieldChange}
        />

        {error && (
          <div className="mt-6 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-6 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveTheme}
          </button>
          <button type="button" onClick={handleReset} className="action-chip gap-2">
            <RotateCcw className="w-4 h-4" />
            {t.resetTheme}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>
      </div>
    </div>
  );
}