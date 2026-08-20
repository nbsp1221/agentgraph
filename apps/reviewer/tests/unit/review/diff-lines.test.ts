import { describe, expect, it } from 'vitest';
import { parseReviewableLines } from '../../../src/review/diff-lines.js';

describe('reviewable diff lines', () => {
  it('collects added lines from modified, added, and renamed files', () => {
    const lines = parseReviewableLines(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -2 +2,2 @@
-old
+new
+added
diff --git a/src/new.ts b/src/new.ts
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+one
+two
diff --git a/old.ts b/new name.ts
--- a/old.ts
+++ b/new name.ts
@@ -5 +5 @@
-old
+new
diff --git a/deleted.ts b/deleted.ts
--- a/deleted.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone`);

    expect([...(lines.get('src/a.ts') ?? [])]).toEqual([2, 3]);
    expect([...(lines.get('src/new.ts') ?? [])]).toEqual([1, 2]);
    expect([...(lines.get('new name.ts') ?? [])]).toEqual([5]);
    expect(lines.has('deleted.ts')).toBe(false);
  });
});
