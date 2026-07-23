import { useMemo, useState } from 'react';
import { Save, Trash2, Loader2, Gamepad2 } from 'lucide-react';
import {
  normalizeGamePlayerUids,
  getSavedGamePlayerEntry,
} from '../../../lib/gamePlayerUid';
import { updateUserProfileRecord } from '../../../lib/profile';

export default function ProfileUidsPanel({
  t = {},
  user,
  games = [],
  gamePlayerUids = {},
  onUpdated,
}) {
  const map = useMemo(() => normalizeGamePlayerUids(gamePlayerUids), [gamePlayerUids]);
  const entries = useMemo(() => {
    return Object.entries(map)
      .map(([gameId]) => {
        const game = (games || []).find((g) => String(g.id) === String(gameId));
        const entry = getSavedGamePlayerEntry(map, gameId);
        return {
          gameId,
          game,
          label: game?.name_en || game?.name_ar || game?.slug || gameId.slice(0, 8),
          ...entry,
        };
      })
      .filter((e) => e.uid)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [map, games]);

  const [draftUid, setDraftUid] = useState('');
  const [draftServer, setDraftServer] = useState('');
  const [draftChar, setDraftChar] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const gameOptions = useMemo(() => {
    return (games || [])
      .filter((g) => g?.id && g.active !== false)
      .slice()
      .sort((a, b) => String(a.name_en || a.slug).localeCompare(String(b.name_en || b.slug)));
  }, [games]);

  const persist = async (nextMap) => {
    if (!user?.id) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateUserProfileRecord(user.id, {
        game_player_uids: nextMap,
      });
      onUpdated?.(updated);
      setSuccess(t.dashUidsSaved);
    } catch (err) {
      setError(err.message || t.profileSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const gameId = String(selectedGameId || '').trim();
    const uid = String(draftUid || '').trim();
    if (!gameId || !uid) {
      setError(t.dashUidsNeedGameAndUid);
      return;
    }
    const next = {
      ...map,
      [gameId]: {
        uid,
        ...(draftServer.trim() ? { server: draftServer.trim() } : {}),
        ...(draftChar.trim() ? { charname: draftChar.trim() } : {}),
        updated_at: new Date().toISOString(),
      },
    };
    await persist(next);
    setDraftUid('');
    setDraftServer('');
    setDraftChar('');
  };

  const handleRemove = async (gameId) => {
    const next = { ...map };
    delete next[gameId];
    await persist(next);
  };

  const loadIntoForm = (entry) => {
    setSelectedGameId(entry.gameId);
    setDraftUid(entry.uid || '');
    setDraftServer(entry.server || '');
    setDraftChar(entry.charname || '');
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        {t.dashUidsHelp}
      </p>

      <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <div>
          <label className="profile-field-label" htmlFor="dash-uid-game">
            {t.dashUidsPickGame}
          </label>
          <select
            id="dash-uid-game"
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            className="input w-full text-sm"
            disabled={saving}
          >
            <option value="">{t.dashUidsPickGamePlaceholder}</option>
            {gameOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_en || g.name_ar || g.slug}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="profile-field-label" htmlFor="dash-uid-value">
            {t.profileDefaultUid}
          </label>
          <input
            id="dash-uid-value"
            type="text"
            value={draftUid}
            onChange={(e) => setDraftUid(e.target.value)}
            maxLength={64}
            className="input w-full font-mono text-sm text-left"
            dir="ltr"
            placeholder={t.profileDefaultUidPlaceholder}
            disabled={saving}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="profile-field-label" htmlFor="dash-uid-server">
              {t.dashServerField}
            </label>
            <input
              id="dash-uid-server"
              type="text"
              value={draftServer}
              onChange={(e) => setDraftServer(e.target.value)}
              maxLength={40}
              className="input w-full font-mono text-sm text-left"
              dir="ltr"
              disabled={saving}
            />
          </div>
          <div>
            <label className="profile-field-label" htmlFor="dash-uid-char">
              {t.dashCharNameField}
            </label>
            <input
              id="dash-uid-char"
              type="text"
              value={draftChar}
              onChange={(e) => setDraftChar(e.target.value)}
              maxLength={40}
              className="input w-full text-sm"
              disabled={saving}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.dashUidsSave}
        </button>
      </form>

      <div>
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-[var(--accent)]" />
          {t.dashUidsSavedList}
        </h3>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">{t.dashUidsEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.gameId}
                className="profile-list-item flex flex-wrap items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => loadIntoForm(entry)}
                  className="min-w-0 text-start flex-1"
                >
                  <p className="text-sm font-semibold truncate">{entry.label}</p>
                  <p className="text-xs font-mono text-[var(--text-muted)]" dir="ltr">
                    {entry.uid}
                    {entry.server ? ` · ${entry.server}` : ''}
                    {entry.charname ? ` · ${entry.charname}` : ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(entry.gameId)}
                  disabled={saving}
                  className="btn btn-secondary !p-2 text-red-400 border-red-500/25"
                  title={t.delete || 'Delete'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
