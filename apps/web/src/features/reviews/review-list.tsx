'use client';

import type { ReviewListResponse } from '@leverframe/contracts';
import { Alert, AlertDescription, AlertTitle } from '@leverframe/ui/components/alert';
import { Button } from '@leverframe/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@leverframe/ui/components/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@leverframe/ui/components/empty';
import { Input } from '@leverframe/ui/components/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@leverframe/ui/components/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@leverframe/ui/components/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@leverframe/ui/components/table';
import { flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { AlertCircleIcon, SearchIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useQueryStates } from 'nuqs';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from '../../i18n/navigation';
import { reviewReturnQuery } from './review-detail-navigation';
import { columnClass, createReviewColumns } from './review-list-columns';
import { reviewQueryParsers } from './review-query-parsers';

type ReviewListProps = {
  response: ReviewListResponse;
  error?: boolean;
  detailScenario?: string;
};

const features = tableFeatures({});

export function ReviewList({ response, error = false, detailScenario }: ReviewListProps) {
  const t = useTranslations('reviews');
  const common = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnQuery = reviewReturnQuery(searchParams);
  const [{ query, status, evaluation }, setQuery] = useQueryStates(
    {
      ...reviewQueryParsers,
    },
    { shallow: false },
  );
  const [draftQuery, setDraftQuery] = useState(query);

  // URL state is authoritative after navigation; synchronize the controlled input once.
  // eslint-disable-next-line @eslint-react/set-state-in-effect
  useEffect(() => setDraftQuery(query), [query]);
  useEffect(() => {
    if (draftQuery === query) {
      return;
    }
    const timer = window.setTimeout(() => {
      void setQuery({ query: draftQuery || null, page: null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftQuery, query, setQuery]);

  function updateFilter(key: 'status' | 'evaluation', value: string) {
    void setQuery({ [key]: value === 'all' ? null : value, page: null });
  }

  const columns = useMemo(
    () => createReviewColumns(t, common, detailScenario, returnQuery),
    [common, detailScenario, returnQuery, t],
  );
  const table = useTable({ features, data: response.items, columns });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{t('errorDescription')}</AlertDescription>
        <Button variant="outline" onClick={() => router.refresh()}>
          {common('retry')}
        </Button>
      </Alert>
    );
  }
  const filtered = query || status !== 'all' || evaluation !== 'all';
  if (!response.items.length && !filtered) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{filtered ? t('filteredEmptyTitle') : t('emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {filtered ? t('filteredEmptyDescription') : t('emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle>{t('reviewHistory')}</CardTitle>
          <CardDescription>{t('tableDescription')}</CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-8"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
            />
          </div>
          <Select value={status} onValueChange={(value) => updateFilter('status', value ?? 'all')}>
            <SelectTrigger aria-label={t('statusFilter')}>
              <SelectValue>{status === 'all' ? t('allStatuses') : t(status)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              <SelectItem value="running">{t('running')}</SelectItem>
              <SelectItem value="completed">{t('completed')}</SelectItem>
              <SelectItem value="failed">{t('failed')}</SelectItem>
              <SelectItem value="superseded">{t('superseded')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={evaluation}
            onValueChange={(value) => updateFilter('evaluation', value ?? 'all')}
          >
            <SelectTrigger aria-label={t('evaluationFilter')}>
              <SelectValue>
                {evaluation === 'all'
                  ? t('allEvaluations')
                  : evaluation === 'needs_evaluation'
                    ? t('notEvaluated')
                    : t('evaluated')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allEvaluations')}</SelectItem>
              <SelectItem value="needs_evaluation">{t('notEvaluated')}</SelectItem>
              <SelectItem value="evaluated">{t('evaluated')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={columnClass(header.column.id)}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/reviews/${row.original.id}${returnQuery ? `?${returnQuery}` : ''}`)
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={columnClass(cell.column.id)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!response.items.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('filteredEmptyDescription')}
          </p>
        ) : null}
        <ListPagination
          page={response.page}
          totalPages={response.total_pages}
          t={t}
          pathname={pathname}
          locale={locale}
          searchParams={searchParams}
        />
      </CardContent>
    </Card>
  );
}

function ListPagination({
  page,
  totalPages,
  t,
  pathname,
  locale,
  searchParams,
}: {
  page: number;
  totalPages: number;
  t: (key: string) => string;
  pathname: string;
  locale: string;
  searchParams: { toString(): string };
}) {
  if (totalPages <= 1) {
    return null;
  }

  const hrefFor = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const localizedPath =
      pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
        ? pathname
        : `/${locale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    return `${localizedPath}?${params.toString()}`;
  };

  const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...candidates]
    .filter((value) => value > 0 && value <= totalPages)
    .sort((a, b) => a - b);
  const items: ReactNode[] = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1]! > 1) {
      items.push(<PaginationEllipsis key={`ellipsis-${value}`} label={t('paginationEllipsis')} />);
    }
    items.push(
      <PaginationItem key={value}>
        <PaginationLink href={hrefFor(value)} isActive={page === value}>
          {value}
        </PaginationLink>
      </PaginationItem>,
    );
  });
  return (
    <Pagination aria-label={t('pagination')}>
      <PaginationContent>
        <PaginationItem>
          {page > 1 ? <PaginationPrevious text={t('previous')} href={hrefFor(page - 1)} /> : null}
        </PaginationItem>
        {items}
        <PaginationItem>
          {page < totalPages ? <PaginationNext text={t('next')} href={hrefFor(page + 1)} /> : null}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
