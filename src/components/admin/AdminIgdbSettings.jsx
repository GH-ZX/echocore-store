import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { fetchIgdbSettings, saveIgdbSettings, testIgdbConnection } from '../../lib/igdb';
import AdminApiKeyField from './AdminApiKeyField';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function AdminIgdbSettings({ t = {}, onNotify, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [secretSet, setSecretSet] = useState(false);
  const [secretMasked, setSecretMasked] = useState('');
  const [configured, setConfigured] = useState(false);
  const [autoCoverOnSync, setAutoCoverOnSync] = useState(false);
  const [error, setError] = useState('');
  const [deleteSecretOpen, setDeleteSecretOpen] = useState(false);
  const [deletingSecret, setDeletingSecret] = useState(false);

  const secretLocked = secretSet;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await fetchIgdbSettings();
      setClientId(s.igdb_client_id || '');
      setSecretSet(!!s.igdb_client_secret_set);
      setSecretMasked(s.igdb_client_secret_masked || '');
      setConfigured(!!s.configured);
      setAutoCoverOnSync(!!s.igdb_auto_cover_on_sync);
      setClientSecret('');
    } catch (err) {
      setError(err.message || t.igdbLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.igdbLoadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const applySettings = (s) => {
    setConfigured(!!s.configured);
    setSecretSet(!!s.igdb_client_secret_set);
    setSecretMasked(s.igdb_client_secret_masked || '');
    setClientId(s.igdb_client_id || clientId.trim());
    setAutoCoverOnSync(!!s.igdb_auto_cover_on_sync);
    setClientSecret('');
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError('');
    try {
      const s = await saveIgdbSettings({
        clientId: clientId.trim(),
        clientSecret: secretLocked ? undefined : (clientSecret.trim() || undefined),
        autoCoverOnSync,
      });
      applySettings(s);
      onNotify?.(t.igdbSaved, 'success');
    } catch (err) {
      setError(err.message || t.igdbSaveFailed);
      onNotify?.(err.message || t.igdbSaveFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setTesting(true);
    setError('');
    try {
      // Save credentials first if unlocked
      if (!secretLocked && (clientId.trim() || clientSecret.trim())) {
        const s = await saveIgdbSettings({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
          autoCoverOnSync,
        });
        applySettings(s);
      }
      const res = await testIgdbConnection();
      const names = Array.isArray(res.sample) ? res.sample.filter(Boolean).join(', ') : '';
      onNotify?.(names ? `${t.igdbTestOk}: ${names}` : t.igdbTestOk, 'success');
    } catch (err) {
      setError(err.message || t.igdbTestFailed);
      onNotify?.(err.message || t.igdbTestFailed, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleClearSecret = async () => {
    setDeletingSecret(true);
    setError('');
    try {
      const s = await saveIgdbSettings({
        clientId: clientId.trim(),
        clearSecret: true,
        autoCoverOnSync: false,
      });
      applySettings(s);
      setDeleteSecretOpen(false);
      onNotify?.(t.igdbSecretRemoved || t.samApiKeyRemoved, 'success');
    } catch (err) {
      setError(err.message || t.igdbSaveFailed);
      onNotify?.(err.message || t.igdbSaveFailed, 'error');
    } finally {
      setDeletingSecret(false);
    }
  };

  return (
    <div className="space-y-4 admin-igdb-settings">
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="admin-list-head-badge" aria-hidden>
              <ImageIcon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold flex flex-wrap items-center gap-2">
                <span>{t.igdbSettingsTitle}</span>
                {configured ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    {t.igdbConfigured}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full">
                    {t.igdbNotConfigured}
                  </span>
                )}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                {t.igdbSettingsDesc}
              </p>
            </div>
          </div>
          <button type="button" onClick={load} className="action-chip gap-1.5 text-xs" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <button type="button" onClick={load} className="action-chip gap-1.5 text-xs" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-[var(--text-muted)]">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--accent)]" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="admin-api-key-card">
            <div className="admin-api-key-card__head">
              <span className="admin-api-key-card__icon" aria-hidden>
                <ImageIcon className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="admin-api-key-card__title">{t.igdbClientIdLabel}</h4>
                <p className="admin-api-key-card__desc">{t.igdbTwitchHelp}</p>
              </div>
            </div>
            <input
              id="igdb-client-id"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="admin-api-key-card__input font-mono"
              placeholder={t.igdbClientIdPlaceholder}
              autoComplete="off"
              dir="ltr"
            />
          </div>

          <AdminApiKeyField
            t={t}
            id="igdb-client-secret"
            title={t.igdbClientSecretLabel}
            description={t.igdbSecretSavedHint}
            locked={secretLocked}
            maskedValue={secretMasked}
            value={clientSecret}
            onChange={setClientSecret}
            placeholder={t.igdbClientSecretPlaceholder}
            onConnect={handleConnect}
            connectLabel={t.igdbTestConnection}
            connectDisabled={!clientId.trim() || (!secretLocked && !clientSecret.trim())}
            connecting={testing}
            onDelete={() => setDeleteSecretOpen(true)}
            deleteLabel={t.igdbClearSecret || t.samApiDeleteKey}
          />

          <label className="admin-igdb-auto-toggle">
            <input
              type="checkbox"
              checked={autoCoverOnSync}
              onChange={(e) => setAutoCoverOnSync(e.target.checked)}
              disabled={!configured && !clientId.trim()}
              className="admin-igdb-auto-toggle__input"
            />
            <span className="admin-igdb-auto-toggle__box" aria-hidden>
              <Wand2 className="w-4 h-4" />
            </span>
            <span className="admin-igdb-auto-toggle__copy">
              <span className="admin-igdb-auto-toggle__title">{t.igdbAutoCoverTitle}</span>
              <span className="admin-igdb-auto-toggle__desc">{t.igdbAutoCoverDesc}</span>
            </span>
          </label>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 pt-0.5">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary gap-2 text-sm py-2.5 px-4 w-full sm:w-auto justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t.saveSettings}
            </button>
            {secretLocked && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={testing}
                className="btn btn-secondary gap-2 text-sm py-2.5 px-4 w-full sm:w-auto justify-center"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t.igdbTestConnection}
              </button>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={deleteSecretOpen}
        title={t.igdbClearSecretTitle || t.samApiDeleteKey}
        message={t.igdbClearSecretConfirm || t.samApiDeleteKeyConfirm}
        confirmLabel={t.igdbClearSecret || t.samApiDeleteKey}
        cancelLabel={t.cancel}
        loading={deletingSecret}
        onConfirm={handleClearSecret}
        onCancel={() => setDeleteSecretOpen(false)}
      />
    </div>
  );
}
