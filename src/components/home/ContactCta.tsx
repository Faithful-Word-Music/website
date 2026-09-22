import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { homeContent } from "@/content/home";

export function ContactCta() {
  const { contact } = homeContent;

  return (
    <section className="py-16 sm:py-20">
      <Container size="narrow">
        <Reveal>
          <SectionHeading
            eyebrow={contact.eyebrow}
            title={contact.title}
            align="center"
          >
            <p>{contact.body}</p>
          </SectionHeading>

          <div className="mt-9 flex flex-col items-center gap-4">
            <ButtonLink href={contact.cta.href} size="lg">
              {contact.cta.label}
            </ButtonLink>
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
            >
              {siteConfig.contactEmail}
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
