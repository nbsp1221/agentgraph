import { Skeleton } from '@leverframe/ui/components/skeleton';

export default function ReviewDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[36rem] w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
