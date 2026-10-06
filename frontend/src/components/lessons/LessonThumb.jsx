const STROKE = "#3B82F6";
const SOFT = "#93C5FD";

function Art({ variant }) {
  switch (variant) {
    case "dna":
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M14 24c13 0 17 32 30 32s17-32 30-32 17 32 30 32" stroke={STROKE} strokeWidth="3" />
          <path d="M14 56c13 0 17-32 30-32s17 32 30 32 17-32 30-32" stroke={SOFT} strokeWidth="3" />
          {[22, 34, 52, 64, 82, 94].map((x) => (
            <line key={x} x1={x} y1="33" x2={x} y2="47" stroke={SOFT} strokeWidth="2" />
          ))}
        </g>
      );
    case "molecule":
      return (
        <g strokeLinecap="round">
          <g stroke={SOFT} strokeWidth="2.5">
            <line x1="60" y1="40" x2="38" y2="26" />
            <line x1="60" y1="40" x2="84" y2="24" />
            <line x1="60" y1="40" x2="62" y2="64" />
            <line x1="84" y1="24" x2="100" y2="40" />
            <line x1="38" y1="26" x2="22" y2="44" />
          </g>
          <circle cx="60" cy="40" r="9" fill={STROKE} />
          <circle cx="38" cy="26" r="6" fill={SOFT} />
          <circle cx="84" cy="24" r="7" fill={STROKE} opacity="0.75" />
          <circle cx="62" cy="64" r="5.5" fill={SOFT} />
          <circle cx="100" cy="40" r="4.5" fill={SOFT} />
          <circle cx="22" cy="44" r="4.5" fill={STROKE} opacity="0.6" />
        </g>
      );
    case "protein":
      return (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M12 52c6-22 16-22 16 0s10 22 16 0 10-22 16 0 10 22 16 0 10-22 16 0"
            stroke={STROKE}
            strokeWidth="3"
          />
          <path d="M92 52c6 0 10-6 16-12" stroke={SOFT} strokeWidth="3" />
          <circle cx="108" cy="38" r="4" fill={SOFT} stroke="none" />
          <circle cx="12" cy="54" r="4" fill={STROKE} stroke="none" />
        </g>
      );
    case "chromosome":
      return (
        <g>
          <rect x="54" y="10" width="12" height="60" rx="6" fill={STROKE} transform="rotate(28 60 40)" />
          <rect x="54" y="10" width="12" height="60" rx="6" fill={SOFT} transform="rotate(-28 60 40)" />
          <circle cx="60" cy="40" r="5" fill="#ffffff" />
          <circle cx="60" cy="40" r="2.5" fill={STROKE} />
        </g>
      );
    case "microscope":
    default:
      return (
        <g fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M52 14l12 6-10 22-12-6z" fill={SOFT} stroke={STROKE} />
          <path d="M47 42l-3 7" />
          <path d="M70 34c10 6 12 20 2 28" />
          <path d="M40 64h44" />
          <path d="M58 56h20" stroke={SOFT} />
          <circle cx="44" cy="51" r="2.5" fill={STROKE} />
        </g>
      );
  }
}

export default function LessonThumb({ variant = "dna", className = "" }) {
  return (
    <span className={`lp-thumb ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 120 80" focusable="false">
        <Art variant={variant} />
      </svg>
    </span>
  );
}
