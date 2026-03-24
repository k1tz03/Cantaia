export default function AppLoading() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-[#27272A] rounded" />
        <div className="h-10 w-32 bg-[#27272A] rounded" />
      </div>
      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#27272A] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
