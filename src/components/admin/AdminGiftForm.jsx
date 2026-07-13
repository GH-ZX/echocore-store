import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, Search, UserRound } from 'lucide-react';
import { adminGetUserProfile, fetchAdminUsers } from '../../lib/adminModeration';
import { getSavedGamePlayerEntry } from '../../lib/gamePlayerUid';
import { formatMessage } from '../../lib/i18n';
import AdminOfferCostBadge from './AdminOfferCostBadge';
import {
  getOfferCatalogOptionLabel,
  getOfferPackAmount,
} from '../../lib/offerDisplay';
import { formatOfferWholesaleCost, hasOfferWholesaleCost } from '../../lib/offerCost';
import { isVoucherGame } from '../../lib/catalogUtils';
import {
  getProfileAdminLabel,
  profileNamesDiffer,
} from '../../lib/username';
import ServerIdField from '../catalog/ServerIdField';
import {
  gameShowsServerField,
  resolvePlayerServerForOrder,
} from '../../lib/gameServers';

const RECIPIENT_SEARCH_LIMIT = 50;

function getRecipientPrimaryLabel(row, fallback = '') {
  const name = String(row?.name || '').trim();
  if (name) return name;
  return getProfileAdminLabel(row, fallback);
}

function getRecipientSecondaryLabel(row) {
  const parts = [];
  if (profileNamesDiffer(row)) {
    parts.push(getProfileAdminLabel(row));
  }
  if (row?.email) parts.push(row.email);
  return parts.join(' · ');
}

function resolveGameForOffer(games, offer) {
  if (!offer?.game_id) return null;
  return games.find((g) => g.id === offer.game_id) || null;
}

