'use client';

import { Button } from '@leverframe/ui/components/button';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CopyShaButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const t = useTranslations('reviewDetail');
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => {
              setCopyError(false);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            },
            () => {
              setCopied(false);
              setCopyError(true);
            },
          );
        }}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </Button>
      {copyError ? (
        <span role="status" className="sr-only">
          {t('copyFailed')}
        </span>
      ) : null}
    </>
  );
}
