import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread from './CommentThread.jsx';

const baseComment = {
  id: 'c1',
  author_name: 'Коля',
  content: 'Все добре',
  created_at: new Date().toISOString(),
  parent_id: null,
  resolved_at: null
};

// Regression test for a real bug: general (non-line) comments were rendered
// via CommentThread without an onToggleResolved prop, but the component
// unconditionally rendered a resolve button wired straight to that prop —
// clicking it on a general comment threw. Both halves of the fix are
// covered here: the guard (no crash without the prop) and the wiring
// (button works when the prop is provided).
describe('CommentThread resolved toggle', () => {
  it('does not render a resolve button and does not throw when onToggleResolved is not provided', () => {
    expect(() =>
      render(<CommentThread comment={baseComment} replies={[]} onReply={() => {}} />)
    ).not.toThrow();
    expect(screen.queryByRole('button', { name: /позначити вирішеним/i })).not.toBeInTheDocument();
  });

  it('calls onToggleResolved(id, true) when the resolve button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleResolved = vi.fn();
    render(<CommentThread comment={baseComment} replies={[]} onReply={() => {}} onToggleResolved={onToggleResolved} />);

    await user.click(screen.getByRole('button', { name: /позначити вирішеним/i }));

    expect(onToggleResolved).toHaveBeenCalledWith('c1', true);
  });

  it('does not render a resolve button for a reply (has a parent_id)', () => {
    const reply = { ...baseComment, id: 'c2', parent_id: 'c1' };
    render(<CommentThread comment={reply} replies={[]} onReply={() => {}} onToggleResolved={() => {}} />);
    expect(screen.queryByRole('button', { name: /позначити вирішеним/i })).not.toBeInTheDocument();
  });
});
