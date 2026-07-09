import './StoreBackgrounds.css';

const RINGS = Array.from({ length: 7 }, (_, i) => i);

export default function Grid3DRingsBackground() {
  return (
    <div className="store-bg store-bg-grid3d-rings" aria-hidden="true">
      <div className="store-bg-grid3d-rings-scene">
        <div className="store-bg-grid3d-rings-glow" />
        {RINGS.map((i) => (
          <div
            key={i}
            className="store-bg-grid3d-rings-orbit"
            style={{ '--orbit-index': i }}
          />
        ))}
      </div>
      <div className="store-bg-grid3d-vignette" />
    </div>
  );
}