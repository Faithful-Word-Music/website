import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { homeContent } from "@/content/home";

/**
 * The song list is the primary function of the site, so it gets the most
 * visual weight on the home page - without reproducing the schedule here.
 */
export function SongListCta() {
  const { songList } = homeContent;

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Reveal>
          <Card barline className="overflow-hidden">
            <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
              <SectionHeading eyebrow={songList.eyebrow} title={songList.title}>
                <p>{songList.body}</p>
              </SectionHeading>

              <div className="lg:justify-self-end">
                <ButtonLink href={songList.cta.href} size="lg">
                  {songList.cta.label}
                  <span aria-hidden="true">&rarr;</span>
                </ButtonLink>
              </div>
            </div>
          </Card>
        </Reveal>
      </Container>
    </section>
  );
}
