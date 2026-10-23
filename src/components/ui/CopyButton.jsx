import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Tap-to-copy chip (payment wallet id / reference). Falls back to execCommand for older WebViews. */
export default function CopyButton({ value, label, copiedLabel }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = String(value);
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`copy-chip${copied ? ' is-copied' : ''}`}
      aria-label={label}
    >
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
