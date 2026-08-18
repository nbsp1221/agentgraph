import type { DependencyStatus, ReviewListItem, ReviewListResponse } from '@agentgraph/contracts';

export const fixtureScenarios = [
  'default',
  'healthy',
  'degraded',
  'unavailable',
  'loading',
  'empty-history',
  'filtered-empty',
  'list-error',
  'pagination',
  'running',
  'completed-zero-findings',
  'completed-multiple-findings',
  'failed',
  'superseded',
  'missing-artifact',
  'incomplete-coverage',
  'not-evaluated',
  'review-level-only',
  'partial-finding-evaluation',
  'all-findings-evaluated',
  'evaluation-history',
  'saving-evaluation',
  'evaluation-save-failure',
  'stress',
] as const;

export type FixtureScenario = (typeof fixtureScenarios)[number];
export type FixtureListState = 'ready' | 'loading' | 'empty' | 'filtered-empty' | 'error';

export type FixtureState = {
  scenario: FixtureScenario;
  listState: FixtureListState;
  health: {
    overall: DependencyStatus;
    observedAt: string;
    dependencies: Record<'api' | 'worker' | 'sandbox' | 'github', DependencyStatus>;
  };
  reviews: ReviewListItem[];
  activeReview?: ReviewListItem;
  fixtureOnly: true;
};

export type FixtureListQuery = {
  page?: number | undefined;
  query?: string | undefined;
  status?: string | undefined;
  evaluation?: string | undefined;
};

const observedAt = '2026-08-18T09:00:00.000Z';

function review(overrides: Partial<ReviewListItem> = {}): ReviewListItem {
  return {
    id: 241,
    repository: 'nbsp1221/agentgraph',
    pull_request_number: 118,
    pull_request_title: 'Harden review worker lifecycle',
    head_sha: 'd1ab712',
    base_sha: 'b9f35d2',
    status: 'completed',
    model: 'GPT-5.6 Luna',
    reasoning: 'xhigh',
    findings_count: 3,
    highest_severity: 'high',
    review_evaluation: null,
    evaluated_findings: 0,
    total_findings: 3,
    created_at: observedAt,
    started_at: observedAt,
    completed_at: observedAt,
    duration_ms: 131000,
    ...overrides,
  };
}

function standardReviews(): ReviewListItem[] {
  return [
    review(),
    review({
      id: 240,
      pull_request_number: 119,
      pull_request_title: 'Add review observability schema',
      status: 'running',
      findings_count: null,
      highest_severity: null,
      completed_at: null,
      duration_ms: 62000,
      total_findings: 0,
    }),
    review({
      id: 239,
      pull_request_number: 117,
      pull_request_title: 'Refactor publication pipeline',
      status: 'superseded',
      findings_count: 0,
      highest_severity: null,
      total_findings: 0,
      duration_ms: 38000,
    }),
    review({
      id: 238,
      pull_request_number: 116,
      pull_request_title: 'Validate prompt resources at startup',
      findings_count: 2,
      highest_severity: 'medium',
      total_findings: 2,
      duration_ms: 103000,
    }),
    review({
      id: 237,
      repository: 'nbsp1221/infra',
      pull_request_number: 42,
      pull_request_title: 'Update review sandbox image',
      status: 'failed',
      findings_count: 0,
      highest_severity: null,
      total_findings: 0,
      completed_at: null,
      duration_ms: 49000,
    }),
  ];
}

function paginationReviews(): ReviewListItem[] {
  return Array.from({ length: 24 }, (_, index) =>
    review({
      id: 241 - index,
      pull_request_number: 118 - index,
      pull_request_title: `Review run ${241 - index}: lifecycle verification`,
      total_findings: index % 4,
      findings_count: index % 4,
      highest_severity: index % 4 === 0 ? null : index % 2 === 0 ? 'medium' : 'high',
    }),
  );
}

function health(overall: DependencyStatus): FixtureState['health'] {
  return {
    overall,
    observedAt,
    dependencies: {
      api: overall,
      worker: overall === 'unavailable' ? 'unavailable' : overall,
      sandbox: overall === 'degraded' ? 'degraded' : overall,
      github: overall,
    },
  };
}

