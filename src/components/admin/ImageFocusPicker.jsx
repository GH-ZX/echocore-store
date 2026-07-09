import { useRef, useCallback, useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';

const PRESETS = [
  { key: 'top-left', labelEn: 'Top Left', labelAr: 'أعلى يسار', x: 0, y: 0 },
  { key: 'top', labelEn: 'Top', labelAr: 'أعلى', x: 50, y: 0 },
  { key: 'top-right', labelEn: 'Top Right', labelAr: 'أعلى يمين', x: 100, y: 0 },
  { key: 'left', labelEn: 'Left', labelAr: 'يسار', x: 0, y: 50 },
  { key: 'center', labelEn: 'Center', labelAr: 'وسط', x: 50, y: 50 },
  { key: 'right', labelEn: 'Right', labelAr: 'يمين', x: 100, y: 50 },
  { key: 'bottom-left', labelEn: 'Bottom Left', labelAr: 'أسفل يسار', x: 0, y: 100 },
  { key: 'bottom', labelEn: 'Bottom', labelAr: 'أسفل', x: 50, y: 100 },
  { key: 'bottom-right', labelEn: 'Bottom Right', labelAr: 'أسفل يمين', x: 100, y: 100 },
];

function getImageBounds(containerRect, naturalW, naturalH) {
  const containerW = containerRect.width;
  const containerH = containerRect.height;
  if (!naturalW || !naturalH) return null;

  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;

  return { renderedW, renderedH, offsetX, offsetY };
}

export default function ImageFocusPicker({
  imageSrc,
  focusX = 50,
  focusY = 50,
  onChange,
  t = {},
  lang = 'en',
}) {
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [markerPos, setMarkerPos] = useState({ left: `${focusX}%`, top: `${focusY}%` });
  const isAr = lang === 'ar';

  const clamp = (v) => Math.max(0, Math.min(100, v));

  const syncMarker = useCallback(() => {
    const container = frameRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const bounds = getImageBounds(container.getBoundingClientRect(), img.naturalWidth, img.naturalHeight);
    if (!bounds) return;

    const { renderedW, renderedH, offsetX, offsetY } = bounds;
    const left = offsetX + (focusX / 100) * renderedW;
    const top = offsetY + (focusY / 100) * renderedH;

    setMarkerPos({
      left: `${(left / container.clientWidth) * 100}%`,
      top: `${(top / container.clientHeight) * 100}%`,
    });
  }, [focusX, focusY]);

  const updateFromPointer = useCallback((clientX, clientY) => {
    const container = frameRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const rect = container.getBoundingClientRect();
    const bounds = getImageBounds(rect, img.naturalWidth, img.naturalHeight);
    if (!bounds) return;

    const { renderedW, renderedH, offsetX, offsetY } = bounds;
    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;

    if (localX < 0 || localY < 0 || localX > renderedW || localY > renderedH) return;

    const x = clamp((localX / renderedW) * 100);
    const y = clamp((localY / renderedH) * 100);
    onChange?.({ x, y });
  }, [onChange]);

  useEffect(() => {
    syncMarker();
  }, [syncMarker, imageSrc]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      e.preventDefault();
      const point = e.touches?.[0] || e;
      updateFromPointer(point.clientX, point.clientY);
    };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, updateFromPointer]);

  if (!imageSrc) return null;

  const pos = `${focusX}% ${focusY}%`;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
        <Crosshair className="w-4 h-4" />
        {t.chooseImageFocus || (isAr ? 'اختر نقطة التركيز في الصورة' : 'Choose image focus point')}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        {t.imageFocusHelp || (isAr
          ? 'اضغط على جزء واحد في الصورة الكاملة أدناه. المعاينة الصغيرة تُظهر ما سيظهر في الكاروسيل.'
          : 'Tap one spot on the full image below. The small preview shows what the carousel will display.')}
      </p>

      {/* Full image — zoomed out, pick one focus point */}
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black/80 cursor-crosshair select-none touch-none min-h-[140px] max-h-[220px] flex items-center justify-center"
        onMouseDown={(e) => {
          setDragging(true);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          setDragging(true);
          const touch = e.touches[0];
          updateFromPointer(touch.clientX, touch.clientY);
        }}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          className="max-w-full max-h-[220px] w-auto h-auto object-contain pointer-events-none"
          onLoad={syncMarker}
          draggable={false}
        />

        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: markerPos.left,
            top: markerPos.top,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="w-6 h-6 rounded-full border-2 border-[var(--accent)] bg-[var(--accent)]/25 shadow-[0_0_10px_rgba(34,211,238,0.45)]" />
          <div className="absolute left-1/2 top-1/2 w-px h-8 -translate-x-1/2 -translate-y-1/2 bg-[var(--accent)]/50" />
          <div className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 bg-[var(--accent)]/50" />
        </div>
      </div>

      {/* Small static carousel crop preview — no animation here */}
      <div>
        <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
          {t.carouselPreview || (isAr ? 'معاينة الكاروسيل' : 'Carousel preview')}
        </p>
        <div
          className="relative w-full overflow-hidden rounded-lg border border-[var(--accent)]/30"
          style={{ aspectRatio: '2.2 / 1', maxHeight: '200px' }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${imageSrc})`,
              backgroundSize: 'cover',
              backgroundPosition: pos,
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-[var(--accent)]/20 pointer-events-none" />
        </div>
        <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1">
          {Math.round(focusX)}% × {Math.round(focusY)}%
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {PRESETS.map((preset) => {
          const active = Math.abs(focusX - preset.x) < 1 && Math.abs(focusY - preset.y) < 1;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange?.({ x: preset.x, y: preset.y })}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-sec)]'
              }`}
            >
              {isAr ? preset.labelAr : preset.labelEn}
            </button>
          );
        })}
      </div>
    </div>
  );
}