export default function AdminGiftForm({
  t = {},
  lang = 'ar',
  offers = [],
  games = [],
  initialRecipient = null,
  initialOffer = null,
  initialGame = null,
  lockRecipient = false,
  lockOffer = false,
  onSubmit,
  onNotify,
  onSuccess,
  onCancel,
}) {
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState([]);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [offerId, setOfferId] = useState(initialOffer?.id || '');
  const [playerUid, setPlayerUid] = useState('');
  const [playerServer, setPlayerServer] = useState('');
  const [giftMessage, setGiftMessage] = useState(t.adminGiftDefaultMessage || '');
  const [adminNote, setAdminNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedOffer = useMemo(
    () => offers.find((o) => o.id === offerId) || initialOffer || null,
    [offers, offerId, initialOffer],
  );

  const game = useMemo(
    () => initialGame || resolveGameForOffer(games, selectedOffer),
    [initialGame, games, selectedOffer],
  );

  const isVoucher = game ? isVoucherGame(game) : false;
  const needsUid = game && !isVoucher && (game.redemption_method === 'uid' || game.redemption_method === 'both');
  const needsServerField = needsUid && gameShowsServerField(game);

  const purchasableOffers = useMemo(
    () => [...offers]
      .filter((o) => o?.id && o.active !== false && Number.isFinite(parseFloat(o.price)))
      .sort((a, b) => (getOfferPackAmount(a) ?? Number.POSITIVE_INFINITY) - (getOfferPackAmount(b) ?? Number.POSITIVE_INFINITY)),
    [offers],
  );

  useEffect(() => {
    setRecipient(initialRecipient || null);
  }, [initialRecipient]);

  useEffect(() => {
    setOfferId(initialOffer?.id || '');
  }, [initialOffer?.id]);

  const runRecipientSearch = useCallback(async (query = recipientQuery) => {
    setRecipientPickerOpen(true);
    setSearching(true);
    try {
      const rows = await fetchAdminUsers(String(query || '').trim(), RECIPIENT_SEARCH_LIMIT);
      setRecipientResults((rows || []).filter((row) => row.role !== 'admin'));
    } catch (err) {
      notifyError(err.message);
      setRecipientResults([]);
    } finally {
      setSearching(false);
    }
  }, [recipientQuery, notifyError]);

  const handleRecipientSearchClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    runRecipientSearch(recipientQuery);
  };

  const handleRecipientQueryKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      runRecipientSearch(recipientQuery);
    }
  };

  const savedRecipientGamePlayer = useMemo(
    () => (needsUid && game ? getSavedGamePlayerEntry(recipient?.game_player_uids, game) : { uid: '', server: '' }),
    [needsUid, game, recipient?.game_player_uids],
  );

  useEffect(() => {
    if (!recipient?.id || !needsUid || !game) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const profile = await adminGetUserProfile(recipient.id);
        if (cancelled) return;

        setRecipient((prev) => (
          prev?.id === recipient.id
            ? { ...prev, game_player_uids: profile?.game_player_uids || {} }
            : prev
        ));

        const saved = getSavedGamePlayerEntry(profile?.game_player_uids, game);
        if (saved.uid) {
          setPlayerUid((prev) => prev.trim() || saved.uid);
        }
        if (saved.server) {
          setPlayerServer((prev) => prev.trim() || saved.server);
        }
      } catch {
        /* saved uid is optional */
      }
    })();

    return () => { cancelled = true; };
  }, [recipient?.id, needsUid, game]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!recipient?.id) {
      notifyError(t.adminGiftRecipientRequired);
      return;
    }
    if (!selectedOffer?.id) {
      notifyError(t.adminGiftOfferRequired);
      return;
    }
    if (needsUid && !playerUid.trim()) {
      notifyError(t.adminGiftUidRequired);
      return;
    }
    const resolvedPlayerServer = needsServerField
      ? resolvePlayerServerForOrder(game, playerServer)
      : null;
    if (needsServerField && !resolvedPlayerServer) {
      notifyError(t.serverRequired);
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSubmit?.({
        targetUserId: recipient.id,
        offerId: selectedOffer.id,
        playerUid: playerUid.trim() || null,
        playerServer: resolvedPlayerServer,
        giftMessage: giftMessage.trim() || null,
        adminNote: adminNote.trim() || null,
      });

      notifySuccess(formatMessage(t.adminGiftSuccess, {
        user: getProfileAdminLabel(recipient, t.adminUsersUnnamed),
        offer: getOfferCatalogOptionLabel(selectedOffer, games, lang, offers),
      }));

      onSuccess?.(result);
    } catch (err) {
      notifyError(err.message || t.adminGiftFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const recipientLocked = lockRecipient && !!initialRecipient;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
          {t.adminGiftRecipientLabel}
        </label>
        {recipientLocked ? (
          <div className="rounded-xl border border-[var(--border)] bg-black/20 px-4 py-3 flex items-center gap-3">
            <UserRound className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-bold truncate">{getRecipientPrimaryLabel(recipient, t.adminUsersUnnamed)}</div>
              <div className="text-xs text-[var(--text-muted)] truncate">{getRecipientSecondaryLabel(recipient) || recipient.email}</div>
            </div>
          </div>
        ) : recipient ? (
          <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold truncate">{getRecipientPrimaryLabel(recipient, t.adminUsersUnnamed)}</div>
              <div className="text-xs text-[var(--text-muted)] truncate">
                {getRecipientSecondaryLabel(recipient) || recipient.email}
              </div>
            </div>
            <button type="button" onClick={() => setRecipient(null)} className="text-xs text-[var(--text-sec)] hover:text-white">
              {t.adminGiftChangeRecipient}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="text"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  onKeyDown={handleRecipientQueryKeyDown}
                  placeholder={t.adminUsersSearchPlaceholder}
                  className="input w-full ps-9"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                disabled={searching}
                onClick={handleRecipientSearchClick}
                className="btn btn-secondary shrink-0 px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t.adminUsersSearch}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">{t.adminGiftRecipientSearchHint}</p>
            {recipientPickerOpen && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl max-h-52 overflow-y-auto">
                {searching && (
                  <div className="px-4 py-3 text-sm text-[var(--text-muted)] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.loading}
                  </div>
                )}
                {!searching && recipientResults.length === 0 && (
                  <div className="px-4 py-3 text-sm text-[var(--text-muted)]">{t.adminGiftNoUsersFound}</div>
                )}
                {!searching && recipientResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setRecipient(row);
                      setRecipientQuery('');
                      setRecipientResults([]);
                      setRecipientPickerOpen(false);
                    }}
                    className="w-full text-start px-4 py-3 hover:bg-white/5 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="font-semibold text-sm">{getRecipientPrimaryLabel(row, t.adminUsersUnnamed)}</div>
                    <div className="text-xs text-[var(--text-muted)] break-all">
                      {getRecipientSecondaryLabel(row) || row.email || '—'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!lockOffer && !initialOffer && (
        <div>
          <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
            {t.adminGiftOfferLabel}
          </label>
          <select
            value={offerId}
            onChange={(e) => setOfferId(e.target.value)}
            className="input w-full"
          >
            <option value="">{t.adminGiftSelectOffer}</option>
            {purchasableOffers.map((offer) => {
              const wholesale = hasOfferWholesaleCost(offer) ? ` · $${formatOfferWholesaleCost(offer)}` : '';
              return (
                <option key={offer.id} value={offer.id}>
                  {getOfferCatalogOptionLabel(offer, games, lang, offers)} — ${parseFloat(offer.price).toFixed(2)}{wholesale}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {selectedOffer && (
        <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 px-4 py-3">
          <div className="text-xs text-pink-200/80 mb-1">{t.adminGiftSelectedOffer}</div>
          <div className="font-bold">{getOfferCatalogOptionLabel(selectedOffer, games, lang, offers)}</div>
          <div className="text-sm text-[var(--accent)] font-mono mt-1">
            ${parseFloat(selectedOffer.price).toFixed(2)}
          </div>
          <AdminOfferCostBadge offer={selectedOffer} t={t} className="mt-1.5" />
        </div>
      )}

      {needsUid && (
        <div>
          <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
            {t.playerUidLabel}
          </label>
          <input
            type="text"
            value={playerUid}
            onChange={(e) => setPlayerUid(e.target.value)}
            placeholder={t.enterUid}
            className="input w-full font-mono"
          />
          {savedRecipientGamePlayer.uid && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.gameUidAutofillHint}</p>
          )}
        </div>
      )}

      {needsServerField && (
        <ServerIdField
          game={game}
          value={playerServer}
          onChange={setPlayerServer}
          t={t}
          required
          inputClassName="input w-full font-mono"
        />
      )}

      <div>
        <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
          {t.adminGiftMessageLabel}
        </label>
        <textarea
          value={giftMessage}
          onChange={(e) => setGiftMessage(e.target.value)}
          placeholder={t.adminGiftMessagePlaceholder}
          className="input w-full min-h-[96px]"
          maxLength={500}
        />
        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t.adminGiftMessageHelp}</p>
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
          {t.adminGiftNoteLabel}
        </label>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          className="input w-full min-h-[72px]"
          placeholder={t.adminGiftNotePlaceholder}
          maxLength={500}
        />
        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t.adminGiftNoteHelp}</p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary flex-1 py-3 font-bold inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t.sending}</>
          ) : (
            <><Gift className="w-4 h-4" /> {t.adminGiftSend}</>
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="btn btn-secondary px-5"
          >
            {t.cancel}
          </button>
        )}
      </div>
    </form>
  );
}