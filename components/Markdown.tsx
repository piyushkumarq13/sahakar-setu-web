"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Tables are the widest thing a model emits. Giving each one its own
// horizontal scroller keeps it inside the chat bubble: the table scrolls,
// the layout never grows.
const markdownComponents: Components = {
  table: ({ node, ...props }) => {
    // react-markdown hands over the hast node — it must never reach the DOM.
    void node;
    return (
      <div className="max-w-full overflow-x-auto">
        <table {...props} />
      </div>
    );
  },
};

/**
 * Renders server/LLM text (chat answers, OCR output, analysis summaries) as
 * markdown: headings, bold, lists, tables, links, quotes. react-markdown
 * builds React elements (never innerHTML), so model output is XSS-safe.
 */
export function MarkdownText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
