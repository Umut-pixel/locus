"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AgentRouteMap } from "@/components/agent/AgentRouteMap";
import { AgentTable } from "@/components/agent/AgentTable";
import { FilterTable } from "@/components/agent/FilterTable";
import { InsightChart } from "@/components/agent/InsightChart";
import { LoadingState } from "@/components/agent/LoadingState";
import { RecommendCard, type RecommendAccept } from "@/components/agent/RecommendCard";
import { SelectCard } from "@/components/agent/SelectCard";
import { StreamingWords } from "@/components/agent/StreamingWords";
import {
  parseAgentContent,
  tableToFilterHint,
  type AgentBlock,
} from "@/lib/agent-blocks";
import { cn } from "@/lib/utils";

function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-4 text-[14px] leading-7 last:mb-0">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-ink">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-4 ml-5 list-disc space-y-1.5 text-[14px] leading-7 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-[14px] leading-7 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        h1: ({ children }) => (
          <h3 className="mt-5 mb-2.5 text-[17px] font-semibold first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h3 className="mt-5 mb-2.5 text-[15.5px] font-semibold first:mt-0">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="mt-4 mb-2 text-[14px] font-semibold first:mt-0">{children}</h4>
        ),
        table: () => null,
        thead: () => null,
        tbody: () => null,
        tr: () => null,
        th: () => null,
        td: () => null,
        code: ({ className: cls, children }) => {
          const blok = Boolean(cls);
          if (blok) {
            return <code className="font-mono text-xs text-ink">{children}</code>;
          }
          return (
            <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-3 max-w-full overflow-x-auto rounded-[10px] border border-line bg-inset p-3 last:mb-0">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l border-line pl-3 text-ink-3 last:mb-0">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-4 border-line" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 hover:text-ink-2"
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function BlockView({
  block,
  streamingTail,
  onAccept,
}: {
  block: AgentBlock;
  streamingTail?: boolean;
  onAccept?: (choice: RecommendAccept) => void;
}) {
  switch (block.type) {
    case "pending":
      return <LoadingState label={block.label} timer={false} variant="Dots" />;
    case "table": {
      const hinted = tableToFilterHint(block);
      if (hinted && hinted.filters.length >= 3) {
        return <FilterTable {...hinted} />;
      }
      return <AgentTable columns={block.columns} rows={block.rows} type="table" />;
    }
    case "filter":
      return <FilterTable {...block} />;
    case "chart":
      return <InsightChart block={block} />;
    case "recommend":
      return <RecommendCard block={block} onAccept={onAccept} />;
    case "map":
      return <AgentRouteMap block={block} />;
    case "secim":
      return <SelectCard block={block} />;
    case "markdown":
      if (streamingTail) {
        return <StreamingWords text={block.text} />;
      }
      return <MarkdownBody text={block.text} />;
  }
}

export const AgentMarkdown = memo(function AgentMarkdown({
  children,
  className,
  streaming = false,
  onAccept,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
  onAccept?: (choice: RecommendAccept) => void;
}) {
  const blocks = parseAgentContent(children, { streaming });
  const lastMd = streaming
    ? [...blocks].reverse().findIndex((b) => b.type === "markdown")
    : -1;
  const lastMdIndex = lastMd >= 0 ? blocks.length - 1 - lastMd : -1;

  return (
    <div className={cn("text-[14px] leading-7 text-ink", className)}>
      {blocks.map((block, i) => (
        <BlockView
          key={`${block.type}-${i}`}
          block={block}
          streamingTail={streaming && i === lastMdIndex}
          onAccept={onAccept}
        />
      ))}
    </div>
  );
});
