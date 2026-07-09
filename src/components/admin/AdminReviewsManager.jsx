import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  X,
  Pencil,
} from 'lucide-react';
import {
  fetchAllReviews,
  saveReview,
  updateReviewStatus,
  deleteReview,
} from '../../lib/customerReviews';

const EMPTY_FORM = {
  author_name: '',
  content: '',
  rating: 5,
  status: 'approved',
  sort_order: 0,
};

export default function AdminReviewsManager({ t = {}, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllReviews();
      setReviews(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = reviews.filter((review) => {
    if (filter === 'all') return true;
    return review.status === filter;
  });

  const pendingCount = reviews.filter((r) => r.status === 'pending').length;

  const handleApprove = async (id) => {
    try {
      await updateReviewStatus(id, 'approved');
      await load();
      onChanged?.();
      setSuccess(t.reviewApproved);
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (id) => {
    try {
      await updateReviewStatus(id, 'rejected');
      await load();
      onChanged?.();
      setSuccess(t.reviewRejected);
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t.reviewDeleteConfirm)) return;
    try {
      await deleteReview(id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (review) => {
    setEditingId(review.id);
    setForm({
      author_name: review.author_name || '',
      content: review.content || '',
      rating: review.rating || 5,
      status: review.status || 'approved',
      sort_order: review.sort_order || 0,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveReview(editingId ? { ...form, id: editingId } : form);
      await load();
      onChanged?.();
      resetForm();
      setSuccess(t.reviewSaved);
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
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

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[var(--accent)]" />
              {t.reviewsAdminTitle}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.reviewsAdminHelp}</p>
          </div>
          <button type="button" onClick={load} className="action-chip gap-2 text-sm">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>

        {pendingCount > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-sm">
            {t.reviewsPendingCount.replace('{count}', String(pendingCount))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { id: 'all', label: t.reviewsFilterAll },
            { id: 'pending', label: t.reviewsFilterPending },
            { id: 'approved', label: t.reviewsFilterApproved },
            { id: 'rejected', label: t.reviewsFilterRejected },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filter === item.id
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] text-[var(--text-sec)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 mb-6">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-[var(--text-muted)] text-sm">{t.reviewsEmpty}</div>
          ) : (
            filtered.map((review) => (
              <div
                key={review.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold">{review.author_name}</span>
                      <span className="text-xs text-amber-400">{'★'.repeat(review.rating || 5)}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        review.status === 'approved'
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : review.status === 'pending'
                            ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                            : 'border-red-500/30 text-red-400 bg-red-500/10'
                      }`}>
                        {review.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-sec)] break-words">{review.content}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {review.status === 'pending' && (
                      <>
                        <button type="button" onClick={() => handleApprove(review.id)} className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10" title={t.reviewApprove}>
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleReject(review.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title={t.reviewReject}>
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => startEdit(review)} className="p-2 rounded-lg text-[var(--accent)] hover:bg-[var(--accent)]/10" title={t.edit}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDelete(review.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title={t.delete}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSave} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--accent)]" />
            {editingId ? t.reviewEditTitle : t.reviewAddTitle}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              value={form.author_name}
              onChange={(e) => setForm((prev) => ({ ...prev, author_name: e.target.value }))}
              placeholder={t.reviewYourName}
              className="input"
            />
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              className="input"
            >
              <option value="approved">{t.reviewsFilterApproved}</option>
              <option value="pending">{t.reviewsFilterPending}</option>
              <option value="rejected">{t.reviewsFilterRejected}</option>
            </select>
          </div>
          <textarea
            required
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            placeholder={t.reviewContent}
            className="input w-full min-h-[90px] resize-y"
          />
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs text-[var(--text-muted)] flex items-center gap-2">
              {t.reviewRating}
              <select
                value={form.rating}
                onChange={(e) => setForm((prev) => ({ ...prev, rating: Number(e.target.value) }))}
                className="input w-24 py-2"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--text-muted)] flex items-center gap-2">
              {t.reviewSortOrder}
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))}
                className="input w-24 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editingId ? t.saveSettings : t.reviewAddTitle}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="action-chip gap-2">
                {t.cancel}
              </button>
            )}
          </div>
        </form>

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