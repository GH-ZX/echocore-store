import './StoreBackgrounds.css';

export default function HexGridBackground() {
  return (
    <div className="store-bg store-bg-hex" aria-hidden="true">
      <div className="store-bg-hex-grid" />
      <div className="store-bg-hex-glow" />
    </div>
  );
}