import { describe, it, expect, jest } from '@jest/globals';
import { validateUuidParam } from '../src/middleware/validateParams.js';

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('validateUuidParam', () => {
  it('calls next() for a syntactically valid UUID', () => {
    const middleware = validateUuidParam('id');
    const next = jest.fn();
    middleware({}, mockRes(), next, '123e4567-e89b-12d3-a456-426614174000');
    expect(next).toHaveBeenCalledWith();
  });

  it('responds 400 and does not call next() for a malformed id', () => {
    const middleware = validateUuidParam('id');
    const next = jest.fn();
    const res = mockRes();
    middleware({}, res, next, 'not-a-uuid');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
