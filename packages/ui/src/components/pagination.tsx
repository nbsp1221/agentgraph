import { Button } from '@agentgraph/ui/components/button';
import { cn } from '@agentgraph/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import * as React from 'react';

function Pagination({
  className,
  ...props
}: React.ComponentProps<'nav'> & { 'aria-label': string }) {
  return (
    <nav
      role="navigation"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex items-center gap-0.5', className)}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = { isActive?: boolean } & Pick<
  React.ComponentProps<typeof Button>,
  'size'
> &
  React.ComponentProps<'a'>;

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? 'outline' : 'ghost'}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a
          aria-current={isActive ? 'page' : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    />
  );
}

function PaginationPrevious({
  text,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text: string }) {
  return (
    <PaginationLink aria-label={text} size="default" className="pl-1.5!" {...props}>
      <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  text,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text: string }) {
  return (
    <PaginationLink aria-label={text} size="default" className="pr-1.5!" {...props}>
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  label,
  ...props
}: React.ComponentProps<'span'> & { label: string }) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn('flex size-8 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontalIcon aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
