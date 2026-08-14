import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// react-markdown renders to React elements, not raw HTML — there's no
// dangerouslySetInnerHTML in the default pipeline, so parsed Markdown can't
// inject a <script> tag even if it slipped past the backend's
// sanitizePlainText. remark-gfm adds GitHub-flavored bits (tables,
// strikethrough, task lists) that are genuinely useful in review comments.
// We deliberately do NOT add rehype-raw, which would let literal HTML in
// the source pass through — keeping that off is what makes the "no
// dangerouslySetInnerHTML" guarantee hold.
export default function CommentMarkdown({ content }) {
  return (
    <div className="comment-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Keep links from silently navigating away in the same tab.
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          code: ({ node, inline, ...props }) => <code {...props} />,
          pre: ({ node, ...props }) => <pre {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
