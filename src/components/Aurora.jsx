import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef, useCallback } from 'react';

import './Aurora.css';

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ), 
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  
  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  
  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity) * 0.92;
  
  vec3 auroraColor = intensity * rampColor;
  
  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

function cssHex(varName, fallback = '#7cff67') {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!val || !val.startsWith('#')) return fallback;
  return val;
}

function themeColorStops() {
  const accent = cssHex('--accent', '#22d3ee');
  const accentHover = cssHex('--accent-hover', accent);

  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  const hr = parseInt(accentHover.slice(1, 3), 16);
  const hg = parseInt(accentHover.slice(3, 5), 16);
  const hb = parseInt(accentHover.slice(5, 7), 16);

  const bright = (c) => Math.min(255, Math.round(c * 1.15 + 32));
  const muted = (c) => Math.round(c * 0.42 + 48);

  return [
    `#${bright(hr).toString(16).padStart(2, '0')}${bright(hg).toString(16).padStart(2, '0')}${bright(hb).toString(16).padStart(2, '0')}`,
    accent,
    `#${muted(r).toString(16).padStart(2, '0')}${muted(g).toString(16).padStart(2, '0')}${muted(b).toString(16).padStart(2, '0')}`,
  ];
}

/** Read a numeric CSS variable, fallback to prop value */
function cssNum(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  const val = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName).trim());
  return isNaN(val) ? fallback : val;
}

/** Read a boolean CSS variable ('true'/'false'), fallback to prop value */
function cssBool(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Aurora({
  enabled: propEnabled,
  responsive: propResponsive,
  amplitude: propAmplitude,
  blend: propBlend,
  speed: propSpeed,
}) {
  // Read settings from CSS vars (set by theme system), fallback to props or defaults
  const enabled = (propEnabled ?? cssBool('--aurora-enabled', true)) && !prefersReducedMotion();
  const responsive = propResponsive ?? cssBool('--aurora-responsive', true);
  const amplitude = propAmplitude ?? cssNum('--aurora-amplitude', 0.52);
  const blend = propBlend ?? cssNum('--aurora-blend', 0.36);
  const speed = propSpeed ?? cssNum('--aurora-speed', 0.32);

  const ctnDom = useRef(null);
  const programRef = useRef(null);
  const meshRef = useRef(null);
  const rendererRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.2 });

  const getColors = useCallback(() => themeColorStops(), []);

  useEffect(() => {
    if (!enabled) return;

    const ctn = ctnDom.current;
    if (!ctn) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';

    rendererRef.current = renderer;

    let program;

    function resize() {
      if (!ctn) return;
      const width = ctn.offsetWidth;
      const height = ctn.offsetHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      if (program) {
        program.uniforms.uResolution.value = [width, height];
      }
    }

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const initColors = getColors().map(hex => {
      const c = new Color(hex);
      return [c.r, c.g, c.b];
    });

    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: initColors },
        uResolution: { value: [ctn.offsetWidth || 1, ctn.offsetHeight || 1] },
        uBlend: { value: blend },
      },
    });
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry, program });
    meshRef.current = mesh;
    ctn.appendChild(gl.canvas);

    // Handle theme changes
    const syncUniforms = () => {
      if (!program) return;
      const colors = getColors().map(hex => {
        const c = new Color(hex);
        return [c.r, c.g, c.b];
      });
      program.uniforms.uColorStops.value = colors;
      program.uniforms.uAmplitude.value = cssNum('--aurora-amplitude', amplitude);
      program.uniforms.uBlend.value = cssNum('--aurora-blend', blend);
    };

    const handleThemeChange = () => syncUniforms();
    window.addEventListener('themechange', handleThemeChange);

    // Cursor / touch tracking — moves the aurora center
    const handlePointer = (e) => {
      if (!responsive || !ctn) return;
      const src = e.touches?.[0] || e;
      const rect = ctn.getBoundingClientRect();
      mouseRef.current = {
        x: (src.clientX - rect.left) / rect.width,
        y: (src.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener('pointermove', handlePointer);
    window.addEventListener('touchmove', handlePointer, { passive: true });

    let animateId = 0;
    let isVisible = !document.hidden;

    const update = (t) => {
      animateId = requestAnimationFrame(update);
      if (!isVisible) return;
      if (program) {
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const timeOffset = responsive ? (mx * 0.3 + my * 0.2) : 0;
        const liveSpeed = cssNum('--aurora-speed', speed);
        program.uniforms.uTime.value = t * 0.001 * liveSpeed + timeOffset;
      }
      renderer.render({ scene: mesh });
    };
    animateId = requestAnimationFrame(update);

    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    requestAnimationFrame(resize);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animateId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', resize);
      window.removeEventListener('themechange', handleThemeChange);
      window.removeEventListener('pointermove', handlePointer);
      window.removeEventListener('touchmove', handlePointer);
      if (ctn && gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, responsive, amplitude, blend, speed]);

  if (!enabled) return null;

  return <div ref={ctnDom} className="aurora-container" aria-hidden="true" />;
}
