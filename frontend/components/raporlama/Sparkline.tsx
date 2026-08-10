import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Bağımsız (dependency-free) inline SVG sparkline — satır içi tek kullanım
 * için tam bir chart kütüphanesi ağır kaçar. 2'den az nokta "henüz yeterli
 * veri yok" placeholder'ı gösterir (musteri_metrik_gecmis 9 Ağustos 2026'dan
 * itibaren birikiyor, ilk günlerde bu normal).
 */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  color = "#60a5fa",
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[11px] text-muted-foreground",
          className
        )}
        style={{ width, height }}
        title="Henüz yeterli trend verisi yok"
      >
        —
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <path d={areaPath} fill={color} opacity={0.14} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
