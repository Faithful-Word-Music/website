import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/ContactForm";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { contactContent } from "@/content/contact";

export const metadata: Metadata = {
  title: contactContent.title,
  description: contactContent.lead,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: `${contactContent.title} | ${siteConfig.name}`,
    description: contactContent.lead,
    url: `${siteConfig.url}/contact`,
  },
};

export default function ContactPage() {
  return (
    <PageTransition>
      <Container size="narrow" className="py-14 sm:py-20">
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
