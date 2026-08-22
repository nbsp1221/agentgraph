/**
 * Values shown to operators or sent as mutable product metadata. These may
 * change when the product is rebranded without changing persisted protocol
 * data.
 */
export const productName = 'Leverframe';
export const productSlug = 'leverframe';
export const productUserAgent = productSlug;
export const defaultDataDirectoryName = '.leverframe';

/**
 * Stable identifiers used across GitHub, repository configuration, and the
 * disposable sandbox. Keep these independent of the product name: comments,
 * reviews, and sandbox resources can outlive a product rebrand.
 */
export const reviewProtocol = {
  namespace: 'reviewer',
  repositoryPolicyPath: '.github/reviewer.yml',
  sandboxNamePrefix: 'reviewer-job-',
  sandboxOutputPath: '/tmp/reviewer-review.json',
  sandboxWorkspace: '/tmp/reviewer-repository',
  statusMarker: '<!-- reviewer:review-status -->',
} as const;

export const repositoryPolicyPaths = [
  reviewProtocol.repositoryPolicyPath,
  '.github/leverframe.yml',
] as const;
export const legacySandboxNamePrefixes = ['leverframe-job-'] as const;

const legacyProtocolNamespaces = ['leverframe', 'retn0-assistant'] as const;

export function statusCommentMarkers(): readonly string[] {
  return [
    reviewProtocol.statusMarker,
    ...legacyProtocolNamespaces.map((namespace) => `<!-- ${namespace}:review-status -->`),
  ];
}

export function commandReplyMarkers(deliveryId: string): readonly string[] {
  return [
    `<!-- ${reviewProtocol.namespace}:command-reply:${deliveryId} -->`,
    ...legacyProtocolNamespaces.map(
      (namespace) => `<!-- ${namespace}:command-reply:${deliveryId} -->`,
    ),
  ];
}

export function reviewPublicationMarkers(jobId: number, headSha: string): readonly string[] {
  return [
    `<!-- ${reviewProtocol.namespace}:review-publication:${jobId}:${headSha} -->`,
    ...legacyProtocolNamespaces.map(
      (namespace) => `<!-- ${namespace}:review-publication:${jobId}:${headSha} -->`,
    ),
  ];
}

export function reviewPublicationMarker(jobId: number, headSha: string): string {
  return reviewPublicationMarkers(jobId, headSha)[0] as string;
}

export function commandReplyMarker(deliveryId: string): string {
  return commandReplyMarkers(deliveryId)[0] as string;
}

export function reviewerSandboxName(jobId: number): string {
  return `${reviewProtocol.sandboxNamePrefix}${jobId}`;
}

export function reviewerSandboxPattern(): RegExp {
  return new RegExp(`^${reviewProtocol.sandboxNamePrefix}(\\d+)$`);
}

export function reviewerSandboxPatterns(): readonly RegExp[] {
  return [
    reviewerSandboxPattern(),
    ...legacySandboxNamePrefixes.map((prefix) => new RegExp(`^${prefix}(\\d+)$`)),
  ];
}
