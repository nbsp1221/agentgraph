import { expect, test } from '@playwright/test';

test.describe('review shell fixtures', () => {
  test('redirects root and keeps filters, pagination, detail, and back query', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/reviews$/);
    await page.goto('/en/reviews?fixture=pagination&status=completed');
    await expect(page.getByRole('combobox', { name: 'Filter by status' })).toContainText(
      'Completed',
    );
    await page
      .getByRole('navigation', { name: 'Review pagination' })
      .getByRole('button', { name: '2', exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');
    await expect(
      page
        .getByRole('navigation', { name: 'Review pagination' })
        .getByRole('button', { name: '2', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: /nbsp1221\/agentgraph/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/reviews\/\d+/);
    await expect(page.getByRole('heading', { name: /Review run/ })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('fixture')).toBe('pagination');
    await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('completed');
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');
    await page.getByRole('link', { name: 'Back to reviews' }).click();
    await expect(page).toHaveURL(/\/en\/reviews/);
    await expect(page.getByRole('heading', { name: 'Code reviews' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('fixture')).toBe('pagination');
    await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('completed');
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');
  });

  test('persists theme and switches locale while retaining fixture query', async ({ page }) => {
    await page.goto('/en/reviews?fixture=completed-multiple-findings');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Korean' }).click();
    await expect(page).toHaveURL(/\/ko\/reviews\?fixture=completed-multiple-findings/);
  });

  test('saves, updates, withdraws, and shows evaluation history', async ({ page }) => {
    await page.goto('/en/reviews/241?fixture=evaluation-history');
    let nextId = 3;
    const previousIds: Array<number | null> = [];
    await page.route('**/api/v1/reviews/241/evaluation', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as {
        expected_previous_id: number | null;
        verdict?: string;
      };
      previousIds.push(body.expected_previous_id);
      if (request.method() === 'PUT') {
        const revision = {
          id: nextId++,
          target_type: 'review',
          finding_fingerprint: null,
          verdict: body?.verdict ?? 'useful',
          rationale: 'browser rationale',
          source: 'manual',
          action: 'set',
          supersedes_id: body.expected_previous_id,
          created_at: new Date().toISOString(),
        };
        await route.fulfill({ json: { revision, current: revision } });
      } else {
        const revision = {
          id: nextId++,
          target_type: 'review',
          finding_fingerprint: null,
          verdict: null,
          rationale: null,
          source: 'manual',
          action: 'withdraw',
          supersedes_id: body.expected_previous_id,
          created_at: new Date().toISOString(),
        };
        await route.fulfill({ json: { revision, current: null } });
      }
    });
    await page.getByRole('button', { name: 'Useful' }).first().click();
    await page.getByRole('textbox', { name: 'Rationale' }).fill('browser rationale');
    await page.getByRole('button', { name: 'Save evaluation' }).first().click();
    await expect(page.getByRole('status')).toContainText('Evaluation saved');
    await page.getByRole('button', { name: 'Mixed' }).first().click();
    await page.getByRole('button', { name: 'Save evaluation' }).first().click();
    await expect(page.getByRole('status')).toContainText('Evaluation saved');
    await page.getByRole('button', { name: 'Withdraw' }).first().click();
    await expect(page.getByRole('status')).toContainText('Evaluation withdrawn');
    expect(previousIds).toEqual([2, 3, 4]);
    await page.getByRole('button', { name: 'View history' }).first().click();
    await expect(page.getByText('Withdraw').last()).toBeVisible();
  });

  test('retains a draft after evaluation conflict', async ({ page }) => {
    await page.goto('/en/reviews/241?fixture=not-evaluated');
    await page.route('**/api/v1/reviews/241/evaluation', (route) =>
      route.fulfill({ status: 409, json: { error: 'stale' } }),
    );
    const rationale = page.getByRole('textbox', { name: 'Rationale' });
    await page.getByRole('button', { name: 'Useful' }).first().click();
    await rationale.fill('keep this draft');
    await page.getByRole('button', { name: 'Save evaluation' }).first().click();
    await expect(page.getByText('This evaluation changed elsewhere')).toBeVisible();
    await expect(rationale).toHaveValue('keep this draft');
  });

  test('opens bounded code context in each explicit state', async ({ page }) => {
    for (const [scenario, expected] of [
      ['context-available', 'const boundedFixtureContext'],
      ['context-unavailable', 'Context unavailable'],
      ['context-error', 'Context error'],
    ] as const) {
      await page.goto(`/en/reviews/241?fixture=${scenario}`);
      await page.getByRole('button', { name: 'Evidence and suggested action' }).first().click();
      await page.getByRole('button', { name: 'Load context' }).first().click();
      await expect(page.getByText(expected).first()).toBeVisible();
    }
  });

  test('supports mobile sidebar navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only navigation behavior');
    await page.goto('/en/reviews?fixture=default');
    await page.getByRole('button', { name: 'Open navigation' }).tap();
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Code Review Bot' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('link', { name: 'Code Review Bot' }).tap();
    await page.goto('/en/reviews?fixture=evaluation-history');
    await page
      .getByRole('link', { name: /nbsp1221\/agentgraph/ })
      .first()
      .tap();
    await expect(page).toHaveURL(/\/en\/reviews\/241/);
    let nextId = 3;
    await page.route('**/api/v1/reviews/241/evaluation', async (route) => {
      const body = route.request().postDataJSON() as {
        expected_previous_id: number;
        rationale?: string;
        verdict: string;
      };
      const revision = {
        id: nextId++,
        target_type: 'review',
        finding_fingerprint: null,
        verdict: body.verdict,
        rationale: body.rationale ?? null,
        source: 'manual',
        action: 'set',
        supersedes_id: body.expected_previous_id,
        created_at: new Date().toISOString(),
      };
      await route.fulfill({ json: { revision, current: revision } });
    });
    const useful = page.getByRole('button', { name: 'Useful', exact: true }).first();
    await useful.focus();
    await page.keyboard.press('Enter');
    await expect(useful).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('textbox', { name: 'Rationale' }).first().fill('mobile keyboard review');
    await page.getByRole('button', { name: 'Save evaluation' }).first().tap();
    await expect(page.getByRole('status')).toContainText('Evaluation saved');
    await page.getByRole('button', { name: 'View history' }).first().tap();
    await expect(page.getByText('mobile keyboard review')).toBeVisible();
  });
});
