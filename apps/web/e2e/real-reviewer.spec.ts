import { type Page, expect, test } from '@playwright/test';

const reviewerUrl = 'http://127.0.0.1:16722';

async function forwardApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const targetUrl = new URL(route.request().url());
    const body = request.postData();
    const response = await fetch(`${reviewerUrl}${targetUrl.pathname}${targetUrl.search}`, {
      method: request.method(),
      headers: request.headers(),
      ...(body === null ? {} : { body }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
      status: response.status,
    });
  });
}

test('browser evaluation writes use the real reviewer contracts', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only real reviewer contract flow');
  const detailResponse = await request.get(`${reviewerUrl}/api/v1/reviews/1`);
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()) as {
    artifact: { findings: Array<{ fingerprint: string }> };
  };
  const actualFingerprint = detail.artifact.findings[0]?.fingerprint;
  if (actualFingerprint === undefined) {
    throw new Error('real reviewer fixture finding is missing');
  }
  expect(actualFingerprint).toMatch(/^[0-9a-f]{16}$/);
  const externalReviewWrite = await request.put(`${reviewerUrl}/api/v1/reviews/1/evaluation`, {
    data: {
      verdict: 'useful',
      rationale: 'human-approved external review evaluation',
      expected_previous_id: null,
    },
  });
  expect(externalReviewWrite.ok()).toBe(true);
  const externalFindingWrite = await request.put(
    `${reviewerUrl}/api/v1/reviews/1/findings/${actualFingerprint}/evaluation`,
    {
      data: {
        verdict: 'false_positive',
        rationale: 'human-approved external finding evaluation',
        expected_previous_id: null,
      },
    },
  );
  expect(externalFindingWrite.ok()).toBe(true);
  await forwardApi(page);

  await page.goto('/en/reviews/1');
  await expect(page.getByRole('heading', { name: 'Real E2E review' })).toBeVisible();
  const reviewEvaluation = page.getByRole('complementary');
  await expect(
    reviewEvaluation.getByRole('button', { name: 'Useful', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(reviewEvaluation.getByRole('textbox', { name: 'Rationale' })).toHaveValue(
    'human-approved external review evaluation',
  );
  const rationale = page.getByRole('textbox', { name: 'Rationale' }).first();
  await rationale.fill('real reviewer write');
  await page.getByRole('button', { name: 'Save evaluation' }).first().click();
  await expect(page.getByRole('status')).toContainText('Evaluation saved');
  await page.getByRole('button', { name: 'Mixed' }).first().click();
  await page.getByRole('button', { name: 'Save evaluation' }).first().click();
  await expect(page.getByRole('status')).toContainText('Evaluation saved');

  const evidence = page.getByRole('button', { name: 'Evidence and suggested action' }).first();
  await evidence.click();
  const finding = page.locator('article').first();
  await expect(
    finding.getByRole('button', { name: 'False positive', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(finding.getByRole('textbox', { name: 'Rationale' })).toHaveValue(
    'human-approved external finding evaluation',
  );
  await finding.getByRole('button', { name: 'Valid', exact: true }).click();
  await finding.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(finding.getByRole('status')).toContainText('Evaluation saved');
  await finding.getByRole('button', { name: 'Partially valid', exact: true }).click();
  await finding.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(finding.getByRole('status')).toContainText('Evaluation saved');
  await finding.getByRole('button', { name: 'View history' }).click();

  const evaluationsAfterSet = await request.get(`${reviewerUrl}/api/v1/reviews/1/evaluations`);
  const evaluationData = (await evaluationsAfterSet.json()) as {
    review: { current: { verdict: string } | null; history: unknown[] };
    findings: Record<string, { current: { verdict: string } | null; history: unknown[] }>;
  };
  expect(evaluationData.review.current?.verdict).toBe('mixed');
  expect(evaluationData.review.history.length).toBeGreaterThanOrEqual(2);
  expect(evaluationData.findings[actualFingerprint]?.current?.verdict).toBe('partially_valid');
  expect(evaluationData.findings[actualFingerprint]?.history.length).toBeGreaterThanOrEqual(2);

  await finding.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('Evaluation withdrawn.', { exact: true })).toBeVisible();
  const evaluationsAfterFindingWithdraw = await request.get(
    `${reviewerUrl}/api/v1/reviews/1/evaluations`,
  );
  const afterFindingWithdraw =
    (await evaluationsAfterFindingWithdraw.json()) as typeof evaluationData;
  expect(afterFindingWithdraw.findings[actualFingerprint]?.current).toBeNull();
  expect(afterFindingWithdraw.findings[actualFingerprint]?.history.length).toBeGreaterThanOrEqual(
    3,
  );

  await page.getByRole('complementary').getByRole('button', { name: 'Withdraw' }).click();
  await expect(
    page.getByRole('complementary').getByText('Evaluation withdrawn.', { exact: true }),
  ).toBeVisible();
  const evaluationsAfterWithdraw = await request.get(`${reviewerUrl}/api/v1/reviews/1/evaluations`);
  expect(
    ((await evaluationsAfterWithdraw.json()) as typeof evaluationData).review.current,
  ).toBeNull();

  await page.reload();
  const reloadedReviewEvaluation = page.getByRole('complementary');
  await reloadedReviewEvaluation.getByRole('button', { name: 'Useful', exact: true }).click();
  await reloadedReviewEvaluation
    .getByRole('textbox', { name: 'Rationale' })
    .fill('saved after withdrawal');
  await reloadedReviewEvaluation.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(reloadedReviewEvaluation.getByRole('status')).toContainText('Evaluation saved');

  await page.getByRole('button', { name: 'Evidence and suggested action' }).first().click();
  const reloadedFinding = page.locator('article').first();
  await reloadedFinding.getByRole('button', { name: 'Valid', exact: true }).click();
  await reloadedFinding.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(reloadedFinding.getByRole('status')).toContainText('Evaluation saved');

  const evaluationsAfterReload = await request.get(`${reviewerUrl}/api/v1/reviews/1/evaluations`);
  const afterReload = (await evaluationsAfterReload.json()) as typeof evaluationData;
  expect(afterReload.review.current?.verdict).toBe('useful');
  expect(afterReload.findings[actualFingerprint]?.current?.verdict).toBe('valid');
});

test('browser preserves a human draft when an external client wins the revision race', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only real reviewer contract flow');
  const before = (await (
    await request.get(`${reviewerUrl}/api/v1/reviews/1/evaluations`)
  ).json()) as { review: { current: { id: number } | null } };
  const currentId = before.review.current?.id;
  if (currentId === undefined) {
    throw new Error('real reviewer fixture review evaluation is missing');
  }
  await forwardApi(page);
  await page.goto('/en/reviews/1');
  const reviewEvaluation = page.getByRole('complementary');
  const rationale = reviewEvaluation.getByRole('textbox', { name: 'Rationale' });
  await reviewEvaluation.getByRole('button', { name: 'Mixed', exact: true }).click();
  await rationale.fill('human draft must survive a stale write');

  const externalWrite = await request.put(`${reviewerUrl}/api/v1/reviews/1/evaluation`, {
    data: {
      verdict: 'not_useful',
      rationale: 'newer human-approved external evaluation',
      expected_previous_id: currentId,
    },
  });
  expect(externalWrite.ok()).toBe(true);

  await reviewEvaluation.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(reviewEvaluation.getByText('This evaluation changed elsewhere.')).toBeVisible();
  await expect(rationale).toHaveValue('human draft must survive a stale write');
  await expect(
    reviewEvaluation.getByRole('button', { name: 'Mixed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const after = (await (
    await request.get(`${reviewerUrl}/api/v1/reviews/1/evaluations`)
  ).json()) as { review: { current: { verdict: string; rationale: string } | null } };
  expect(after.review.current).toMatchObject({
    verdict: 'not_useful',
    rationale: 'newer human-approved external evaluation',
  });
});

test('browser preserves drafts on a 500 response', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only real reviewer contract flow');
  await page.goto('/en/reviews/241?fixture=not-evaluated');
  await page.route('**/api/v1/reviews/241/evaluation', (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'fixture failure' }) }),
  );
  const rationale = page.getByRole('textbox', { name: 'Rationale' }).first();
  await page.getByRole('button', { name: 'Useful' }).first().click();
  await rationale.fill('draft survives 500');
  await page.getByRole('button', { name: 'Save evaluation' }).first().click();
  await expect(page.getByText('Evaluation could not be saved')).toBeVisible();
  await expect(rationale).toHaveValue('draft survives 500');
});
