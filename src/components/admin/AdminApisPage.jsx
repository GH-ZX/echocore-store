import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Cable,
  CheckCircle,
  ChevronDown,
  ImageIcon,
  Loader2,
  Smartphone,
  Zap,
} from 'lucide-react';
import AdminG2BulkSettings from './AdminG2BulkSettings';
import AdminIgdbSettings from './AdminIgdbSettings';
import AdminSamApiPanel from './AdminSamApiPanel';
import { fetchG2bulkSettings } from '../../lib/g2bulk';
import { fetchIgdbSettings } from '../../lib/igdb';
import { fetchSamApiSettings } from '../../lib/samApi';
import {
  getAdminApisPath,
  isValidAdminApisSection,
  resolveAdminApisSectionFromPath,
} from '../../lib/adminRoutes';

function StatusDot({ ok, label }) {
  return (
    <span
      className={`admin-apis-status-pill${ok ? ' admin-apis-status-pill--ok' : ' admin-apis-status-pill--warn'}`}
    >
      <span className="admin-apis-status-pill__dot" aria-hidden />
      {label}
    </span>
  );
}

function ApiSection({
  id,
  open,
  onToggle,
  icon: Icon,
  title,
  description,
  statusOk,
  statusLabel,
  children,
}) {
  return (
    <section className={`admin-apis-section${open ? ' admin-apis-section--open' : ''}`} id={`admin-api-${id}`}>
      <button
        type="button"
        className="admin-apis-section__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="admin-apis-section__lead">
          <span className="admin-apis-section__icon" aria-hidden>
            <Icon className="w-5 h-5" strokeWidth={2} />
          </span>
          <span className="admin-apis-section__titles">
            <span className="admin-apis-section__title">{title}</span>
            <span className="admin-apis-section__desc">{description}</span>
          </span>
        </span>
        <span className="admin-apis-section__meta">
          {statusLabel != null && (
            <StatusDot ok={statusOk} label={statusLabel} />
          )}
          <ChevronDown
            className={`admin-apis-section__chevron${open ? ' admin-apis-section__chevron--open' : ''}`}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <div className="admin-apis-section__body">
          {children}
        </div>
      )}
    </section>
  );
}

export default function AdminApisPage({
  t = {},
  lang = 'ar',
  onCatalogSynced,
  onPaymentSettingsSaved,
  onNotify,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const openId = resolveAdminApisSectionFromPath(location.pathname);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState({
    g2bulk: { ok: false, synced: false },
    sam: { ok: false, mode: 'manual' },
    igdb: { ok: false, auto: false },
  });

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [g2, sam, igdb] = await Promise.allSettled([
        fetchG2bulkSettings(),
        fetchSamApiSettings(),
        fetchIgdbSettings(),
      ]);
      setStatus({
        g2bulk: {
          ok: g2.status === 'fulfilled' && !!g2.value?.g2bulk_api_key_set,
          synced: g2.status === 'fulfilled' && !!g2.value?.g2bulk_last_sync_at,
        },
        sam: {
          ok: sam.status === 'fulfilled' && !!sam.value?.sam_api_key_set,
          mode: sam.status === 'fulfilled' ? (sam.value?.sam_wallet_mode || 'manual') : 'manual',
        },
        igdb: {
          ok: igdb.status === 'fulfilled' && !!igdb.value?.configured,
          auto: igdb.status === 'fulfilled' && !!igdb.value?.igdb_auto_cover_on_sync,
        },
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Legacy location.state.apisSection → path so refresh keeps the section
  useEffect(() => {
    const legacy = location.state?.apisSection;
    if (!legacy || !isValidAdminApisSection(legacy)) return;
    navigate(getAdminApisPath({ section: legacy }), {
      replace: true,
      state: location.state?.focusSypRate ? { focusSypRate: true } : null,
    });
  }, [location.state, navigate]);

  // Focus SYP rate when deep-linked from payments
  useEffect(() => {
    if (!location.state?.focusSypRate || openId !== 'sam') return undefined;
    const timer = window.setTimeout(() => {
      const field = document.getElementById('sam-syp-rate-field');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.querySelector('input')?.focus({ preventScroll: true });
      navigate(location.pathname, { replace: true, state: null });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate, openId]);

  const setSection = (id) => {
    const next = openId === id ? '' : id;
    navigate(getAdminApisPath({ section: next }), { replace: true });
  };

  const readyCount = [status.g2bulk.ok, status.sam.ok, status.igdb.ok].filter(Boolean).length;

  return (
    <div className="admin-apis space-y-5 sm:space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="admin-apis-hero">
        <div className="admin-apis-hero__lead">
          <span className="admin-apis-hero__badge" aria-hidden>
            <Cable className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="admin-apis-hero__title">{t.apisPageTitle}</h2>
            <p className="admin-apis-hero__desc">{t.apisPageDesc}</p>
          </div>
        </div>
        {statusLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] shrink-0" />
        ) : (
          <div className="admin-apis-hero__ok">
            <CheckCircle className="w-4 h-4 text-emerald-400" aria-hidden />
            <span>
              {readyCount}/3 {t.apisReadyCount}
            </span>
          </div>
        )}
      </header>

      <div className="admin-apis-list space-y-3 sm:space-y-4">
        <ApiSection
          id="g2bulk"
          open={openId === 'g2bulk'}
          onToggle={() => setSection('g2bulk')}
          icon={Zap}
          title={t.apisG2bulkTitle}
          description={t.apisG2bulkDesc}
          statusOk={status.g2bulk.ok}
          statusLabel={status.g2bulk.ok ? t.g2bulkApiConfigured : t.g2bulkApiNotSet}
        >
          <AdminG2BulkSettings
            t={t}
            lang={lang}
            onCatalogSynced={() => {
              onCatalogSynced?.();
              refreshStatus();
            }}
            embedded
          />
        </ApiSection>

        <ApiSection
          id="sam"
          open={openId === 'sam'}
          onToggle={() => setSection('sam')}
          icon={Smartphone}
          title={t.apisSamTitle}
          description={t.apisSamDesc}
          statusOk={status.sam.ok}
          statusLabel={status.sam.ok ? (t.samApiKeyConfigured || t.igdbConfigured) : (t.samApiKeyNotSet || t.igdbNotConfigured)}
        >
          <AdminSamApiPanel
            t={t}
            embedded
            onSaved={() => {
              onPaymentSettingsSaved?.();
              refreshStatus();
            }}
            onNotify={onNotify}
          />
        </ApiSection>

        <ApiSection
          id="igdb"
          open={openId === 'igdb'}
          onToggle={() => setSection('igdb')}
          icon={ImageIcon}
          title={t.apisIgdbTitle}
          description={t.apisIgdbDesc}
          statusOk={status.igdb.ok}
          statusLabel={status.igdb.ok ? t.igdbConfigured : t.igdbNotConfigured}
        >
          <AdminIgdbSettings
            t={t}
            embedded
            onNotify={(msg, type) => {
              onNotify?.(msg, type);
              if (type === 'success') refreshStatus();
            }}
          />
        </ApiSection>
      </div>
    </div>
  );
}
