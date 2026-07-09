import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  ShoppingBag,
  Receipt,
  LogOut,
  ShieldCheck,
  Gamepad2,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Mail,
  Loader2,
  Sparkles,
  Inbox,
  Camera,
  UserRound,
  Save,
  RotateCcw,
  Trash2,
  Pencil,
  Phone,
  MapPin,
  AtSign,
  Hash,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import G2bulkWalletCard from '../../components/ui/G2bulkWalletCard';
import { useAdminG2bulkWallet } from '../../hooks/useAdminG2bulkWallet';
import ProfileAvatar from '../../components/profile/ProfileAvatar';
import {
  uploadProfileAvatar,
  updateUserProfileRecord,
  validateProfileAvatarFile,
  PROFILE_SELECT,
  PROFILE_CORE_SELECT,
  emptyProfileValue,
} from '../../lib/profile';

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileView({
  t = {},
  lang = 'ar',
  user,
  navigate,
  onLogout,
  onRecharge,
  onUpdateProfile,
}) {
  const isAr = lang === 'ar';
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const editPanelRef = useRef(null);
  const [profileMeta, setProfileMeta] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(searchParams.get('edit') === '1');

  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [bioDraft, setBioDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [countryDraft, setCountryDraft] = useState('');
  const [favoriteGameDraft, setFavoriteGameDraft] = useState('');
  const [discordDraft, setDiscordDraft] = useState('');
  const [playerUidDraft, setPlayerUidDraft] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const notSetLabel = isAr ? 'غير محدد' : 'Not set';

  const isAdmin = user?.role === 'admin';
  const { wallet: g2bulkWallet, loading: g2bulkLoading, error: g2bulkError, refresh: refreshG2bulk } = useAdminG2bulkWallet(isAdmin);

  const syncFormFromProfile = (profile, currentUser) => {
    setNameDraft(profile?.name || currentUser?.name || '');
    setBioDraft(profile?.bio || currentUser?.bio || '');
    setPhoneDraft(profile?.phone || currentUser?.phone || '');
    setCountryDraft(profile?.country || currentUser?.country || '');
    setFavoriteGameDraft(profile?.favorite_game || currentUser?.favorite_game || '');
    setDiscordDraft(profile?.discord_username || currentUser?.discord_username || '');
    setPlayerUidDraft(profile?.default_player_uid || currentUser?.default_player_uid || '');
    setAvatarUrl(profile?.avatar_url || currentUser?.avatar_url || '');
    setAvatarPreview('');
    setPendingAvatarFile(null);
    setRemoveAvatar(false);
  };

  useEffect(() => {
    if (!user?.id) return;

    const loadProfile = async () => {
      const full = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', user.id)
        .single();

      if (!full.error) return full;

      const msg = full.error.message || '';
      if (/avatar_url|bio|phone|country|favorite_game|discord_username|default_player_uid|column/i.test(msg)) {
        const core = await supabase
          .from('profiles')
          .select(PROFILE_CORE_SELECT)
          .eq('id', user.id)
          .single();
        if (!core.error) return core;
        return supabase
          .from('profiles')
          .select('name, role, balance, created_at')
          .eq('id', user.id)
          .single();
      }
      return full;
    };

    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, ordersRes, txRes] = await Promise.all([
          loadProfile(),
          supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(15),
        ]);

        if (profileRes.data) {
          setProfileMeta(profileRes.data);
          syncFormFromProfile(profileRes.data, user);
        }
        setUserOrders(ordersRes.data || []);
        setTransactions(txRes.data || []);
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  useEffect(() => {
    if (searchParams.get('edit') === '1') {
      setEditingProfile(true);
    }
  }, [searchParams]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const balance = profileMeta?.balance ?? user?.balance ?? 0;
  const totalSpent = useMemo(
    () => userOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0),
    [userOrders],
  );
  const totalRecharges = useMemo(
    () => transactions.filter((tx) => tx.type === 'recharge').reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0),
    [transactions],
  );

  const savedProfile = profileMeta || user || {};
  const savedName = savedProfile.name || user?.name || '';
  const savedBio = savedProfile.bio || '';
  const savedPhone = savedProfile.phone || '';
  const savedCountry = savedProfile.country || '';
  const savedFavoriteGame = savedProfile.favorite_game || '';
  const savedDiscord = savedProfile.discord_username || '';
  const savedPlayerUid = savedProfile.default_player_uid || '';
  const heroName = editingProfile ? (nameDraft || user.name) : savedName;
  const heroBio = editingProfile ? bioDraft : savedBio;
  const displayAvatar = removeAvatar ? '' : (avatarPreview || avatarUrl);
  const memberSince = formatDate(profileMeta?.created_at, lang);

  const formatDetail = (value) => (emptyProfileValue(value) ? notSetLabel : String(value).trim());

  const profileDetails = useMemo(() => [
    { key: 'name', label: t.displayName || (isAr ? 'اسم العرض' : 'Display name'), icon: UserRound, value: formatDetail(savedName) },
    { key: 'email', label: t.emailAddress || (isAr ? 'البريد الإلكتروني' : 'Email'), icon: Mail, value: user.email, fullWidth: true },
    { key: 'bio', label: t.profileBio || (isAr ? 'نبذة قصيرة' : 'Short bio'), icon: Sparkles, value: formatDetail(savedBio), fullWidth: true },
    { key: 'phone', label: t.profilePhone || (isAr ? 'الهاتف' : 'Phone'), icon: Phone, value: formatDetail(savedPhone) },
    { key: 'country', label: t.profileCountry || (isAr ? 'الدولة' : 'Country'), icon: MapPin, value: formatDetail(savedCountry) },
    { key: 'favorite_game', label: t.profileFavoriteGame || (isAr ? 'اللعبة المفضلة' : 'Favorite game'), icon: Gamepad2, value: formatDetail(savedFavoriteGame) },
    { key: 'discord', label: t.profileDiscord || (isAr ? 'Discord' : 'Discord'), icon: AtSign, value: formatDetail(savedDiscord) },
    { key: 'player_uid', label: t.profileDefaultUid || (isAr ? 'معرّف اللاعب الافتراضي' : 'Default player ID'), icon: Hash, value: formatDetail(savedPlayerUid) },
  ], [savedName, savedBio, savedPhone, savedCountry, savedFavoriteGame, savedDiscord, savedPlayerUid, user.email, t, isAr, notSetLabel]);

  const isDirty = useMemo(() => {
    const base = {
      name: profileMeta?.name || user?.name || '',
      bio: profileMeta?.bio || user?.bio || '',
      phone: profileMeta?.phone || user?.phone || '',
      country: profileMeta?.country || user?.country || '',
      favorite_game: profileMeta?.favorite_game || user?.favorite_game || '',
      discord_username: profileMeta?.discord_username || user?.discord_username || '',
      default_player_uid: profileMeta?.default_player_uid || user?.default_player_uid || '',
    };
    const baseAvatar = profileMeta?.avatar_url || user?.avatar_url || '';
    return (
      nameDraft.trim() !== base.name.trim()
      || bioDraft.trim() !== base.bio.trim()
      || phoneDraft.trim() !== base.phone.trim()
      || countryDraft.trim() !== base.country.trim()
      || favoriteGameDraft.trim() !== base.favorite_game.trim()
      || discordDraft.trim() !== base.discord_username.trim()
      || playerUidDraft.trim() !== base.default_player_uid.trim()
      || !!pendingAvatarFile
      || (removeAvatar && !!baseAvatar)
    );
  }, [nameDraft, bioDraft, phoneDraft, countryDraft, favoriteGameDraft, discordDraft, playerUidDraft, pendingAvatarFile, removeAvatar, profileMeta, user]);

  const handleAvatarPick = (file) => {
    if (!file) return;
    const check = validateProfileAvatarFile(file);
    if (!check.ok) {
      setProfileError(check.message);
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingAvatarFile(null);
    setAvatarPreview('');
    setRemoveAvatar(true);
    setProfileError('');
    setProfileSuccess('');
  };

  const resetProfileForm = () => {
    syncFormFromProfile(profileMeta, user);
    setProfileError('');
    setProfileSuccess('');
  };

  const openEditProfile = () => {
    setEditingProfile(true);
    setProfileError('');
    setProfileSuccess('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('edit', '1');
      return next;
    }, { replace: true });
    requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const closeEditProfile = () => {
    resetProfileForm();
    setEditingProfile(false);
    setProfileError('');
    setProfileSuccess('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      return next;
    }, { replace: true });
  };

  const saveProfile = async () => {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setProfileError(isAr ? 'الاسم مطلوب' : 'Name is required');
      return;
    }

    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      let nextAvatarUrl = avatarUrl;

      if (pendingAvatarFile) {
        nextAvatarUrl = await uploadProfileAvatar(user.id, pendingAvatarFile);
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      const updated = await updateUserProfileRecord(user.id, {
        name: trimmedName,
        bio: bioDraft,
        phone: phoneDraft,
        country: countryDraft,
        favorite_game: favoriteGameDraft,
        discord_username: discordDraft,
        default_player_uid: playerUidDraft,
        avatar_url: nextAvatarUrl,
      });

      setProfileMeta((prev) => ({ ...prev, ...updated }));
      syncFormFromProfile(updated, user);
      setPendingAvatarFile(null);
      setRemoveAvatar(false);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview('');

      await onUpdateProfile?.({
        name: updated.name,
        bio: updated.bio || '',
        phone: updated.phone || '',
        country: updated.country || '',
        favorite_game: updated.favorite_game || '',
        discord_username: updated.discord_username || '',
        default_player_uid: updated.default_player_uid || '',
        avatar_url: updated.avatar_url || '',
      });

      setProfileSuccess(t.profileSaved || (isAr ? 'تم حفظ الملف الشخصي' : 'Profile saved'));
      setEditingProfile(false);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      }, { replace: true });
    } catch (err) {
      setProfileError(err.message || (isAr ? 'فشل الحفظ' : 'Failed to save'));
    } finally {
      setSavingProfile(false);
    }
  };

  const txLabel = (type) => {
    const map = {
      recharge: isAr ? 'شحن رصيد' : 'Recharge',
      purchase: isAr ? 'شراء' : 'Purchase',
      refund: isAr ? 'استرداد' : 'Refund',
      adjustment: isAr ? 'تعديل' : 'Adjustment',
    };
    return map[type] || type;
  };

  const paymentLabel = (method) => {
    if (method === 'balance') return t.payFromBalance || (isAr ? 'الرصيد' : 'Balance');
    if (method === 'binance') return t.binance || 'Binance';
    if (method === 'ShamCash') return t.shamCash || 'ShamCash';
    if (method === 'mastercard') return t.mastercard || 'Card';
    return method || '—';
  };

  if (!user) return null;

  return (
    <div className="profile-page max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-4">
      <div className="card profile-hero overflow-hidden relative">
        <div className="profile-hero-glow pointer-events-none" aria-hidden="true" />
        <div className="relative p-5 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0 flex-1">
            <ProfileAvatar
              name={heroName}
              email={user.email}
              avatarUrl={displayAvatar}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">
                {t.profileTitle || (isAr ? 'الملف الشخصي' : 'My Profile')}
              </p>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black truncate">{heroName}</h1>
              {heroBio?.trim() && (
                <p className="text-sm text-[var(--text-sec)] mt-2 line-clamp-2">{heroBio}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-[var(--text-sec)]">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]/70" />
                  <span className="truncate">{user.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--accent)]/70" />
                  {t.memberSince || (isAr ? 'عضو منذ' : 'Member since')} {memberSince}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className={`profile-badge ${isAdmin ? 'profile-badge--admin' : 'profile-badge--player'}`}>
                  {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <Gamepad2 className="w-3 h-3" />}
                  {isAdmin
                    ? (t.profileRoleAdmin || (isAr ? 'مدير' : 'Admin'))
                    : (t.profileRolePlayer || (isAr ? 'لاعب' : 'Player'))}
                </span>
                <span className="profile-badge profile-badge--verified">
                  <Sparkles className="w-3 h-3" />
                  {t.verifiedGamer || (isAr ? 'عضو موثّق' : 'Verified Member')}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto lg:min-w-[240px]">
            {isAdmin ? (
              <G2bulkWalletCard
                balance={g2bulkWallet?.balance ?? 0}
                username={g2bulkWallet?.username}
                loading={g2bulkLoading}
                error={g2bulkError}
                lang={lang}
                onRefresh={refreshG2bulk}
                onManage={() => navigate('/dashboard')}
                manageLabel={isAr ? 'لوحة G2Bulk' : 'G2Bulk dashboard'}
              />
            ) : (
              <div className="profile-balance-panel">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  {t.currentBalance || (isAr ? 'رصيدك' : 'Your Balance')}
                </p>
                <p className="text-3xl sm:text-4xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</p>
                <button
                  type="button"
                  onClick={onRecharge}
                  className="action-chip btn btn-primary !h-11 !min-h-11 !border-0 gap-2 px-5 mt-3 w-full sm:w-auto"
                >
                  <Wallet className="w-4 h-4" />
                  {t.recharge || 'Recharge'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card profile-details p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <UserRound className="w-5 h-5 text-[var(--accent)]" />
              {t.profileDetails || (isAr ? 'معلومات الحساب' : 'Account details')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t.profileDetailsHelp || (isAr ? 'بياناتك الشخصية وتفضيلات الألعاب.' : 'Your personal info and gaming preferences.')}
            </p>
          </div>
          {!editingProfile && (
            <button type="button" onClick={openEditProfile} className="btn btn-secondary gap-2 px-4">
              <Pencil className="w-4 h-4" />
              {t.editProfile || (isAr ? 'تعديل الملف' : 'Edit profile')}
            </button>
          )}
        </div>

        <div className="profile-details-grid">
          {profileDetails.map((item) => (
            <div
              key={item.key}
              className={`profile-detail-item${item.fullWidth ? ' profile-detail-item--full' : ''}`}
            >
              <span className="profile-detail-label">
                <item.icon className="w-3.5 h-3.5 text-[var(--accent)]/70" />
                {item.label}
              </span>
              <p className={`profile-detail-value${item.value === notSetLabel ? ' profile-detail-value--empty' : ''}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {editingProfile && (
      <div ref={editPanelRef} className="card profile-settings profile-settings--editing p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Pencil className="w-5 h-5 text-[var(--accent)]" />
              {t.profileSettings || (isAr ? 'تعديل الملف الشخصي' : 'Edit Profile')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t.profileSettingsHelp || (isAr ? 'حدّث صورتك وبياناتك الشخصية وتفضيلات الألعاب.' : 'Update your photo, personal details, and gaming preferences.')}
            </p>
          </div>
          <button
            type="button"
            onClick={closeEditProfile}
            className="btn btn-secondary gap-2 px-3"
            aria-label={t.cancelEdit || (isAr ? 'إلغاء' : 'Cancel')}
          >
            <X className="w-4 h-4" />
            {t.cancelEdit || (isAr ? 'إلغاء' : 'Cancel')}
          </button>
        </div>

        <div className="grid md:grid-cols-[auto,1fr] gap-5 sm:gap-6">
          <div className="profile-photo-block">
            <div className="profile-photo-frame">
              <ProfileAvatar
                name={nameDraft || user.name}
                email={user.email}
                avatarUrl={displayAvatar}
                size="lg"
                className="profile-photo-frame__avatar"
              />
              <button
                type="button"
                className="profile-photo-change"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t.changePhoto || (isAr ? 'تغيير الصورة' : 'Change photo')}
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  handleAvatarPick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary text-xs px-3 py-2"
              >
                {t.uploadPhoto || (isAr ? 'رفع صورة' : 'Upload photo')}
              </button>
              {(displayAvatar || avatarUrl) && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="btn btn-secondary text-xs px-3 py-2 text-red-400 border-red-500/25 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.removePhoto || (isAr ? 'إزالة' : 'Remove')}
                </button>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center md:text-left">
              {t.photoHint || (isAr ? 'JPG أو PNG — حتى 2 ميجابايت' : 'JPG or PNG — up to 2 MB')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="profile-field-label" htmlFor="profile-name">
                {t.displayName || (isAr ? 'اسم العرض' : 'Display name')}
              </label>
              <input
                id="profile-name"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={40}
                className="profile-field-input"
                placeholder={isAr ? 'اسمك في المتجر' : 'Your store display name'}
              />
            </div>

            <div>
              <label className="profile-field-label" htmlFor="profile-bio">
                {t.profileBio || (isAr ? 'نبذة قصيرة' : 'Short bio')}
              </label>
              <textarea
                id="profile-bio"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={160}
                rows={3}
                className="profile-field-input profile-field-textarea resize-none"
                placeholder={t.profileBioPlaceholder || (isAr ? 'لاعب MLBB، أحب عروض الشحن السريع...' : 'MLBB player, love fast top-ups...')}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right font-mono">
                {bioDraft.length}/160
              </p>
            </div>

            <div className="profile-field-readonly">
              <span className="profile-field-label">{t.emailAddress || (isAr ? 'البريد الإلكتروني' : 'Email')}</span>
              <p className="text-sm text-[var(--text-sec)] mt-1 break-all">{user.email}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="profile-field-label" htmlFor="profile-phone">
                  {t.profilePhone || (isAr ? 'الهاتف' : 'Phone')}
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  maxLength={20}
                  className="profile-field-input"
                  placeholder={t.profilePhonePlaceholder || (isAr ? '+963...' : '+1...')}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-country">
                  {t.profileCountry || (isAr ? 'الدولة' : 'Country')}
                </label>
                <input
                  id="profile-country"
                  type="text"
                  value={countryDraft}
                  onChange={(e) => setCountryDraft(e.target.value)}
                  maxLength={60}
                  className="profile-field-input"
                  placeholder={t.profileCountryPlaceholder || (isAr ? 'سوريا، الإمارات...' : 'Syria, UAE...')}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-favorite-game">
                  {t.profileFavoriteGame || (isAr ? 'اللعبة المفضلة' : 'Favorite game')}
                </label>
                <input
                  id="profile-favorite-game"
                  type="text"
                  value={favoriteGameDraft}
                  onChange={(e) => setFavoriteGameDraft(e.target.value)}
                  maxLength={80}
                  className="profile-field-input"
                  placeholder={t.profileFavoriteGamePlaceholder || (isAr ? 'Mobile Legends...' : 'Mobile Legends...')}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-discord">
                  {t.profileDiscord || 'Discord'}
                </label>
                <input
                  id="profile-discord"
                  type="text"
                  value={discordDraft}
                  onChange={(e) => setDiscordDraft(e.target.value)}
                  maxLength={40}
                  className="profile-field-input"
                  placeholder={t.profileDiscordPlaceholder || (isAr ? 'username#0000' : 'username')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="profile-field-label" htmlFor="profile-player-uid">
                  {t.profileDefaultUid || (isAr ? 'معرّف اللاعب الافتراضي' : 'Default player ID')}
                </label>
                <input
                  id="profile-player-uid"
                  type="text"
                  value={playerUidDraft}
                  onChange={(e) => setPlayerUidDraft(e.target.value)}
                  maxLength={40}
                  className="profile-field-input font-mono"
                  placeholder={t.profileDefaultUidPlaceholder || (isAr ? 'يُستخدم عند الشراء' : 'Used as default at checkout')}
                />
              </div>
            </div>

            {profileError && <p className="text-sm text-red-400">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-400">{profileSuccess}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={saveProfile}
                disabled={!isDirty || savingProfile}
                className="btn btn-primary gap-2 px-5 disabled:opacity-50"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t.saveProfile || (isAr ? 'حفظ التغييرات' : 'Save changes')}
              </button>
              <button
                type="button"
                onClick={resetProfileForm}
                disabled={!isDirty || savingProfile}
                className="btn btn-secondary gap-2 px-4 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t.resetChanges || (isAr ? 'تراجع' : 'Reset')}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {(isAdmin ? [
          { icon: ShoppingBag, label: t.totalOrders || (isAr ? 'الطلبات' : 'Orders'), value: userOrders.length, color: 'text-blue-400' },
          { icon: Receipt, label: t.totalSpent || (isAr ? 'إجمالي الإنفاق' : 'Total Spent'), value: `$${totalSpent.toFixed(2)}`, color: 'text-[var(--accent)]' },
          { icon: Wallet, label: isAr ? 'رصيد G2Bulk' : 'G2Bulk balance', value: g2bulkLoading ? '…' : (g2bulkWallet ? `$${g2bulkWallet.balance.toFixed(2)}` : '—'), color: 'text-emerald-400' },
          { icon: UserRound, label: t.accountType || (isAr ? 'نوع الحساب' : 'Account'), value: isAr ? 'مدير' : 'Admin', color: 'text-violet-400' },
        ] : [
          { icon: ShoppingBag, label: t.totalOrders || (isAr ? 'الطلبات' : 'Orders'), value: userOrders.length, color: 'text-blue-400' },
          { icon: Receipt, label: t.totalSpent || (isAr ? 'إجمالي الإنفاق' : 'Total Spent'), value: `$${totalSpent.toFixed(2)}`, color: 'text-[var(--accent)]' },
          { icon: ArrowUpRight, label: t.totalRecharged || (isAr ? 'إجمالي الشحن' : 'Total Recharged'), value: `$${totalRecharges.toFixed(2)}`, color: 'text-emerald-400' },
          { icon: UserRound, label: t.accountType || (isAr ? 'نوع الحساب' : 'Account'), value: isAr ? 'لاعب' : 'Gamer', color: 'text-violet-400' },
        ]).map((stat) => (
          <div key={stat.label} className="card p-4 sm:p-5">
            <stat.icon className={`w-5 h-5 mb-2 ${stat.color}`} />
            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wide">{stat.label}</p>
            <p className="text-lg sm:text-xl font-black mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {(isAdmin ? [
          { icon: ShieldCheck, label: t.adminDash, path: '/dashboard' },
          { icon: Inbox, label: t.siteInboxTitle || (isAr ? 'بريد الموقع' : 'Site inbox'), path: '/notifications' },
          { icon: Gamepad2, label: t.browseGames || (isAr ? 'تصفح الألعاب' : 'Browse Games'), path: '/games' },
          { icon: ShoppingCart, label: t.cart || (isAr ? 'السلة' : 'Cart'), path: '/cart' },
        ] : [
          { icon: Inbox, label: t.siteInboxTitle || (isAr ? 'بريد الموقع' : 'Site inbox'), path: '/notifications' },
          { icon: Gamepad2, label: t.browseGames || (isAr ? 'تصفح الألعاب' : 'Browse Games'), path: '/games' },
          { icon: ShoppingCart, label: t.cart || (isAr ? 'السلة' : 'Cart'), path: '/cart' },
          { icon: Wallet, label: t.recharge || (isAr ? 'شحن الرصيد' : 'Recharge'), action: onRecharge },
        ]).map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => (action.action ? action.action() : navigate(action.path))}
            className="action-chip w-full"
          >
            <action.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-[var(--text-sec)]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--accent)]" />
          {t.loadingProfile || (isAr ? 'جاري تحميل الملف الشخصي...' : 'Loading profile...')}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[var(--accent)]" />
                {t.myOrders || (isAr ? 'طلباتي' : 'My Orders')}
              </h2>
              <span className="text-xs text-[var(--text-muted)] font-mono">{userOrders.length}</span>
            </div>
            {userOrders.length === 0 ? (
              <div className="text-center py-10 text-[var(--text-sec)]">
                <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t.noOrdersYet || (isAr ? 'لا توجد طلبات بعد' : 'No orders yet')}</p>
                <button type="button" onClick={() => navigate('/games')} className="action-chip btn btn-secondary mt-4 !h-11">
                  {t.shopNow || (isAr ? 'تسوق الآن' : 'Shop Now')}
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {userOrders.map((order) => {
                  const items = order.order_items || [];
                  const preview = items.map((i) => i.name_snapshot).join(', ') || '—';
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => navigate(`/success?orderId=${order.id}`)}
                      className="profile-list-item w-full text-left group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[var(--text-muted)]">#{order.id.slice(0, 8)}</p>
                          <p className="text-sm font-semibold mt-0.5 truncate group-hover:text-[var(--accent)] transition-colors">{preview}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{formatDateTime(order.created_at, lang)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-[var(--accent)]">${parseFloat(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{paymentLabel(order.payment_method)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[var(--accent)]" />
                {t.transactionHistory || (isAr ? 'سجل المعاملات' : 'Transaction History')}
              </h2>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-10 text-[var(--text-sec)]">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t.noTransactions || (isAr ? 'لا توجد معاملات بعد' : 'No transactions yet')}</p>
                <button type="button" onClick={onRecharge} className="action-chip btn btn-secondary mt-4 !h-11">
                  {t.rechargeNow || (isAr ? 'شحن الرصيد' : 'Recharge Now')}
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {transactions.map((tx) => {
                  const amount = parseFloat(tx.amount || 0);
                  const isCredit = amount > 0;
                  return (
                    <div key={tx.id} className="profile-list-item flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {isCredit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{txLabel(tx.type)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">{paymentLabel(tx.payment_method)} · {formatDateTime(tx.created_at, lang)}</p>
                        </div>
                      </div>
                      <p className={`font-mono font-bold flex-shrink-0 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isCredit ? '+' : ''}{amount.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onLogout}
          className="action-chip h-11 min-h-11 px-6 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300"
        >
          <LogOut className="w-4 h-4" />
          {t.logout}
        </button>
      </div>
    </div>
  );
}