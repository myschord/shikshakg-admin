export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-border-tint ${className}`} />;
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`rounded-2xl border border-border-tint bg-white p-5 sm:p-6 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-4 h-7 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  );
}

export function SkeletonStats({ count = 3 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border-tint bg-white p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2.5 h-6 w-1/2" />
        </div>
      ))}
    </div>
  );
}
