import { Container } from "@/components/ui/Container";
import { PianoRule } from "@/components/ui/PianoRule";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { homeContent } from "@/content/home";

export function Purpose() {
  const { purpose } = homeContent;

  return (
    <section className="pb-16 sm:pb-20">
      <PianoRule />
      <Container size="narrow" className="pt-14 sm:pt-16">
        <Reveal>
          <SectionHeading eyebrow={purpose.eyebrow} title={purpose.title}>
            {purpose.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </SectionHeading>
        </Reveal>
      </Container>
    </section>
  );
}
