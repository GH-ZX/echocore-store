import { describe, expect, it } from 'vitest';
import { renderRichTextLinks } from './richText';

function collectText(nodes) {
  return (nodes || []).map((n) => (typeof n === 'string' ? n : n.props?.children)).join('');
}

describe('renderRichTextLinks', () => {
  it('returns null for empty text', () => {
    expect(renderRichTextLinks('')).toBeNull();
    expect(renderRichTextLinks(null)).toBeNull();
  });

  it('keeps plain text untouched', () => {
    expect(collectText(renderRichTextLinks('Redeem your code'))).toBe('Redeem your code');
  });

  it('turns an https URL into a link', () => {
    const nodes = renderRichTextLinks('Go here: https://redeem.g2bulk.com/redeem/telegram');
    const link = nodes.find((n) => typeof n !== 'string');
    expect(link.props.href).toBe('https://redeem.g2bulk.com/redeem/telegram');
    expect(link.props.target).toBe('_blank');
    expect(link.props.rel).toContain('noopener');
  });

  it('prefixes bare www links with https', () => {
    const nodes = renderRichTextLinks('www.example.com');
    const link = nodes.find((n) => typeof n !== 'string');
    expect(link.props.href).toBe('https://www.example.com');
  });

  it('strips trailing sentence punctuation from the URL', () => {
    const nodes = renderRichTextLinks('Open https://redeem.g2bulk.com/redeem/telegram.');
    const link = nodes.find((n) => typeof n !== 'string');
    expect(link.props.href).toBe('https://redeem.g2bulk.com/redeem/telegram');
  });
});