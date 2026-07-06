import './StoreBackgrounds.css';

export default function ScanlineBackground() {
  return (
    <div className="store-bg store-bg-scanlines" aria-hidden="true">
      <div className="store-bg-scanlines-phosphor" />
      <div className="store-bg-scanlines-grid" />
      <div className="store-bg-scanlines-beam" />
      <div className="store-bg-scanlines-beam store-bg-scanlines-beam--slow" />
      <div className="store-bg-scanlines-vignette" />
    </div>
  );
}