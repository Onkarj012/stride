import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  children: string;
  className?: string;
};

type MarkdownComponentProps = {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

/**
 * Shared markdown renderer for AI-generated text.
 *
 * Wraps react-markdown with consistent typography and design-token-aware
 * styling. Supports the GFM subset commonly emitted by LLMs (bold, italic,
 * headings, lists, code blocks, blockquotes, links, tables).
 *
 * react-markdown is XSS-safe by default — no raw HTML is parsed.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-body text-[0.95rem] leading-relaxed text-text break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          p: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <p className="my-1 first:mt-0 last:mb-0 whitespace-pre-wrap" {...props} />
          ),
          h1: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <h1 className="text-[1.15rem] font-extrabold mt-3 mb-1.5 first:mt-0" {...props} />
          ),
          h2: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <h2 className="text-[1.05rem] font-bold mt-3 mb-1 first:mt-0" {...props} />
          ),
          h3: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <h3 className="text-[0.98rem] font-bold mt-2 mb-1 first:mt-0" {...props} />
          ),
          h4: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <h4 className="text-[0.95rem] font-bold mt-2 mb-1 first:mt-0" {...props} />
          ),
          ul: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <ul className="my-1.5 pl-5 list-disc space-y-0.5" {...props} />
          ),
          ol: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <ol className="my-1.5 pl-5 list-decimal space-y-0.5" {...props} />
          ),
          li: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <li className="leading-snug" {...props} />
          ),
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-card-elev border border-border px-1 py-0.5 font-mono text-[0.8rem]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("font-mono text-[0.8rem]", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <pre
              className="my-2 overflow-x-auto rounded-xl bg-card-elev border border-border p-3 text-[0.8rem] leading-relaxed"
              {...props}
            />
          ),
          blockquote: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <blockquote
              className="my-2 border-l-2 border-lavender pl-3 italic text-text-muted"
              {...props}
            />
          ),
          strong: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <strong className="font-bold text-text" {...props} />
          ),
          em: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <em className="italic" {...props} />
          ),
          a: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <a
              className="text-lavender underline underline-offset-2 hover:text-lavender/80 break-all"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-[0.85rem]" {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <th className="border-b border-border px-2 py-1 text-left font-semibold" {...props} />
          ),
          td: ({ node: _node, ...props }: MarkdownComponentProps) => (
            <td className="border-b border-border px-2 py-1" {...props} />
          ),
        } as any}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
