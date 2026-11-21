import { Skeleton } from "@/components/ui/skeleton";

function LoadingBlock({ className }: { className: string }) {
  return <Skeleton className={`bg-muted motion-reduce:animate-none ${className}`} />;
}

export function HomeLoading() {
  return (
    <div role="status" className="min-h-svh bg-background">
      <span className="sr-only">正在加载书签首页…</span>
      <div aria-hidden="true" className="flex">
        <div className="hidden min-h-svh w-[212px] shrink-0 space-y-5 border-e bg-sidebar px-4 py-5 lg:block min-[1440px]:w-[232px]">
          <div className="flex items-center gap-3"><LoadingBlock className="size-9" /><LoadingBlock className="h-4 w-24" /></div>
          <LoadingBlock className="h-12 w-full rounded-[10px]" />
          {[0, 1, 2, 3].map((item) => <LoadingBlock key={item} className="h-8 w-full" />)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-14 items-center gap-3 border-b px-4 py-3 sm:min-h-14 sm:flex-nowrap sm:px-6 lg:h-[76px] lg:px-9">
            <LoadingBlock className="h-4 w-24" />
            <LoadingBlock className="ms-auto hidden h-9 min-w-0 max-w-sm flex-1 rounded-lg lg:block" />
          </div>
          <div className="mx-auto w-full px-4 pb-24 pt-6 sm:px-6 lg:pb-10 lg:pt-7 xl:w-[96%]">
            <div className="w-full">
              <div className="mb-7 space-y-5">
                <div className="space-y-2">
                  <LoadingBlock className="h-3 w-44" />
                  <LoadingBlock className="h-[39px] w-[min(100%,19rem)] sm:h-12" />
                  <LoadingBlock className="h-5 w-[min(100%,17rem)]" />
                </div>
              </div>
              <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22%]">
                <div className="min-w-0 space-y-8">
                  <div>
                    <LoadingBlock className="mb-4 h-5 w-24" />
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                      {[0, 1, 2, 3, 4, 5].map((item) => (
                        <div key={item} className="flex h-28 min-w-0 flex-col items-center justify-center gap-2 rounded-[10px] border bg-card px-2">
                          <LoadingBlock className="size-7" />
                          <LoadingBlock className="h-3 w-2/3" />
                          <LoadingBlock className="h-3 w-4/5" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <LoadingBlock className="mb-4 h-5 w-28" />
                    <div className="grid gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="space-y-3 rounded-xl border bg-card p-5">
                          <div className="flex items-center gap-3"><LoadingBlock className="size-9" /><LoadingBlock className="h-4 w-24" /></div>
                          <LoadingBlock className="h-3 w-full" />
                          <LoadingBlock className="h-3 w-4/5" />
                          <LoadingBlock className="h-5 w-16" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="hidden space-y-5 border-s ps-6 xl:block">
                  <LoadingBlock className="h-44 w-full rounded-xl" />
                  <LoadingBlock className="h-5 w-24" />
                  {[0, 1, 2, 3].map((item) => <LoadingBlock key={item} className="h-10 w-full" />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