export function createFixture(scenario: FixtureScenario = 'default'): FixtureState {
  const state: FixtureState = {
    scenario,
    listState: 'ready',
    health: health('healthy'),
    reviews: standardReviews(),
    fixtureOnly: true,
  };

  if (scenario === 'degraded') {
    state.health = health('degraded');
  }
  if (scenario === 'unavailable') {
    state.health = health('unavailable');
  }
  if (scenario === 'loading') {
    state.listState = 'loading';
  }
  if (scenario === 'empty-history') {
    state.listState = 'empty';
    state.reviews = [];
  }
  if (scenario === 'filtered-empty') {
    state.listState = 'filtered-empty';
    state.reviews = [];
  }
  if (scenario === 'list-error') {
    state.listState = 'error';
  }
  if (scenario === 'pagination') {
    state.reviews = paginationReviews();
  }
  if (scenario === 'running') {
    state.activeReview = review({
      id: 240,
      status: 'running',
      findings_count: null,
      highest_severity: null,
      completed_at: null,
      total_findings: 0,
    });
  }
  if (scenario === 'completed-zero-findings') {
    state.activeReview = review({
      id: 235,
      findings_count: 0,
      highest_severity: null,
      total_findings: 0,
    });
  }
  if (scenario === 'completed-multiple-findings') {
    state.activeReview = review();
  }
  if (scenario === 'failed') {
    state.activeReview = review({
      id: 237,
      status: 'failed',
      findings_count: 0,
      highest_severity: null,
      completed_at: null,
      total_findings: 0,
    });
  }
  if (scenario === 'superseded') {
    state.activeReview = review({
      id: 239,
      status: 'superseded',
      findings_count: 0,
      highest_severity: null,
      total_findings: 0,
    });
  }
  if (scenario === 'missing-artifact' || scenario === 'incomplete-coverage') {
    state.activeReview = review({
      id: 234,
      findings_count: scenario === 'incomplete-coverage' ? 1 : null,
      total_findings: scenario === 'incomplete-coverage' ? 1 : 0,
    });
  }
  if (
    scenario === 'not-evaluated' ||
    scenario === 'review-level-only' ||
    scenario === 'partial-finding-evaluation' ||
    scenario === 'all-findings-evaluated' ||
    scenario === 'evaluation-history' ||
    scenario === 'saving-evaluation' ||
    scenario === 'evaluation-save-failure'
  ) {
    state.activeReview = review({
      review_evaluation:
        scenario === 'review-level-only' ||
        scenario === 'partial-finding-evaluation' ||
        scenario === 'all-findings-evaluated' ||
        scenario === 'evaluation-history'
          ? 'mixed'
          : null,
      evaluated_findings:
        scenario === 'partial-finding-evaluation'
          ? 1
          : scenario === 'all-findings-evaluated'
            ? 3
            : 0,
    });
  }
  if (scenario === 'stress') {
    state.activeReview = review({
      repository: 'company/platform-infrastructure-and-observability',
      pull_request_title:
        'A deliberately long pull request title that should remain readable without overflowing the review shell on narrow screens',
      findings_count: 3,
      total_findings: 3,
    });
  }

  return state;
}

export function isFixtureScenario(value: string | undefined): value is FixtureScenario {
  return fixtureScenarios.includes(value as FixtureScenario);
}

export function isFixtureControlEnabled(environment: string | undefined): boolean {
  return environment !== 'production';
}

export function fixtureListResponse(
  state: FixtureState,
  query: FixtureListQuery = {},
): ReviewListResponse {
  const allReviews = state.activeReview
    ? [state.activeReview, ...state.reviews.filter((item) => item.id !== state.activeReview?.id)]
    : state.reviews;
  const search = query.query?.trim().toLowerCase();
  const filtered = allReviews.filter((item) => {
    const haystack =
      `${item.repository} ${item.pull_request_number} ${item.pull_request_title ?? ''}`.toLowerCase();
    const matchesQuery = !search || haystack.includes(search);
    const matchesStatus = !query.status || query.status === 'all' || item.status === query.status;
    const matchesEvaluation =
      !query.evaluation ||
      query.evaluation === 'all' ||
      (query.evaluation === 'evaluated'
        ? item.review_evaluation !== null
        : item.status === 'completed' && item.review_evaluation === null);
    return matchesQuery && matchesStatus && matchesEvaluation;
  });
  const page = Math.max(1, query.page ?? 1);
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / 20);
  return {
    items: filtered.slice((page - 1) * 20, page * 20),
    page,
    page_size: 20,
    total_items: totalItems,
    total_pages: totalPages,
  };
}
