import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, resolveUserData } from '../lib/supabase';
import { navigateTo } from '../lib/adminRoutes';
import {
  fetchNotifications,
  INBOX_FETCH_LIMIT,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
  dismissNotification,
  subscribeToNotifications,
  formatNotification,
  getNotificationDestination,
  shouldShowLiveToast,
} from '../lib/notifications';
import { translations } from '../data/translations';

export function useNotificationsState({
  user,
  lang,
  navigate,
  showToast,
  dismissToast,
  setUser,
}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsFetchGenRef = useRef(0);

  const refreshNotifications = useCallback(async (userId = user?.id, limit = 30) => {
    if (!userId) return;
    const fetchGen = notificationsFetchGenRef.current + 1;
    notificationsFetchGenRef.current = fetchGen;
    setNotificationsLoading(true);
    try {
      const [items, count] = await Promise.all([
        fetchNotifications(limit),
        fetchUnreadCount(),
      ]);
      if (notificationsFetchGenRef.current !== fetchGen) return;
      setNotifications(items);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      if (notificationsFetchGenRef.current === fetchGen) {
        setNotificationsLoading(false);
      }
    }
  }, [user?.id]);

  const handleNotificationMarkRead = useCallback(async (notificationId) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => (
        item.id === notificationId
          ? { ...item, read_at: item.read_at || new Date().toISOString() }
          : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }, []);

  const handleNotificationsMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => (
        item.read_at ? item : { ...item, read_at: now }
      )));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  }, []);

  const handleNotificationsClearAll = useCallback(async () => {
    try {
      await clearAllNotifications();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => (
        item.bell_hidden_at
          ? item
          : { ...item, bell_hidden_at: now, read_at: item.read_at || now }
      )));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear bell notifications:', err);
      showToast(translations[lang].clearNotificationsFailed, 'error');
    }
  }, [lang, showToast]);

  const handleNotificationDismiss = useCallback(async (notificationId) => {
    const item = notifications.find((entry) => entry.id === notificationId);
    try {
      const hidden = await dismissNotification(notificationId);
      if (!hidden) return;
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((entry) => (
        entry.id === notificationId
          ? {
            ...entry,
            bell_hidden_at: entry.bell_hidden_at || now,
            read_at: entry.read_at || now,
          }
          : entry
      )));
      if (item && !item.read_at) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (err) {
      console.error('Failed to hide bell notification:', err);
      showToast(translations[lang].dismissNotificationFailed, 'error');
    }
  }, [lang, notifications, showToast]);

  const handleNotificationNavigate = useCallback((dest) => {
    navigateTo(navigate, dest || '/profile');
  }, [navigate]);

  const handleNotificationsClose = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleNotificationsToggle = useCallback(() => {
    setNotificationsOpen((open) => {
      const next = !open;
      if (next) refreshNotifications();
      return next;
    });
  }, [refreshNotifications]);

  const handleRefreshInbox = useCallback(() => {
    refreshNotifications(user?.id, INBOX_FETCH_LIMIT);
  }, [refreshNotifications, user?.id]);

  const handleOpenNotificationsInbox = useCallback(async () => {
    if (user?.role === 'admin') {
      navigate('/dashboard/inbox');
      return;
    }
    if (unreadCount > 0) {
      await handleNotificationsMarkAllRead();
    }
    navigate('/notifications');
  }, [navigate, unreadCount, handleNotificationsMarkAllRead, user?.role]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    refreshNotifications(user.id);

    const unsubscribe = subscribeToNotifications(user.id, async (newItem) => {
      setNotifications((prev) => [newItem, ...prev].slice(0, 30));
      setUnreadCount((count) => count + 1);

      if (shouldShowLiveToast(newItem?.type)) {
        const tLive = translations[lang] || translations.ar;
        const formatted = formatNotification(newItem, tLive, lang);
        const dest = getNotificationDestination(newItem, formatted, user.role);
        const toastType = (formatted.tone === 'danger' || formatted.tone === 'warning')
          ? 'error'
          : 'success';
        showToast(null, toastType, {
          title: formatted.title,
          body: formatted.body,
          duration: 10_000,
          hint: tLive.toastTapToView,
          onClick: () => {
            dismissToast();
            if (newItem?.id) {
              markNotificationRead(newItem.id)
                .then(() => {
                  setNotifications((prev) => prev.map((entry) => (
                    entry.id === newItem.id
                      ? { ...entry, read_at: entry.read_at || new Date().toISOString() }
                      : entry
                  )));
                  setUnreadCount((count) => Math.max(0, count - 1));
                })
                .catch(() => {});
            }
            navigateTo(navigate, dest);
          },
        });
      }

      if (newItem?.type === 'account_banned') {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const refreshed = await resolveUserData(authUser);
        if (refreshed) {
          setUser(refreshed);
          navigate('/banned');
        }
      }
    });

    const pollId = setInterval(() => {
      fetchUnreadCount()
        .then((count) => setUnreadCount(count))
        .catch(() => {});
    }, 60000);

    return () => {
      unsubscribe();
      clearInterval(pollId);
    };
  }, [
    user?.id,
    user?.role,
    refreshNotifications,
    navigate,
    lang,
    showToast,
    dismissToast,
    setUser,
  ]);

  return {
    notifications,
    unreadCount,
    notificationsLoading,
    notificationsOpen,
    refreshNotifications,
    handleNotificationMarkRead,
    handleNotificationsMarkAllRead,
    handleNotificationsClearAll,
    handleNotificationDismiss,
    handleNotificationNavigate,
    handleNotificationsClose,
    handleNotificationsToggle,
    handleRefreshInbox,
    handleOpenNotificationsInbox,
  };
}
