import { SplashHold } from "@/components/app/SplashHold";
import { DashboardGrid } from "@/components/dashboard/DashboardSection";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { dashboardContent } from "@/content/dashboard";

/**
 * While the Dashboard gathers everything it shows: the page's outline, at
 * once. Without it nothing at all is sent until every part is ready - so the
 * app, which opens here, sat on a blank screen before even its loading screen
 * could appear. The loading screen, when it is up, stays over this until the
 * real page is in (SplashHold).
 */
export default function DashboardLoading() {
  return (
    <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
      <SplashHold />
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your Dashboard</span>
        <RehearsalMark>{dashboardContent.eyebrow}</RehearsalMark>
        <div aria-hidden="true" className="animate-pulse">
          <div className="h-10 w-2/3 max-w-md rounded-card bg-line/60 sm:h-12 lg:h-14" />
          <div className="mt-6 h-5 w-40 rounded-card bg-line/50" />
          <div className="mt-12 h-7 w-36 rounded-card bg-line/60" />
          <DashboardGrid className="mt-4">
            {[0, 1, 2].map((card) => (
              <div key={card} className="h-48 rounded-card border border-line bg-surface shadow-card" />
            ))}
          </DashboardGrid>
        </div>
      </div>
    </Container>
  );
}
