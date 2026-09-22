import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { homeContent } from "@/content/home";

export function Hero() {
  const { hero } = homeContent;

  return (
    <section className="relative overflow-hidden">
      <Container className="relative py-20 text-center sm:py-28">
        <div>
          <RehearsalMark align="center">{hero.eyebrow}</RehearsalMark>

          {/* The wordmark sits on a five-line stave, the way a title sits on a
              score. The stave is centred on the text and fades out at both
              ends, so it reads as engraving rather than as a stray rule. */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="staff-lines pointer-events-none absolute inset-x-0 top-1/2 h-[41px] -translate-y-1/2"
            />
            <h1 className="relative font-display text-5xl leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
              {hero.title}
            </h1>
          </div>

          <p className="mx-auto mt-6 max-w-xl font-display text-lg italic text-gold-dark sm:text-xl">
            {hero.subtitle}
          </p>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted">
            {hero.lead}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href={hero.primaryCta.href} size="lg">
              {hero.primaryCta.label}
            </ButtonLink>
            <ButtonLink
              href={hero.secondaryCta.href}
              variant="secondary"
              size="lg"
            >
              {hero.secondaryCta.label}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
