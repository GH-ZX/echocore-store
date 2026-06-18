

export default function EchoLogo({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ filter: 'drop-shadow(0px 0px 8px rgba(34, 211, 238, 0.6))' }}>
      <path d="M50 15 L85 80 L60 80 L50 60 L40 80 L15 80 Z" fill="#0A1128" stroke="#22d3ee" strokeWidth="6" strokeLinejoin="round" />
      <path d="M50 25 L75 72 L62 72 L50 48 L38 72 L25 72 Z" fill="#22d3ee" />
    </svg>
  );
}
