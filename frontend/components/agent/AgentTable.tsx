"use client";

import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import type { TableBlock } from "@/lib/agent-blocks";
import { cn } from "@/lib/utils";

const TAG_HUES: Record<string, string> = {
  izmir: "oklch(0.72 0.10 221)",
  manisa: "oklch(0.70 0.13 162)",
  aydın: "oklch(0.76 0.13 70)",
  aydin: "oklch(0.76 0.13 70)",
  muğla: "oklch(0.62 0.18 293)",
  mugla: "oklch(0.62 0.18 293)",
  denizli: "oklch(0.71 0.16 48)",
  sağlıklı: RISK_COLORS.saglikli,
  saglikli: RISK_COLORS.saglikli,
  izlenmeli: RISK_COLORS.izlenmeli,
  riskli: RISK_COLORS.riskli,
  ödendi: "oklch(0.70 0.13 162)",
  odendi: "oklch(0.70 0.13 162)",
  borçlu: "oklch(0.64 0.19 27)",
  borclu: "oklch(0.64 0.19 27)",
};

function tagBase(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (TAG_HUES[key]) return TAG_HUES[key];
  if (key in RISK_SHORT_LABELS) return RISK_COLORS[key as keyof typeof RISK_COLORS];
  return null;
}

function Cell({ value, first }: { value: string; first?: boolean }) {
  const hue = tagBase(value);
  if (hue) {
    return (
      <span className="agent-tag" style={{ "--tag-base": hue } as React.CSSProperties}>
        {value}
      </span>
    );
  }
  return (
    <span className={cn(first && "font-medium", /₺|%|\d/.test(value) && "tabular-nums")}>
      {value}
    </span>
  );
}

export function AgentTable({ columns, rows }: TableBlock) {
  return (
    <div className="agent-table-shell my-3 max-w-full">
      <div className="agent-table-scroll" tabIndex={0} role="region" aria-label="Sonuç tablosu">
        <table className="agent-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col, j) => (
                  <td key={col}>
                    <Cell value={row[j] ?? ""} first={j === 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
