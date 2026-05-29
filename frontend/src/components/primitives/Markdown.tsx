import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  children: string;
  className?: string;
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
    <div className={cn("markdown-body text-[14px] leading-relaxed text-text break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          p: ({ node: _node, ...props }) => (
            <p className="my-1 first:mt-0 last:mb-0 whitespace-pre-wrap" {...props} />
          ),
          h1: ({ node: _node, ...props }) => (
            <h1 className="text-[18px] font-extrabold mt-3 mb-1.5 first:mt-0" {...props} />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 className="text-[16px] font-bold mt-3 mb-1 first:mt-0" {...props} />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 className="text-[15px] font-bold mt-2 mb-1 first:mt-0" {...props} />
          ),
          h4: ({ node: _node, ...props }) => (
            <h4 className="text-[14px] font-bold mt-2 mb-1 first:mt-0" {...props} />
          ),
          ul: ({ node: _node, ...props }) => (
            <ul className="my-1.5 pl-5 list-disc space-y-0.5" {...props} />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol className="my-1.5 pl-5 list-decimal space-y-0.5" {...props} />
          ),
          li: ({ node: _node, ...props }) => (
            <li className="leading-snug" {...props} />
          ),
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-card-elev border border-border px-1 py-0.5 font-mono text-[12.5px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("font-mono text-[12.5px]", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node: _node, ...props }) => (
            <pre
              className="my-2 overflow-x-auto rounded-xl bg-card-elev border border-border p-3 text-[12.5px] leading-relaxed"
              {...props}
            />
          ),
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              className="my-2 border-l-2 border-lavender pl-3 italic text-text-muted"
              {...props}
            />
          ),
          strong: ({ node: _node, ...props }) => (
            <strong className="font-bold text-text" {...props} />
          ),
          em: ({ node: _node, ...props }) => (
            <em className="italic" {...props} />
          ),
          a: ({ node: _node, ...props }) => (
            <a
              className="text-lavender underline underline-offset-2 hover:text-lavender/80 break-all"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ node: _node, ...props }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-[13px]" {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th className="border-b border-border px-2 py-1 text-left font-semibold" {...props} />
          ),
          td: ({ node: _node, ...props }) => (
            <td className="border-b border-border px-2 py-1" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
