interface Props {
  value: number;
  label: string;
  color?: string;
  size?: number;
}

export function ProgressRing({ value, label, color = 'var(--ro-400)', size = 104 }: Props) {
  const normalized = Math.min(1, Math.max(0, value));
  const circumference = 2 * Math.PI * 44;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - normalized)}
        />
      </svg>
      <div className="text-center">
        <strong className="block text-subhead">{Math.round(normalized * 100)}%</strong>
        <span className="text-caption text-text-muted">{label}</span>
      </div>
    </div>
  );
}
