/**
 * ShamCash API helpers (admin test + invoice flow).
 * API token must only be used from admin dashboard — never expose to public pages.
 * Docs: https://shamcash-api.com/en/docs
 */

function normalizeBase(url) {
  return (url || 'https://api.shamcash-api.com/v1').replace(/\/$/, '');
}

async function shamcashRequest(baseUrl, token, path, params = {}) {
  const url = new URL(`${normalizeBase(baseUrl)}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.status !== 'success') {
    const code = payload.code || `HTTP_${response.status}`;
    const message = payload.message || response.statusText || 'Request failed';
    throw new Error(`${code}: ${message}`);
  }

  return payload.data;
}

export async function testShamcashConnection({ apiBaseUrl, apiToken, accountId }) {
  if (!apiToken?.trim()) {
    throw new Error('API token is required');
  }

  const accounts = await shamcashRequest(apiBaseUrl, apiToken, '/accounts');
  const list = Array.isArray(accounts) ? accounts : [];

  let resolvedAccountId = accountId?.trim() || null;
  if (!resolvedAccountId && list.length > 0) {
    const active = list.find((a) => a.status === 'active') || list[0];
    resolvedAccountId = active?.id ?? null;
  }

  let balances = null;
  if (resolvedAccountId) {
    balances = await shamcashRequest(apiBaseUrl, apiToken, '/balances', {
      account_id: resolvedAccountId,
    });
  }

  return {
    accounts: list,
    accountId: resolvedAccountId,
    balances,
    accountCount: list.length,
  };
}

export async function createShamcashInvoice({ apiBaseUrl, apiToken, accountId, amount, reference }) {
  // Platform API is read-focused (accounts/balances/transactions).
  // Until merchant invoice endpoint is available, generate a trackable reference for manual/app payment.
  const ref = reference || `ECHOCORE-${Date.now().toString(36).toUpperCase()}`;

  if (apiToken?.trim() && accountId?.trim()) {
    try {
      await shamcashRequest(apiBaseUrl, apiToken, '/balances', { account_id: accountId });
    } catch (err) {
      throw new Error(`ShamCash not ready: ${err.message}`);
    }
  }

  return {
    reference: ref,
    amount,
    merchantAccountId: accountId,
    note: 'Pay this reference in the ShamCash app. Balance credits after payment is verified.',
  };
}