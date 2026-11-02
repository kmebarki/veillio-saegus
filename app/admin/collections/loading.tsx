export default function CollectionsLoading() {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 lg:pl-[320px] lg:pr-8" aria-busy="true" aria-label="Chargement des collectes">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </main>
  )
}
