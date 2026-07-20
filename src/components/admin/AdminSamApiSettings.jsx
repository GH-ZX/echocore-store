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
  Lock,
} from 'lucide-react';
import { fetchAllSamWalletBalances, listSamWallets, saveSamApiSettings } from '../../lib/samApi';
import { formatSypExchangeRate } from '../../lib/rechargeCurrency';
import ConfirmDialog from '../ui/ConfirmDialog';
import AdminApiKeyField from './AdminApiKeyField';
import {
  formatSamCurrencyAmount,
  getSamWalletDisplayName,
  getSamWalletInvoiceIdentifier,
  getWalletDisplayBalanceLines,
  normalizeSamWalletRows,
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

const SHAMCASH_LOGO_SRC = '/shamcash-logo.svg';

/** Clean wallet row — same idea as overview supplier wallets (USD + SYP only). */
function LinkedWalletCard({ wallet, selectedId, t }) {
  const id = getSamWalletInvoiceIdentifier(wallet);
  const isSelected = selectedId && id.toLowerCase() === String(selectedId).toLowerCase();
  const isSyriatel = wallet.provider === 'syriatel';
  const lines = getWalletDisplayBalanceLines(wallet);

  return (
    <div className={`sam-wallet-row${isSelected ? ' sam-wallet-row--linked' : ''}`}>
      <span className="sam-wallet-row__lead">
        <span
          className={`sam-wallet-row__icon${isSyriatel ? ' sam-wallet-row__icon--syriatel' : ' sam-wallet-row__icon--sham'}`}
          aria-hidden
        >
          {isSyriatel ? (
            <Smartphone strokeWidth={2} />
          ) : (
            <img
              src={SHAMCASH_LOGO_SRC}
              alt=""
              className="sam-wallet-row__brand-logo"
              width={22}
              height={26}
              decoding="async"
              draggable={false}
            />
          )}
        </span>
        <span className="sam-wallet-row__copy">
          <span className="sam-wallet-row__name">{getSamWalletDisplayName(wallet) || (isSyriatel ? t.syriatelCash : t.shamCash)}</span>
          <span className="sam-wallet-row__hint">
            {isSyriatel ? (t.syriatelCash || 'Syriatel') : (t.shamCash || 'ShamCash')}
            {isSelected ? ` · ${t.samApiReceivingBadge || t.samApiLockedBadge}` : ''}
          </span>
        </span>
      </span>
      <span className="sam-wallet-row__amounts" dir="ltr">
        {lines.length > 0 ? (
          lines.map((row) => (
            <span key={row.currency} className="sam-wallet-row__amount font-mono">
              {formatSamCurrencyAmount(row.currency, row.amount)}
            </span>
          ))
        ) : (
          <span className="sam-wallet-row__amount sam-wallet-row__amount--empty">—</span>
        )}
      </span>
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

  const fetchWallets = useCallback(async ({ savePendingKey = false, withBalances = true } = {}) => {
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

      // Same source as dashboard overview — includes USD/SYP balances
      let list = [];
      if (withBalances) {
        const data = await fetchAllSamWalletBalances();
        list = normalizeSamWalletRows(data?.wallets);
      } else {
        const wallets = await listSamWallets();
        list = normalizeSamWalletRows(Array.isArray(wallets) ? wallets : []);
      }
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

      <AdminApiKeyField
        t={t}
        id="sam-api-key"
        title={t.samApiKeyLabel}
        description={t.samApiKeyHelp}
        locked={apiKeyLocked}
        maskedValue={samForm.sam_api_key_masked}
        value={samForm.sam_api_key}
        onChange={(v) => setSamForm((p) => ({ ...p, sam_api_key: v }))}
        placeholder="sk_..."
        onConnect={handleSamTestWallets}
        connectLabel={t.samTestWallets}
        connectDisabled={!samForm.sam_api_key?.trim()}
        connecting={samTesting}
        onDelete={() => setDeleteKeyOpen(true)}
        deleteLabel={t.samApiDeleteKey}
      />

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
              label={(
                <span className="inline-flex items-center gap-1.5">
                  <img
                    src={SHAMCASH_LOGO_SRC}
                    alt=""
                    className="sam-field-brand-logo"
                    width={14}
                    height={16}
                    decoding="async"
                    draggable={false}
                  />
                  {t.samShamcashWalletLabel}
                </span>
              )}
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
        icon={Wallet}
        title={t.samApiLinkedWallets}
        description={t.samApiLinkedWalletsHelp}
      >
        <div className="flex justify-end">
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
        </div>

        {walletsLoading && !samWallets.length ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-4">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            {t.samWalletLoading}
          </div>
        ) : samWallets.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-2">{t.samApiNoWalletsYet}</p>
        ) : (
          <div className="sam-wallet-list">
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
        {/* Main Save lives once in parent AdminPaymentsSettings — avoid duplicate Save buttons */}
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