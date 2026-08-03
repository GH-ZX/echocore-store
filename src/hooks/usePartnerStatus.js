import { useCallback, useEffect, useState } from 'react';
import { fetchMyPartnerTier } from '../lib/partners';
import { fetchMyInfluencerStatus } from '../lib/coupons';

export function usePartnerStatus(user) {
  const [partnerTier, setPartnerTier] = useState(null);
  const [isInfluencer, setIsInfluencer] = useState(false);

  const refreshPartnerTier = useCallback(async (userId = user?.id) => {
    if (!userId) {
      setPartnerTier(null);
      return null;
    }
    try {
      const tier = await fetchMyPartnerTier();
      setPartnerTier(tier);
      return tier;
    } catch {
      setPartnerTier(null);
      return null;
    }
  }, [user?.id]);

  const refreshInfluencerStatus = useCallback(async (userId = user?.id) => {
    if (!userId) {
      setIsInfluencer(false);
      return false;
    }
    try {
      const status = await fetchMyInfluencerStatus();
      const next = !!status?.isInfluencer;
      setIsInfluencer(next);
      return next;
    } catch {
      setIsInfluencer(false);
      return false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || user?.role === 'admin') {
      setPartnerTier(null);
      setIsInfluencer(false);
      return undefined;
    }
    refreshPartnerTier(user.id);
    refreshInfluencerStatus(user.id);
    return undefined;
  }, [user?.id, user?.role, refreshPartnerTier, refreshInfluencerStatus]);

  return {
    partnerTier,
    setPartnerTier,
    isInfluencer,
    refreshPartnerTier,
    refreshInfluencerStatus,
  };
}
