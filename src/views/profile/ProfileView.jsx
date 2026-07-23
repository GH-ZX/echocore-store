import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  LogOut,
  ShieldCheck,
  Gamepad2,
  Calendar,
  Mail,
  Loader2,
  Sparkles,
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
import AdminSupplierWalletsCard from '../../components/ui/AdminSupplierWalletsCard';
import { useAdminSupplierWallets } from '../../hooks/useAdminSupplierWallets';
import { formatG2bulkAmount } from '../../lib/g2bulkWalletFormat';
import ProfileAvatar from '../../components/profile/ProfileAvatar';
import ProfileDashTabs from '../../components/profile/dashboard/ProfileDashTabs';
import ProfileOverviewPanel from '../../components/profile/dashboard/ProfileOverviewPanel';
import ProfileOrdersPanel from '../../components/profile/dashboard/ProfileOrdersPanel';
import ProfileWalletPanel from '../../components/profile/dashboard/ProfileWalletPanel';
import ProfileUidsPanel from '../../components/profile/dashboard/ProfileUidsPanel';
import ProfileSecurityPanel from '../../components/profile/dashboard/ProfileSecurityPanel';
import ProfileSupportPanel from '../../components/profile/dashboard/ProfileSupportPanel';
import {
  uploadProfileAvatar,
  updateUserProfileRecord,
  validateProfileAvatarFile,
  PROFILE_SELECT,
  PROFILE_CORE_SELECT,
  emptyProfileValue,
  getDateOfBirthMax,
  getDateOfBirthMin,
  normalizeProfileGender,
  normalizeProfileDateOfBirth,
} from '../../lib/profile';
import {
  formatProfileUsername,
  getProfileUsername,
  normalizeUsernameInput,
  profileNamesDiffer,
  validateUsername,
} from '../../lib/username';
import { changeUsername, getUsernameErrorMessage } from '../../lib/usernameChange';
import {
  authUserHasEmailPassword,
  getAuthUserWithIdentities,
} from '../../lib/auth';
import {
  normalizeDashTab,
  fetchUserOrders,
  fetchUserTransactions,
  fetchUserRecharges,
  sumCompletedOrderSpend,
  sumRechargeCredits,
} from '../../lib/userDashboard';
import UserRoleBadges from '../../components/ui/UserRoleBadges';


