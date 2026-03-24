export default function AdminLoading() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-[#27272A] rounded" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-[#27272A] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
