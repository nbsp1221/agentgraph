import { describe, expect, it } from 'vitest';
import { toReviewerQuery } from './review-data';

describe('review API query mapping', () => {
  it('maps public URL taxonomy to the reviewer API taxonomy', () => {
    const query = toReviewerQuery(
      new URLSearchParams('query=leverframe&page=3&status=completed&evaluation=needs_evaluation'),
    );
    expect(query.get('page')).toBe('3');
    expect(query.get('status')).toBe('completed');
    expect(query.get('evaluation')).toBe('needs_evaluation');
    expect(query.get('query')).toBe('leverframe');
  });

  it('canonicalizes default filters and always requests the contract page size', () => {
    const query = toReviewerQuery(new URLSearchParams('query=&status=all&evaluation=all'));
    expect(query.toString()).toBe('page_size=20');
  });

  it('drops invalid filter and page values before calling the reviewer API', () => {
    const query = toReviewerQuery(
      new URLSearchParams('status=bogus&evaluation=bogus&page=0&query=  '),
    );
    expect(query.toString()).toBe('page_size=20');
  });
});
