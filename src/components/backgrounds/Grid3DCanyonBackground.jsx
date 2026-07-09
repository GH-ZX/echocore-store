import './StoreBackgrounds.css';

export default function Grid3DCanyonBackground() {
  return (
    <div className="store-bg store-bg-grid3d-canyon" aria-hidden="true">
      <div className="store-bg-grid3d-canyon-scene">
        <div className="store-bg-grid3d-canyon-sky" />
        <div className="store-bg-grid3d-canyon-wall store-bg-grid3d-canyon-wall--left" />
        <div className="store-bg-grid3d-canyon-wall store-bg-grid3d-canyon-wall--right" />
        <div className="store-bg-grid3d-canyon-floor">
          <div className="store-bg-grid3d-canyon-floor-grid" />
        </div>
        <div className="store-bg-grid3d-canyon-horizon" />
      </div>
      <div className="store-bg-grid3d-vignette" />
    </div>
  );
}