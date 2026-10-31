import { ContactForm } from "@/components/contact/ContactForm";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { contactContent } from "@/content/contact";

/**
 * The public Contact page, exactly as it has always been: the form posts to
 * /api/contact (BotID, honeypot, validation, Resend) and keeps its own draft.
 * Shown to everyone who is not signed in - and to anyone signed in whose
 * account cannot use the Support Center.
 */
export function PublicContact() {
  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow="Contact" title={contactContent.title}>
          <p className="text-base sm:text-lg">{contactContent.lead}</p>
        </SectionHeading>

        <Reveal>
          <Card className="mt-10 p-6 sm:p-8">
            <ContactForm />
          </Card>
        </Reveal>

        {/* The address stays visible whatever the form does, so there is always
          a way to reach the ministry even if sending fails. */}
        <p className="mt-6 text-center text-sm text-muted">
          {contactContent.directLabel}{" "}
          <a
            href={`mailto:${contactContent.directEmail}`}
            className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
          >
            {contactContent.directEmail}
          </a>
        </p>
      </Container>
    </PageTransition>
  );
}
