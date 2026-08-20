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
  await forwardApi(page);

  await page.goto('/en/reviews/1');
  await expect(page.getByRole('heading', { name: 'Real E2E review' })).toBeVisible();
  const rationale = page.getByRole('textbox', { name: 'Rationale' }).first();
  await page.getByRole('button', { name: 'Useful' }).first().click();
  await rationale.fill('real reviewer write');
  await page.getByRole('button', { name: 'Save evaluation' }).first().click();
  await expect(page.getByRole('status')).toContainText('Evaluation saved');
  await page.getByRole('button', { name: 'Mixed' }).first().click();
  await page.getByRole('button', { name: 'Save evaluation' }).first().click();
  await expect(page.getByRole('status')).toContainText('Evaluation saved');

  const evidence = page.getByRole('button', { name: 'Evidence and suggested action' }).first();
  await evidence.click();
  const finding = page.locator('article').first();
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
  const reviewEvaluation = page.getByRole('complementary');
  await reviewEvaluation.getByRole('button', { name: 'Useful', exact: true }).click();
  await reviewEvaluation.getByRole('textbox', { name: 'Rationale' }).fill('saved after withdrawal');
  await reviewEvaluation.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(reviewEvaluation.getByRole('status')).toContainText('Evaluation saved');

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
