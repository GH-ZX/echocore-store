import { describe, expect, it } from 'vitest';
import { deduplicateBroadcastAnnouncements } from './notifications';

describe('deduplicateBroadcastAnnouncements', () => {
  it('returns empty array when passed non-array or empty array', () => {
    expect(deduplicateBroadcastAnnouncements(null)).toEqual([]);
    expect(deduplicateBroadcastAnnouncements([])).toEqual([]);
    expect(deduplicateBroadcastAnnouncements(undefined)).toEqual([]);
  });

  it('keeps single items unchanged', () => {
    const single = [{ id: 1, type: 'admin_announcement', metadata: { title: 'Test' } }];
    expect(deduplicateBroadcastAnnouncements(single)).toEqual(single);
  });

  it('collapses identical broadcast notifications sent in the same batch', () => {
    const timestamp = '2026-09-20T12:00:15.123456Z';
    const batch = [
      {
        id: 'user-1',
        type: 'admin_announcement',
        metadata: { title: 'Maintenance', body: 'Store is updating', kind: 'announcement' },
        created_at: timestamp,
      },
      {
        id: 'user-2',
        type: 'admin_announcement',
        metadata: { title: 'Maintenance', body: 'Store is updating', kind: 'announcement' },
        created_at: timestamp,
      },
      {
        id: 'user-3',
        type: 'admin_announcement',
        metadata: { title: 'Maintenance', body: 'Store is updating', kind: 'announcement' },
        created_at: timestamp,
      },
    ];

    const result = deduplicateBroadcastAnnouncements(batch);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('user-1');
  });

  it('preserves distinct announcements with different titles or timestamps', () => {
    const items = [
      {
        id: 'ann-1',
        type: 'admin_announcement',
        metadata: { title: 'Announcement A', body: 'Body A', kind: 'announcement' },
        created_at: '2026-09-20T10:00:00Z',
      },
      {
        id: 'ann-1-dup',
        type: 'admin_announcement',
        metadata: { title: 'Announcement A', body: 'Body A', kind: 'announcement' },
        created_at: '2026-09-20T10:00:00Z',
      },
      {
        id: 'ann-2',
        type: 'admin_announcement',
        metadata: { title: 'Announcement B', body: 'Body B', kind: 'announcement' },
        created_at: '2026-09-20T11:00:00Z',
      },
    ];

    const result = deduplicateBroadcastAnnouncements(items);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ann-1');
    expect(result[1].id).toBe('ann-2');
  });
});
