import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Link2,
  Loader2,
  ExternalLink,
  RefreshCw,
  Save,
  Copy,
  Smartphone,
  Trash2,
  Lock,
  KeyRound,
} from 'lucide-react';
import { listSamWallets, saveSamApiSettings } from '../../lib/samApi';
import { formatSypExchangeRate } from '../../lib/rechargeCurrency';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  findSamWalletByIdentifier,
  getSamWalletDisplayName,
  getSamWalletInvoiceIdentifier,
} from '../../lib/samWalletFormat';

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        ok
          ? 'border-green-500/30 bg-green-500/10 text-green-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-amber-300'}`} />
      {label}
    </span>
  );
}

function SectionCard({ icon: Icon, title, description, children, accent = false }) {
  return (
    <section
      className={`rounded-2xl border p-5 space-y-4 ${
        accent
          ? 'border-[var(--accent)]/35 bg-[var(--accent)]/5'
          : 'border-[var(--border)] bg-[var(--bg-primary)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-xl shrink-0 ${
            accent ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--bg-surface)] text-[var(--text-sec)]'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base">{title}</h3>
          {description && <p className="text-sm text-[var(--text-sec)] mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function LockedField({
  label,
  hint,
  value,
  locked,
  onChange,
  children,
  mono = false,
  type = 'text',
}) {
  const inputClass = `w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none ${
    mono ? 'font-mono' : ''
  } ${locked ? 'opacity-90 cursor-not-allowed' : 'focus:border-[var(--accent)]'}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="text-xs text-[var(--text-muted)]">{label}</label>
        {locked && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            <Lock className="w-3 h-3" />
          </span>
        )}
      </div>
      {children || (
        <input
          type={type}
          value={value}
          onChange={onChange}
          readOnly={locked}
          disabled={locked}
          className={inputClass}
        />
      )}
      {hint && <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{hint}</p>}
    </div>
  );
}

function WalletPickerChips({ wallets, onPick, disabled, selectedIds = [] }) {
  if (!wallets.length) return null;
  const selected = new Set(selectedIds.map((id) => String(id).toLowerCase()));

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {wallets.map((wallet) => {
        const id = getSamWalletInvoiceIdentifier(wallet);
        const label = getSamWalletDisplayName(wallet) || wallet.providerDisplayName || wallet.provider || 'Wallet';
        const isSyriatel = wallet.provider === 'syriatel';
        const isActive = selected.has(id.toLowerCase());

        return (
          <button
            key={String(wallet.id || id)}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onPick(id, isSyriatel ? 'syriatel' : 'shamcash')}
            className={`action-chip text-xs font-mono disabled:opacity-50 ${
              isActive ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''
            }`}
          >
            {label}: {id.slice(0, 14)}{id.length > 14 ? '…' : ''}
          </button>
        );
      })}
    </div>
  );
}

function LinkedWalletCard({ wallet, selectedId, t }) {
  const id = getSamWalletInvoiceIdentifier(wallet);
  const isSelected = selectedId && id.toLowerCase() === String(selectedId).toLowerCase();
  const isSyriatel = wallet.provider === 'syriatel';
  const Icon = isSyriatel ? Smartphone : Wallet;

  return (
    <div
      className={`rounded-xl border p-3 ${
        isSelected
          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
          : 'border-[var(--border)] bg-[var(--bg-surface)]'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSyriatel ? 'text-red-400' : 'text-green-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{getSamWalletDisplayName(wallet)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {wallet.providerDisplayName || wallet.provider}
            {wallet.phone ? ` · ${wallet.phone}` : ''}
          </div>
          <div className="font-mono text-xs text-[var(--text-sec)] mt-2 break-all">{id}</div>
        </div>
        {isSelected && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
            {t.samApiLockedBadge}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminSamApiSettings({
  t = {},
  samForm,
  setSamForm,
  onSaved,
  onError,
  onSuccess,
  saving,
  onSaveAll,
}) {
  const [samTesting, setSamTesting] = useState(false);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [samWallets, setSamWallets] = useState([]);
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [sypRateSaving, setSypRateSaving] = useState(false);

  const apiKeyLocked = !!samForm.sam_api_key_set;

  const handleSaveSypRate = async () => {
    const rate = parseFloat(samForm.sam_syp_per_usd);
    if (!Number.isFinite(rate) || rate <= 0) {
      onError?.(t.samSypPerUsdInvalid);
      return;
    }

    setSypRateSaving(true);
    onError?.('');
    try {
      const settings = await saveSamApiSettings({
        enabled: samForm.sam_api_enabled,
        walletMode: samForm.sam_wallet_mode,
        shamcashWalletIdentifier: samForm.sam_shamcash_wallet_identifier,
        syriatelWalletIdentifier: samForm.sam_syriatel_wallet_identifier,
        invoiceCurrency: samForm.sam_invoice_currency,
        sypPerUsd: rate,
      });
      setSamForm((prev) => ({
        ...prev,
        sam_syp_per_usd: settings.sam_syp_per_usd ?? rate,
      }));
      onSuccess?.(t.samSypPerUsdSaved);
      onSaved?.();
    } catch (err) {
      onError?.(err.message || t.saveFailed);
    } finally {
      setSypRateSaving(false);
    }
  };

  const fetchWallets = useCallback(async ({ savePendingKey = false } = {}) => {
    setWalletsLoading(true);
    try {
      if (savePendingKey && samForm.sam_api_key?.trim()) {
        await saveSamApiSettings({
          enabled: samForm.sam_api_enabled,
          walletMode: samForm.sam_wallet_mode,
          shamcashWalletIdentifier: samForm.sam_shamcash_wallet_identifier,
          syriatelWalletIdentifier: samForm.sam_syriatel_wallet_identifier,
          invoiceCurrency: samForm.sam_invoice_currency,
          sypPerUsd: samForm.sam_syp_per_usd,
          apiKey: samForm.sam_api_key,
        });
        setSamForm((prev) => ({ ...prev, sam_api_key: '', sam_api_key_set: true }));
      }

      const wallets = await listSamWallets();
      const list = Array.isArray(wallets) ? wallets : [];
      setSamWallets(list);
      return list;
    } finally {
      setWalletsLoading(false);
    }
  }, [samForm, setSamForm]);

  useEffect(() => {
    if (!apiKeyLocked) return;
    fetchWallets().catch((err) => onError?.(err.message));
  }, [apiKeyLocked, fetchWallets, onError]);

  const handleSamTestWallets = async () => {
    setSamTesting(true);
    onError?.('');
    try {
      const list = await fetchWallets({ savePendingKey: !apiKeyLocked });

      if (!apiKeyLocked) {
        const shamWallet = list.find((w) => w.provider !== 'syriatel');
        const syriatelWallet = list.find((w) => w.provider === 'syriatel');
        const shamId = getSamWalletInvoiceIdentifier(shamWallet);
        const syriatelId = getSamWalletInvoiceIdentifier(syriatelWallet);

        setSamForm((prev) => ({
          ...prev,
          sam_shamcash_wallet_identifier: prev.sam_shamcash_wallet_identifier || shamId,
          sam_syriatel_wallet_identifier: prev.sam_syriatel_wallet_identifier || syriatelId,
        }));
      }

      onSuccess?.(t.samWalletsLoaded);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSamTesting(false);
    }
  };

  const pickWallet = (identifier, provider) => {
    if (apiKeyLocked) return;
    if (provider === 'syriatel') {
      setSamForm((p) => ({ ...p, sam_syriatel_wallet_identifier: identifier }));
    } else {
      setSamForm((p) => ({ ...p, sam_shamcash_wallet_identifier: identifier }));
    }
  };

  const copyWebhookUrl = async () => {
    if (!samForm.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(samForm.webhookUrl);
      onSuccess?.(t.copied);
    } catch {
      onError?.(t.copyFailed);
    }
  };

  const handleDeleteSamApiKey = async () => {
    setDeletingKey(true);
    onError?.('');
    try {
      const settings = await saveSamApiSettings({
        clearApiKey: true,
        enabled: false,
        walletMode: samForm.sam_wallet_mode,
        shamcashWalletIdentifier: samForm.sam_shamcash_wallet_identifier,
        syriatelWalletIdentifier: samForm.sam_syriatel_wallet_identifier,
        invoiceCurrency: samForm.sam_invoice_currency,
        sypPerUsd: samForm.sam_syp_per_usd,
      });
      setSamForm((prev) => ({
        ...prev,
        sam_api_key: '',
        sam_api_enabled: false,
        sam_api_key_set: !!settings.sam_api_key_set,
        sam_api_key_masked: settings.sam_api_key_masked || '',
      }));
      setSamWallets([]);
      setDeleteKeyOpen(false);
      onSuccess?.(t.samApiKeyRemoved);
      onSaved?.();
    } catch (err) {
      onError?.(err.message || t.saveFailed);
    } finally {
      setDeletingKey(false);
    }
  };

  const shamWallets = samWallets.filter((w) => w.provider !== 'syriatel');
  const syriatelWallets = samWallets.filter((w) => w.provider === 'syriatel');
  const shamLinked = findSamWalletByIdentifier(samWallets, samForm.sam_shamcash_wallet_identifier);
  const syriatelLinked = findSamWalletByIdentifier(samWallets, samForm.sam_syriatel_wallet_identifier);

  return (
    <div className="space-y-4 pt-2 border-t border-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="text-sm text-[var(--text-sec)] max-w-2xl">{t.samApiSectionHelp}</p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            ok={apiKeyLocked && samForm.sam_api_enabled}
            label={apiKeyLocked ? t.samApiConnected : t.samApiNotConnected}
          />
          <a
            href="https://sam-api.pro/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="action-chip text-xs gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.samApiDocsLink}
          </a>
        </div>
      </div>

      {apiKeyLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-sm text-[var(--text-sec)]">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
          <span>{t.samApiSettingsLocked}</span>
        </div>
      )}

      <SectionCard icon={KeyRound} title={t.samApiKeyLabel} description={t.samApiKeyHelp} accent={apiKeyLocked}>
        <input
          type="password"
          value={apiKeyLocked ? samForm.sam_api_key_masked : samForm.sam_api_key}
          onChange={(e) => !apiKeyLocked && setSamForm((p) => ({ ...p, sam_api_key: e.target.value }))}
          placeholder={apiKeyLocked ? '' : 'sk_...'}
          readOnly={apiKeyLocked}
          disabled={apiKeyLocked}
          className="w-full bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none disabled:opacity-80 disabled:cursor-not-allowed"
          autoComplete="off"
        />
        {apiKeyLocked ? (
          <button
            type="button"
            onClick={() => setDeleteKeyOpen(true)}
            className="action-chip border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {t.samApiDeleteKey}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSamTestWallets}
            disabled={samTesting || !samForm.sam_api_key?.trim()}
            className="action-chip border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50 gap-1.5"
          >
            {samTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {t.samTestWallets}
          </button>
        )}
      </SectionCard>

      <SectionCard icon={Wallet} title={t.samApiSectionTitle} description={apiKeyLocked ? t.samApiSettingsLocked : t.samApiEnabledHelp}>
        <LockedField label={t.samApiEnabledLabel} locked={apiKeyLocked}>
          {apiKeyLocked ? (
            <div className="px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-sm font-semibold">
              {samForm.sam_api_enabled ? t.samApiEnabledOn : t.samApiEnabledOff}
            </div>
          ) : (
            <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] cursor-pointer">
              <input
                type="checkbox"
                checked={samForm.sam_api_enabled}
                onChange={(e) => setSamForm((p) => ({ ...p, sam_api_enabled: e.target.checked }))}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm">{t.samApiEnabledHelp}</span>
            </label>
          )}
        </LockedField>

        <LockedField label={t.samInvoiceCurrencyLabel} locked={apiKeyLocked}>
          <select
            value={samForm.sam_invoice_currency}
            onChange={(e) => setSamForm((p) => ({ ...p, sam_invoice_currency: e.target.value }))}
            disabled={apiKeyLocked}
            className="w-full max-w-xs bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm outline-none disabled:opacity-80 disabled:cursor-not-allowed"
          >
            <option value="USD">USD</option>
            <option value="SYP">SYP</option>
            <option value="EUR">EUR</option>
          </select>
        </LockedField>

        <div id="sam-syp-rate-field">
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.samSypPerUsdLabel}
          </label>
          <div className="flex flex-wrap gap-2 items-stretch max-w-md">
            <input
              type="number"
              min="1"
              step="1"
              value={String(samForm.sam_syp_per_usd ?? 135)}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSamForm((p) => ({
                  ...p,
                  sam_syp_per_usd: Number.isFinite(val) && val > 0 ? val : p.sam_syp_per_usd,
                }));
              }}
              className="flex-1 min-w-[7rem] bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm font-mono outline-none"
            />
            <button
              type="button"
              onClick={handleSaveSypRate}
              disabled={sypRateSaving || saving}
              className="action-chip gap-1.5 shrink-0 !border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
            >
              {sypRateSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t.samSypPerUsdSave}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.samSypPerUsdHelp}</p>
          <p className="text-xs font-mono text-[var(--text-sec)] mt-1" dir="ltr">
            {formatSypExchangeRate(samForm.sam_syp_per_usd ?? 135)}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <LockedField
              label={t.samShamcashWalletLabel}
              hint={!apiKeyLocked ? t.samWalletIdentifierHelp : undefined}
              value={samForm.sam_shamcash_wallet_identifier}
              locked={apiKeyLocked}
              mono
              onChange={(e) => setSamForm((p) => ({ ...p, sam_shamcash_wallet_identifier: e.target.value }))}
            />
            {!apiKeyLocked && (
              <WalletPickerChips
                wallets={shamWallets}
                onPick={pickWallet}
                disabled={apiKeyLocked}
                selectedIds={[samForm.sam_shamcash_wallet_identifier]}
              />
            )}
          </div>
          <div>
            <LockedField
              label={t.samSyriatelWalletLabel}
              hint={!apiKeyLocked ? t.samWalletIdentifierHelp : undefined}
              value={samForm.sam_syriatel_wallet_identifier}
              locked={apiKeyLocked}
              mono
              onChange={(e) => setSamForm((p) => ({ ...p, sam_syriatel_wallet_identifier: e.target.value }))}
            />
            {!apiKeyLocked && (
              <WalletPickerChips
                wallets={syriatelWallets}
                onPick={pickWallet}
                disabled={apiKeyLocked}
                selectedIds={[samForm.sam_syriatel_wallet_identifier]}
              />
            )}
          </div>
        </div>

        <p className="text-[10px] text-[var(--text-muted)]">{t.receivingWalletHelp}</p>
      </SectionCard>

      <SectionCard
        icon={Link2}
        title={t.samApiLinkedWallets}
        description={t.samApiLinkedWalletsHelp}
      >
        {apiKeyLocked && (
          <button
            type="button"
            onClick={() => fetchWallets().catch((err) => onError?.(err.message))}
            disabled={walletsLoading}
            className="action-chip gap-1.5 text-xs"
          >
            {walletsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t.samApiRefreshWallets}
          </button>
        )}

        {walletsLoading && !samWallets.length ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-4">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            {t.samWalletLoading}
          </div>
        ) : samWallets.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-2">{t.samApiNoWalletsYet}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {samWallets.map((wallet) => {
              const id = getSamWalletInvoiceIdentifier(wallet);
              const selectedId = wallet.provider === 'syriatel'
                ? samForm.sam_syriatel_wallet_identifier
                : samForm.sam_shamcash_wallet_identifier;
              return (
                <LinkedWalletCard
                  key={String(wallet.id || id)}
                  wallet={wallet}
                  selectedId={selectedId}
                  t={t}
                />
              );
            })}
          </div>
        )}

        {apiKeyLocked && (shamLinked || syriatelLinked) && (
          <div className="text-xs text-[var(--text-muted)] space-y-1 pt-1">
            {shamLinked && (
              <div>
                <span className="text-green-400 font-medium">{t.samShamcashWalletLabel}:</span>{' '}
                {getSamWalletDisplayName(shamLinked)}
              </div>
            )}
            {syriatelLinked && (
              <div>
                <span className="text-red-400 font-medium">{t.samSyriatelWalletLabel}:</span>{' '}
                {getSamWalletDisplayName(syriatelLinked)}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {samForm.webhookUrl && (
        <LockedField label={t.samWebhookUrlLabel} hint={t.samWebhookUrlHelp} locked>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={samForm.webhookUrl}
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 font-mono text-xs outline-none opacity-90"
            />
            <button type="button" onClick={copyWebhookUrl} className="action-chip gap-1.5">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </LockedField>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {!apiKeyLocked && (
          <button
            type="button"
            onClick={handleSamTestWallets}
            disabled={samTesting || (!samForm.sam_api_key?.trim() && !samForm.sam_api_key_set)}
            className="action-chip border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50"
          >
            {samTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {t.samTestWallets}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSaveAll(false)}
          disabled={saving}
          className="btn btn-primary action-chip gap-2 !border-0 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.saveSettings}
        </button>
        {apiKeyLocked && (
          <button
            type="button"
            onClick={() => onSaveAll(true)}
            disabled={saving}
            className="action-chip text-xs"
          >
            {t.samRegenerateWebhook}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={deleteKeyOpen}
        title={t.samApiDeleteKey}
        message={t.samApiDeleteKeyConfirm}
        confirmLabel={t.samApiDeleteKey}
        cancelLabel={t.cancel}
        variant="danger"
        loading={deletingKey}
        onConfirm={handleDeleteSamApiKey}
        onCancel={() => !deletingKey && setDeleteKeyOpen(false)}
      />
    </div>
  );
}