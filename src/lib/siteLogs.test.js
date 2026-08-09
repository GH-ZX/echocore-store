import { describe, expect, it } from 'vitest';
import { formatDevLogCopy, formatDevLogLine } from './siteLogs';

const cssErrorItem = {
  id: 'log-1',
  category: 'error',
  event_type: 'react_error_boundary',
  severity: 'danger',
  created_at: '2026-08-09T12:00:00Z',
  metadata: {
    message: 'Unable to preload CSS for /assets/Aurora-BUiUCx3R.css',
    url: 'https://www.echocore412.com/',
    consoleLog: 'Error: Unable to preload CSS for /assets/Aurora-BUiUCx3R.css',
    componentStack: 'at Lazy\nat Suspense',
    stack: 'Error: Unable to preload CSS',
    userAgent: 'Mozilla/5.0 (test)',
  },
};

const infoItem = {
  id: 'log-2',
  category: 'order',
  event_type: 'placed',
  severity: 'info',
  created_at: '2026-08-09T12:01:00Z',
  metadata: {
    user: 'مصطفى',
    amount: '10',
    reference: '#12',
  },
};

describe('formatDevLogCopy', () => {
  it('includes the exact CSS preload message and component stack', () => {
    const copy = formatDevLogCopy(cssErrorItem, 'ar');
    expect(copy).toContain('Unable to preload CSS for /assets/Aurora-BUiUCx3R.css');
    expect(copy).toContain('componentStack');
    expect(copy).toContain('at Lazy');
    expect(copy).toContain('url=https://www.echocore412.com/');
  });

  it('does not include the noisy user agent', () => {
    const copy = formatDevLogCopy(cssErrorItem, 'ar');
    expect(copy).not.toContain('userAgent');
  });
});

describe('formatDevLogLine copyText', () => {
  it('carries the full payload on error rows', () => {
    const line = formatDevLogLine(cssErrorItem, 'ar');
    expect(line.copyText).toContain('Unable to preload CSS');
    expect(line.copyText).toContain('at Lazy');
  });

  it('excludes non-error rows from copy payload when composed', () => {
    const errorLine = formatDevLogLine(cssErrorItem, 'ar');
    const infoLine = formatDevLogLine(infoItem, 'ar');
    const rows = [errorLine, infoLine];
    const payload = rows
      .filter((l) => l.severity === 'danger' || l.severity === 'warning')
      .map((l) => l.copyText || l.text)
      .filter(Boolean)
      .join('\n\n---\n\n');
    expect(payload).toContain('Unable to preload CSS');
    expect(payload).not.toContain('order.placed');
  });
});
