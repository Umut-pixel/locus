"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Agent yanıtlarını markdown olarak basar.
 *
 * NEDEN GEREKLİ
 *   Agent'ın iş sözlüğü (semantic/metrikler.md) tablo dilinde yazılmış, bu
 *   yüzden yanıtları da düzenli olarak GFM tablosu içeriyor. Ham metin olarak
 *   basınca `|---|---|` satırları görünüyordu.
 *
 * GÜVENLİK
 *   `rehype-raw` BİLEREK yok — ham HTML işlenmez. Agent veritabanından okuduğu
 *   metni (müşteri adı, not) yanıtına taşıyabilir; HTML'e izin vermek o metni
 *   çalıştırılabilir kılardı. Markdown link/vurgu yeter.
 *
 * AKIŞ SIRASINDA
 *   Metin token token geldiği için markdown çoğu anda YARIM olur (kapanmamış
 *   tablo, tek yıldız). react-markdown yarım girdide patlamaz, o ana kadarki
 *   en iyi yorumu basar — bu yüzden akış sırasında da doğrudan kullanılabilir.
 */
export const AgentMarkdown = memo(function AgentMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed text-foreground", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,

          ul: ({ children }) => (
            <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,

          h1: ({ children }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 mb-2 text-[15px] font-semibold first:mt-0">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h4>
          ),

          /**
           * Tablo KENDİ kabında kayar. Sayfa gövdesinin yatay kayması
           * projede yasak — geniş içerik yalnız kendi `overflow-auto`
           * kabında taşar.
           */
          table: ({ children }) => (
            <div className="mb-3 max-w-full overflow-x-auto rounded-lg border border-border last:mb-0">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-semibold whitespace-nowrap text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/60 px-3 py-1.5 align-top">
              {children}
            </td>
          ),

          code: ({ className: cls, children }) => {
            // Blok kodda dil sınıfı gelir; satır içi kodda gelmez.
            const blok = Boolean(cls);
            if (blok) {
              return (
                <code className="font-mono text-xs text-foreground">{children}</code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 last:mb-0">
              {children}
            </pre>
          ),

          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
