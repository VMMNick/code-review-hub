import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommentMarkdown from './CommentMarkdown.jsx';

describe('CommentMarkdown', () => {
  it('renders basic Markdown formatting', () => {
    render(<CommentMarkdown content="**bold** and *italic*" />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('opens links in a new tab with rel=noopener', () => {
    render(<CommentMarkdown content="[docs](https://example.com)" />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not execute raw HTML embedded in the content (no rehype-raw)', () => {
    const { container } = render(<CommentMarkdown content='<img src="x" onerror="window.__pwned = true">' />);
    // No live <img> element should exist — react-markdown's default
    // pipeline treats this as text/is dropped, it never becomes DOM markup
    // that could fire onerror.
    expect(container.querySelector('img')).toBeNull();
    expect(window.__pwned).toBeUndefined();
  });

  it('renders GFM strikethrough via remark-gfm', () => {
    render(<CommentMarkdown content="~~done~~" />);
    expect(screen.getByText('done').tagName).toBe('DEL');
  });
});
