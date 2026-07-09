import './StoreBackgrounds.css';

export default function Grid3DBackground() {
  return (
    <div className="store-bg store-bg-grid3d" aria-hidden="true">
      <div className="store-bg-grid3d-scene">
        <div className="store-bg-grid3d-sky" />
        <div className="store-bg-grid3d-floor">
          <div className="store-bg-grid3d-floor-grid" />
        </div>
        <div className="store-bg-grid3d-horizon" />
        <div className="store-bg-grid3d-pillar store-bg-grid3d-pillar--left" />
        <div className="store-bg-grid3d-pillar store-bg-grid3d-pillar--right" />
      </div>
      <div className="store-bg-grid3d-vignette" />
    </div>
  );
}