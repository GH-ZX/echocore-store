import { describe, expect, it } from 'vitest';
import { stripStoreSecrets, STORE_SETTINGS_SECRET_COLUMNS } from './storeSecrets';

describe('stripStoreSecrets', () => {
  it('removes all secret columns', () => {
    const row = {
      id: 1,
      g2bulk_api_key: 'secret-g2',
      sam_api_key: 'secret-sam',
      sam_webhook_secret: 'whsec',
      shamcash_api_token: 'tok',
      igdb_client_id: 'id',
      igdb_client_secret: 'sec',
      theme: { a: 1 },
    };
    const out = stripStoreSecrets(row);
    for (const key of STORE_SETTINGS_SECRET_COLUMNS) {
      expect(out[key]).toBeUndefined();
    }
    expect(out.theme).toEqual({ a: 1 });
    expect(out.id).toBe(1);
  });
});
