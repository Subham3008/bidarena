export function AuctionSkeleton() {
  return (
    <div
      className="surface-card overflow-hidden"
      aria-hidden="true"
    >
      <div className="aspect-[16/10] animate-pulse bg-stone-200 motion-reduce:animate-none" />
      <div className="space-y-5 p-5">
        <div className="space-y-2.5">
          <div className="h-5 w-4/5 animate-pulse rounded bg-stone-200 motion-reduce:animate-none" />
          <div className="h-4 w-2/5 animate-pulse rounded bg-stone-100 motion-reduce:animate-none" />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="h-9 w-2/5 animate-pulse rounded bg-stone-200 motion-reduce:animate-none" />
          <div className="h-4 w-14 animate-pulse rounded bg-stone-100 motion-reduce:animate-none" />
        </div>
        <div className="h-16 animate-pulse rounded-[var(--radius-md)] bg-stone-100 motion-reduce:animate-none" />
        <div className="h-11 animate-pulse rounded-[var(--radius-sm)] bg-stone-200 motion-reduce:animate-none" />
      </div>
    </div>
  )
}
