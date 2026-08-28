import { cn } from "@/lib/utils";

interface SegmentBarProps {
  /** 0–1 arası doluluk oranı. */
  value: number;
  color: string;
  segments?: number;
  className?: string;
  label?: string;
}

/** Sürekli progress bar yerine ayrık bloklardan oluşan mikro gösterge. */
export function SegmentBar({
  value,
  color,
  segments = 20,
  className,
  label,
}: SegmentBarProps) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const filled = Math.round(clamped * segments);

  return (
    <div
      role="img"
      aria-label={label ?? `%${Math.round(clamped * 100)}`}
      className={cn("flex gap-[3px]", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          // Doluluk/renk değişimi CSS transition ile animasyonlu — JS maliyeti yok;
          // kademeli delay soldan sağa dalga etkisi verir.
          className="h-2 min-w-0 flex-1 rounded-[1.5px] transition-colors duration-300 ease-out"
          style={{
            backgroundColor: i < filled ? color : "var(--muted)",
            transitionDelay: segments > 16 ? `${Math.min(i, 10) * 6}ms` : `${i * 10}ms`,
          }}
        />
      ))}
    </div>
  );
}
