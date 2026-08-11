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
          code: ({ node, inline, ...props }) =>
            inline ? (
              <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 3 }} {...props} />
            ) : (
              <code
                style={{
                  display: 'block',
                  background: '#f5f5f5',
                  padding: 8,
                  borderRadius: 4,
                  overflowX: 'auto',
                  fontSize: 13
                }}
                {...props}
              />
            )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
