import { NextServiceCard } from "@/components/home/NextServiceCard";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { homeContent } from "@/content/home";
import type { Service } from "@/types/song-list";

/**
 * The song list is the primary function of the site, so it gets the most
 * visual weight on the home page. When the sheet can be read and a service is
 * coming up, the next service and its songs sit beside the introduction;
 * otherwise it is just the introduction and the button.
 */
export function SongListCta({
  services,
  serverNow,
}: {
  /** Every service on the visible months, or null when there is nothing to show. */
  services: Service[] | null;
  serverNow: number;
}) {
  const { songList } = homeContent;
  const live = services !== null;

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Reveal>
          <Card barline className="overflow-hidden">
            <div
              className={cn(
                "grid items-center gap-8 p-8 sm:p-12 lg:gap-12",
                live ? "lg:grid-cols-2" : "lg:grid-cols-[1.5fr_1fr]",
              )}
            >
              <div>
                <SectionHeading eyebrow={songList.eyebrow} title={songList.title}>
                  <p>{songList.body}</p>
                </SectionHeading>
                {live ? (
                  <div className="mt-8">
                    <ButtonLink href={songList.cta.href} size="lg">
                      {songList.cta.label}
                      <span aria-hidden="true">&rarr;</span>
                    </ButtonLink>
                  </div>
                ) : null}
              </div>

              {live ? (
                <NextServiceCard services={services} serverNow={serverNow} />
              ) : (
                <div className="lg:justify-self-end">
                  <ButtonLink href={songList.cta.href} size="lg">
                    {songList.cta.label}
                    <span aria-hidden="true">&rarr;</span>
                  </ButtonLink>
                </div>
              )}
            </div>
          </Card>
        </Reveal>
      </Container>
    </section>
  );
}
