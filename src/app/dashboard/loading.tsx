import { SplashHold } from "@/components/app/SplashHold";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { dashboardContent } from "@/content/dashboard";

const frame = "rounded-card border border-line bg-surface shadow-card";

/**
 * While the Dashboard gathers everything it shows: the page's outline, at
 * once, in the shape the page will take - the next service and For you, then
 * Preparation and Later. Without it nothing at all is sent until every part
 * is ready - so the app, which opens here, sat on a blank screen before even
 * its loading screen could appear. The loading screen, when it is up, stays
 * over this until the real page is in (SplashHold).
 */
export default function DashboardLoading() {
  return (
    <Container size="wide" className="pb-16 pt-8 sm:pb-20 sm:pt-12">
      <SplashHold />
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your Dashboard</span>
        <RehearsalMark>{dashboardContent.eyebrow}</RehearsalMark>
        <div aria-hidden="true">
          <Skeleton className="mt-1 h-9 w-2/3 max-w-sm sm:h-10" />
          <Skeleton className="mt-3 h-4 w-40" />

          <div className="mt-8 grid gap-5 lg:grid-cols-3 lg:gap-6">
            <div className={`${frame} relative overflow-hidden p-5 sm:p-7 lg:col-span-2`}>
              <span className="absolute inset-y-0 left-0 w-1 bg-gold/40" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-11 w-56 sm:h-12" />
              <Skeleton className="mt-3 h-4 w-64" />
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Skeleton className="h-14 w-full rounded-xl sm:w-72" />
                <Skeleton className="h-11 w-full rounded-full sm:w-32" />
              </div>
            </div>
            <div className={`${frame} p-5`}>
              <Skeleton className="h-6 w-24" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="mt-5 flex gap-3">
                  <Skeleton className="mt-1 size-2 rounded-full" />
                  <Skeleton className="flex-1" lines={2} />
                </div>
              ))}
            </div>
            <div className={`${frame} p-5 lg:col-span-2`}>
              <Skeleton className="h-6 w-32" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
              <Skeleton className="mt-6" lines={3} />
            </div>
            <div className={`${frame} p-5`}>
              <Skeleton className="h-6 w-20" />
              {[0, 1].map((row) => (
                <div key={row} className="mt-5 flex gap-3">
                  <Skeleton className="h-14 w-11" />
                  <Skeleton className="flex-1" lines={2} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
