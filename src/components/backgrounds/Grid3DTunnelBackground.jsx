import './StoreBackgrounds.css';

const RINGS = Array.from({ length: 10 }, (_, i) => i);

export default function Grid3DTunnelBackground() {
  return (
    <div className="store-bg store-bg-grid3d-tunnel" aria-hidden="true">
      <div className="store-bg-grid3d-tunnel-scene">
        <div className="store-bg-grid3d-tunnel-vanish" />
        {RINGS.map((i) => (
          <div
            key={i}
            className="store-bg-grid3d-tunnel-ring"
            style={{ '--ring-index': i }}
          />
        ))}
      </div>
      <div className="store-bg-grid3d-vignette" />
    </div>
  );
}