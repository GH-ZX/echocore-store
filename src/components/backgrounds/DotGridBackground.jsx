export default function DotGridBackground({ density = 1 }) {
  return (
    <div className="store-bg store-bg-dots" aria-hidden="true" style={{ '--dots-density': density }}>
      <div className="store-bg-dots-grid" />
      <div className="store-bg-dots-scrim" />
    </div>
  );
}