function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProfileView({
  t = {},
  lang = 'ar',
  user,
  games = [],
  navigate,
  onLogout,
  onRecharge,
  onUpdateProfile,
  partnerTier = null,
  isInfluencer = false,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const editPanelRef = useRef(null);
  const [profileMeta, setProfileMeta] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [recharges, setRecharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(searchParams.get('edit') === '1');
  const activeTab = normalizeDashTab(searchParams.get('tab'));

  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [usernameDraft, setUsernameDraft] = useState(user?.username || '');
  const [bioDraft, setBioDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [countryDraft, setCountryDraft] = useState('');
  const [favoriteGameDraft, setFavoriteGameDraft] = useState('');
  const [discordDraft, setDiscordDraft] = useState('');
  const [playerUidDraft, setPlayerUidDraft] = useState('');
  const [genderDraft, setGenderDraft] = useState(user?.gender || '');
  const [dateOfBirthDraft, setDateOfBirthDraft] = useState(user?.date_of_birth || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const notSetLabel = t.notSet;

  const [hasPasswordLogin, setHasPasswordLogin] = useState(false);

  const isAdmin = user?.role === 'admin';

  const setActiveTab = useCallback((tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const id = normalizeDashTab(tab);
      if (id === 'overview') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const {
    g2bulkWallet,
    g2bulkError,
    g2bulkFetched,
    samWallets,
    samError,
    samNotConfigured,
    samFetched,
    loading: supplierWalletsLoading,
    idle: supplierWalletsIdle,
    refresh: refreshSupplierWallets,
  } = useAdminSupplierWallets(isAdmin, {
    fetchOnMount: true,
  });

  const syncFormFromProfile = (profile, currentUser) => {
    setNameDraft(profile?.name || currentUser?.name || '');
    setUsernameDraft(getProfileUsername(profile) || getProfileUsername(currentUser) || '');
    setBioDraft(profile?.bio || currentUser?.bio || '');
    setPhoneDraft(profile?.phone || currentUser?.phone || '');
    setCountryDraft(profile?.country || currentUser?.country || '');
    setFavoriteGameDraft(profile?.favorite_game || currentUser?.favorite_game || '');
    setDiscordDraft(profile?.discord_username || currentUser?.discord_username || '');
    setPlayerUidDraft(profile?.default_player_uid || currentUser?.default_player_uid || '');
    setGenderDraft(profile?.gender || currentUser?.gender || '');
    setDateOfBirthDraft(profile?.date_of_birth || currentUser?.date_of_birth || '');
    setAvatarUrl(profile?.avatar_url || currentUser?.avatar_url || '');
    setAvatarPreview('');
    setPendingAvatarFile(null);
    setRemoveAvatar(false);
  };

  useEffect(() => {
    if (!user?.id) return;

    const loadAuthPasswordState = async () => {
      try {
        const authUser = await getAuthUserWithIdentities();
        setHasPasswordLogin(authUserHasEmailPassword(authUser));
      } catch {
        setHasPasswordLogin(false);
      }
    };

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
        const [profileRes, , orders, txs, rechargeRows] = await Promise.all([
          loadProfile(),
          loadAuthPasswordState(),
          fetchUserOrders(user.id, { limit: 100 }),
          fetchUserTransactions(user.id, { limit: 100 }),
          fetchUserRecharges(user.id, { limit: 50 }),
        ]);

        if (profileRes.data) {
          setProfileMeta(profileRes.data);
          syncFormFromProfile(profileRes.data, user);
        }
        setUserOrders(orders || []);
        setTransactions(txs || []);
        setRecharges(rechargeRows || []);
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  useEffect(() => {
    if (searchParams.get('edit') === '1') {
      setEditingProfile(true);
    }
  }, [searchParams]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const balance = profileMeta?.balance ?? user?.balance ?? 0;
  const totalSpent = useMemo(() => sumCompletedOrderSpend(userOrders), [userOrders]);
  const totalRecharges = useMemo(() => sumRechargeCredits(transactions), [transactions]);
  const savedProfile = profileMeta || user || {};
  const savedName = savedProfile.name || user?.name || '';
  const savedUsername = getProfileUsername(savedProfile) || getProfileUsername(user);
  const savedBio = savedProfile.bio || '';
  const savedPhone = savedProfile.phone || '';
  const savedCountry = savedProfile.country || '';
  const savedFavoriteGame = savedProfile.favorite_game || '';
  const savedDiscord = savedProfile.discord_username || '';
  const savedPlayerUid = savedProfile.default_player_uid || '';
  const savedGender = savedProfile.gender || user?.gender || '';
  const savedDateOfBirth = savedProfile.date_of_birth || user?.date_of_birth || '';
  const heroName = editingProfile ? (nameDraft || user.name) : savedName;
  const displayAvatar = removeAvatar ? '' : (avatarPreview || avatarUrl);
  const memberSince = formatDate(profileMeta?.created_at, lang);

  const formatDetail = useCallback(
    (value) => (emptyProfileValue(value) ? notSetLabel : String(value).trim()),
    [notSetLabel],
  );

  const accountTypeLabel = isAdmin ? t.profileRoleAdmin : t.profileRolePlayer;

  const profileDetails = useMemo(() => {
    const genderValue = savedGender === 'male'
      ? t.genderMale
      : savedGender === 'female'
        ? t.genderFemale
        : notSetLabel;
    return [
      ...(savedUsername ? [{
        key: 'username',
        label: t.profileUsername,
        icon: AtSign,
        value: formatProfileUsername(savedUsername),
      }] : []),
      { key: 'gender', label: t.gender, icon: UserRound, value: genderValue },
      {
        key: 'date_of_birth',
        label: t.dateOfBirth,
        icon: Calendar,
        value: savedDateOfBirth ? formatDate(savedDateOfBirth, lang) : notSetLabel,
      },
      { key: 'bio', label: t.profileBio, icon: Sparkles, value: formatDetail(savedBio) },
      { key: 'phone', label: t.profilePhone, icon: Phone, value: formatDetail(savedPhone) },
      { key: 'country', label: t.profileCountry, icon: MapPin, value: formatDetail(savedCountry) },
      { key: 'favorite_game', label: t.profileFavoriteGame, icon: Gamepad2, value: formatDetail(savedFavoriteGame) },
      { key: 'discord', label: t.profileDiscord, icon: AtSign, value: formatDetail(savedDiscord) },
      { key: 'player_uid', label: t.profileDefaultUid, icon: Hash, value: formatDetail(savedPlayerUid) },
      { key: 'member_since', label: t.memberSince, icon: Calendar, value: memberSince },
      { key: 'account_type', label: t.accountType, icon: ShieldCheck, value: accountTypeLabel },
    ];
  }, [savedUsername, savedGender, savedDateOfBirth, savedBio, savedPhone, savedCountry, savedFavoriteGame, savedDiscord, savedPlayerUid, memberSince, accountTypeLabel, t, formatDetail, notSetLabel, lang]);

  const isDirty = useMemo(() => {
    const base = {
      username: getProfileUsername(profileMeta) || getProfileUsername(user) || '',
      name: profileMeta?.name || user?.name || '',
      bio: profileMeta?.bio || user?.bio || '',
      phone: profileMeta?.phone || user?.phone || '',
      country: profileMeta?.country || user?.country || '',
      favorite_game: profileMeta?.favorite_game || user?.favorite_game || '',
      discord_username: profileMeta?.discord_username || user?.discord_username || '',
      default_player_uid: profileMeta?.default_player_uid || user?.default_player_uid || '',
      gender: profileMeta?.gender || user?.gender || '',
      date_of_birth: profileMeta?.date_of_birth || user?.date_of_birth || '',
    };
    const baseAvatar = profileMeta?.avatar_url || user?.avatar_url || '';
    return (
      normalizeUsernameInput(usernameDraft) !== base.username
      || nameDraft.trim() !== base.name.trim()
      || bioDraft.trim() !== base.bio.trim()
      || phoneDraft.trim() !== base.phone.trim()
      || countryDraft.trim() !== base.country.trim()
      || favoriteGameDraft.trim() !== base.favorite_game.trim()
      || discordDraft.trim() !== base.discord_username.trim()
      || playerUidDraft.trim() !== base.default_player_uid.trim()
      || (genderDraft || '') !== (base.gender || '')
      || (dateOfBirthDraft || '') !== (base.date_of_birth || '')
      || !!pendingAvatarFile
      || (removeAvatar && !!baseAvatar)
    );
  }, [usernameDraft, nameDraft, bioDraft, phoneDraft, countryDraft, favoriteGameDraft, discordDraft, playerUidDraft, genderDraft, dateOfBirthDraft, pendingAvatarFile, removeAvatar, profileMeta, user]);

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
      setProfileError(t.nameRequired);
      return;
    }

    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const nextUsername = normalizeUsernameInput(usernameDraft);
      const usernameDirty = nextUsername !== normalizeUsernameInput(savedUsername);

      if (usernameDirty) {
        const usernameCheck = validateUsername(nextUsername);
        if (!usernameCheck.ok) {
          setProfileError(getUsernameErrorMessage(usernameCheck.code, t));
          setSavingProfile(false);
          return;
        }
      }

      let nextAvatarUrl = avatarUrl;

      if (pendingAvatarFile) {
        nextAvatarUrl = await uploadProfileAvatar(user.id, pendingAvatarFile);
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      let usernamePatch = {};
      if (usernameDirty) {
        const usernameResult = await changeUsername(nextUsername);
        // RPC jsonb may arrive as object; always prefer returned username
        const resolvedName = String(
          usernameResult?.username
          || usernameResult?.data?.username
          || nextUsername,
        ).trim().toLowerCase();
        usernamePatch = {
          username: resolvedName,
          username_changed_at: usernameResult?.username_changed_at
            || usernameResult?.data?.username_changed_at
            || new Date().toISOString(),
        };
      }

      const dobCheck = normalizeProfileDateOfBirth(dateOfBirthDraft);
      if (!dobCheck.ok) {
        setProfileError(t.dateOfBirthInvalid || t.profileSaveFailed);
        setSavingProfile(false);
        return;
      }

      const updated = await updateUserProfileRecord(user.id, {
        name: trimmedName,
        bio: bioDraft,
        phone: phoneDraft,
        country: countryDraft,
        favorite_game: favoriteGameDraft,
        discord_username: discordDraft,
        default_player_uid: playerUidDraft,
        gender: normalizeProfileGender(genderDraft),
        date_of_birth: dobCheck.value,
        avatar_url: nextAvatarUrl,
      });

      // Merge username last — profile update SELECT can still return pre-RPC cache,
      // and syncFormFromProfile must not restore the old @name.
      const mergedProfile = { ...updated, ...usernamePatch };
      setProfileMeta((prev) => ({ ...prev, ...mergedProfile }));
      syncFormFromProfile(mergedProfile, { ...user, ...usernamePatch });
      setPendingAvatarFile(null);
      setRemoveAvatar(false);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview('');

      await onUpdateProfile?.({
        name: updated.name,
        ...(usernamePatch.username ? {
          username: usernamePatch.username,
          username_changed_at: usernamePatch.username_changed_at,
        } : {}),
        bio: updated.bio || '',
        phone: updated.phone || '',
        country: updated.country || '',
        favorite_game: updated.favorite_game || '',
        discord_username: updated.discord_username || '',
        default_player_uid: updated.default_player_uid || '',
        gender: updated.gender || null,
        date_of_birth: updated.date_of_birth || null,
        avatar_url: updated.avatar_url || '',
      });

      setProfileSuccess(usernameDirty ? t.usernameChangedSuccess : t.profileSaved);
      setEditingProfile(false);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      }, { replace: true });
    } catch (err) {
      setProfileError(getUsernameErrorMessage(err.message, t) || err.message || t.profileSaveFailed);
    } finally {
      setSavingProfile(false);
    }
  };

  const txLabel = (type) => {
    const map = {
      recharge: t.recharge,
      purchase: t.txnPurchase,
      refund: t.txnRefund,
      adjustment: t.txnAdjustment,
    };
    return map[type] || type;
  };

  const paymentLabel = (method) => {
    if (method === 'balance') return t.payFromBalance;
    if (method === 'binance') return t.binance;
    if (method === 'ShamCash') return t.shamCash;
    if (method === 'SyriatelCash') return t.syriatelCash;
    if (method === 'mastercard') return t.mastercard;
    return method || '—';
  };

  if (!user) return null;

  const supplierStatValue = supplierWalletsLoading
    ? '…'
    : (g2bulkWallet
      ? formatG2bulkAmount(g2bulkWallet.balance)
      : (g2bulkFetched && g2bulkError ? '!' : '—'));

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
                {t.profileTitle}
              </p>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black truncate">{heroName}</h1>
              {savedUsername && (
                <p className="text-sm font-mono text-[var(--accent)] mt-1 truncate">
                  {formatProfileUsername(savedUsername)}
                </p>
              )}
              {profileNamesDiffer(savedProfile) && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{savedName}</p>
              )}
              <p className="flex items-center gap-1.5 mt-2 text-sm text-[var(--text-sec)] min-w-0">
                <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]/70" />
                <span className="truncate">{user.email}</span>
              </p>
              <div className="mt-3">
                <UserRoleBadges
                  t={t}
                  lang={lang}
                  partnerTier={isAdmin ? null : partnerTier}
                  isInfluencer={!isAdmin && isInfluencer}
                  verified={!isAdmin && !!user?.verified_at}
                  isAdmin={isAdmin}
                  showPlayer={!isAdmin}
                  size="md"
                />
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto lg:min-w-[280px] space-y-4">
            {isAdmin ? (
              <AdminSupplierWalletsCard
                t={t}
                variant="card"
                g2bulkBalance={g2bulkWallet != null ? g2bulkWallet.balance : null}
                g2bulkUsername={g2bulkWallet?.username}
                g2bulkError={g2bulkError}
                g2bulkFetched={g2bulkFetched}
                samWallets={samWallets}
                samError={samError}
                samNotConfigured={samNotConfigured}
                samFetched={samFetched}
                loading={supplierWalletsLoading}
                idle={supplierWalletsIdle}
                idleHint={t.walletRefreshHint}
                onRefresh={refreshSupplierWallets}
                onOpenDashboard={() => navigate('/dashboard')}
                onOpenPayments={() => navigate('/dashboard/payments')}
              />
            ) : (
              <div className="profile-balance-panel">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  {t.yourBalance}
                </p>
                <p className="text-3xl sm:text-4xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</p>
                <button
                  type="button"
                  onClick={onRecharge}
                  className="action-chip btn btn-primary !h-11 !min-h-11 !border-0 gap-2 px-5 mt-3 w-full sm:w-auto"
                >
                  <Wallet className="w-4 h-4" />
                  {t.recharge}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="profile-hero__details px-5 sm:px-8 pb-5 sm:pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <UserRound className="w-5 h-5 text-[var(--accent)]" />
                {t.profileDetails}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {t.profileDetailsHelp}
              </p>
            </div>
            {!editingProfile && (
              <button type="button" onClick={openEditProfile} className="btn btn-secondary gap-2 px-4">
                <Pencil className="w-4 h-4" />
                {t.editProfile}
              </button>
            )}
          </div>

          <div className="profile-details-grid">
            {profileDetails.map((item) => (
              <div key={item.key} className="profile-detail-item">
                <span className="profile-detail-label">
                  <item.icon className="w-3.5 h-3.5 text-[var(--accent)]/70" />
                  {item.label}
                </span>
                <p className={`profile-detail-value mt-auto${item.value === notSetLabel ? ' profile-detail-value--empty' : ''}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingProfile && (
      <div ref={editPanelRef} className="card profile-settings profile-settings--editing p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Pencil className="w-5 h-5 text-[var(--accent)]" />
              {t.profileSettings}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t.profileSettingsHelp}
            </p>
          </div>
          <button
            type="button"
            onClick={closeEditProfile}
            className="btn btn-secondary gap-2 px-3"
            aria-label={t.cancelEdit}
          >
            <X className="w-4 h-4" />
            {t.cancelEdit}
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
                aria-label={t.changePhoto}
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
                {t.uploadPhoto}
              </button>
              {(displayAvatar || avatarUrl) && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="btn btn-secondary text-xs px-3 py-2 text-red-400 border-red-500/25 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.removePhoto}
                </button>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center md:text-left">
              {t.photoHint}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="profile-field-label" htmlFor="profile-username">
                {t.profileUsername}
              </label>
              <div className="relative" dir="ltr">
                <span className="absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)] font-mono text-sm pointer-events-none">@</span>
                <input
                  id="profile-username"
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(normalizeUsernameInput(e.target.value))}
                  maxLength={20}
                  disabled={savingProfile}
                  className="profile-field-input font-mono pl-7 text-left disabled:opacity-60"
                  dir="ltr"
                  placeholder={t.profileUsernamePlaceholder}
                  autoComplete="username"
                  spellCheck={false}
                />
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {t.profileUsernameHelp}
              </p>
            </div>

            <div>
              <label className="profile-field-label" htmlFor="profile-name">
                {t.displayName}
              </label>
              <input
                id="profile-name"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={40}
                className="profile-field-input"
                placeholder={t.displayNamePlaceholder}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="profile-field-label" htmlFor="profile-dob">
                  {t.dateOfBirth}
                </label>
                <input
                  id="profile-dob"
                  type="date"
                  value={dateOfBirthDraft || ''}
                  onChange={(e) => setDateOfBirthDraft(e.target.value)}
                  min={getDateOfBirthMin()}
                  max={getDateOfBirthMax()}
                  className="profile-field-input"
                />
              </div>
              <div>
                <span className="profile-field-label">
                  {t.gender}
                </span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: 'male', label: t.genderMale },
                    { id: 'female', label: t.genderFemale },
                  ].map((opt) => {
                    const active = genderDraft === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setGenderDraft((prev) => (prev === opt.id ? '' : opt.id))}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                        }`}
                        aria-pressed={active}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="profile-field-label" htmlFor="profile-bio">
                {t.profileBio}
              </label>
              <textarea
                id="profile-bio"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={160}
                rows={3}
                className="profile-field-input profile-field-textarea resize-none"
                placeholder={t.profileBioPlaceholder}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right font-mono">
                {bioDraft.length}/160
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="profile-field-label" htmlFor="profile-phone">
                  {t.profilePhone}
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  maxLength={20}
                  className="profile-field-input"
                  placeholder={t.profilePhonePlaceholder}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-country">
                  {t.profileCountry}
                </label>
                <input
                  id="profile-country"
                  type="text"
                  value={countryDraft}
                  onChange={(e) => setCountryDraft(e.target.value)}
                  maxLength={60}
                  className="profile-field-input"
                  placeholder={t.profileCountryPlaceholder}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-favorite-game">
                  {t.profileFavoriteGame}
                </label>
                <input
                  id="profile-favorite-game"
                  type="text"
                  value={favoriteGameDraft}
                  onChange={(e) => setFavoriteGameDraft(e.target.value)}
                  maxLength={80}
                  className="profile-field-input"
                  placeholder={t.profileFavoriteGamePlaceholder}
                />
              </div>
              <div>
                <label className="profile-field-label" htmlFor="profile-discord">
                  {t.profileDiscord}
                </label>
                <input
                  id="profile-discord"
                  type="text"
                  value={discordDraft}
                  onChange={(e) => setDiscordDraft(e.target.value)}
                  maxLength={40}
                  className="profile-field-input"
                  placeholder={t.profileDiscordPlaceholder}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="profile-field-label" htmlFor="profile-player-uid">
                  {t.profileDefaultUid}
                </label>
                <input
                  id="profile-player-uid"
                  type="text"
                  value={playerUidDraft}
                  onChange={(e) => setPlayerUidDraft(e.target.value)}
                  maxLength={40}
                  className="profile-field-input font-mono"
                  placeholder={t.profileDefaultUidPlaceholder}
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
                {t.saveProfile}
              </button>
              <button
                type="button"
                onClick={resetProfileForm}
                disabled={!isDirty || savingProfile}
                className="btn btn-secondary gap-2 px-4 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t.resetChanges}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Customer dashboard tabs */}
      <div className="card p-3 sm:p-4">
        <ProfileDashTabs
          t={t}
          active={activeTab}
          onChange={setActiveTab}
          counts={{
            orders: userOrders.length,
            wallet: transactions.length,
            uids: Object.keys(profileMeta?.game_player_uids || user?.game_player_uids || {}).length,
          }}
        />
      </div>

      {loading ? (
        <div className="card p-12 text-center text-[var(--text-sec)]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--accent)]" />
          {t.loadingProfile}
        </div>
      ) : (
        <div className="card p-5 sm:p-6">
          {activeTab === 'overview' && (
            <ProfileOverviewPanel
              t={t}
              lang={lang}
              isAdmin={isAdmin}
              userOrders={userOrders}
              recharges={recharges}
              transactions={transactions}
              totalSpent={totalSpent}
              totalRecharges={totalRecharges}
              balance={balance}
              navigate={navigate}
              onRecharge={onRecharge}
              paymentLabel={paymentLabel}
              onGoTab={setActiveTab}
              supplierStats={{ value: supplierStatValue }}
            />
          )}
          {activeTab === 'orders' && (
            <ProfileOrdersPanel
              t={t}
              lang={lang}
              orders={userOrders}
              navigate={navigate}
              paymentLabel={paymentLabel}
            />
          )}
          {activeTab === 'wallet' && (
            <ProfileWalletPanel
              t={t}
              lang={lang}
              balance={balance}
              transactions={transactions}
              recharges={recharges}
              onRecharge={isAdmin ? undefined : onRecharge}
              navigate={navigate}
              paymentLabel={paymentLabel}
              txLabel={txLabel}
            />
          )}
          {activeTab === 'uids' && (
            <ProfileUidsPanel
              t={t}
              user={user}
              games={games}
              gamePlayerUids={profileMeta?.game_player_uids || user?.game_player_uids || {}}
              onUpdated={(updated) => {
                setProfileMeta((prev) => ({ ...prev, ...updated }));
                onUpdateProfile?.({
                  game_player_uids: updated.game_player_uids,
                  default_player_uid: updated.default_player_uid,
                });
              }}
            />
          )}
          {activeTab === 'security' && (
            <ProfileSecurityPanel
              t={t}
              user={user}
              hasPasswordLogin={hasPasswordLogin}
              onPasswordStateChange={setHasPasswordLogin}
            />
          )}
          {activeTab === 'support' && (
            <ProfileSupportPanel t={t} navigate={navigate} />
          )}
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