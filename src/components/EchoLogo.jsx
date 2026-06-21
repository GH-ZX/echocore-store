import echoCoreLogo from '../assets/echo-core-logo.png';

export default function EchoLogo({ className = 'w-10 h-10', alt = 'ECHOCORE' }) {
  return (
    <img
      src={echoCoreLogo}
      alt={alt}
      className={`echo-logo object-contain flex-shrink-0 ${className}`}
      draggable={false}
    />
  );
}