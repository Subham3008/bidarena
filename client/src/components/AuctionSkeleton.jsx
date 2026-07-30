export function AuctionSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-md border border-stone-200 bg-white"
      aria-hidden="true"
    >
      <div className="aspect-[4/3] animate-pulse bg-stone-200 motion-reduce:animate-none" />
      <div className="space-y-4 p-4">
        <div className="h-5 w-2/3 animate-pulse bg-stone-200 motion-reduce:animate-none" />
        <div className="h-4 w-1/3 animate-pulse bg-stone-100 motion-reduce:animate-none" />
        <div className="h-8 w-1/2 animate-pulse bg-stone-200 motion-reduce:animate-none" />
        <div className="h-10 animate-pulse bg-stone-100 motion-reduce:animate-none" />
      </div>
    </div>
  )
}
