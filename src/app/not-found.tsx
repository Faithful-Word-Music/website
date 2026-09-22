import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";

export default function NotFound() {
  return (
    <PageTransition>
      <Container size="narrow" className="py-24 text-center sm:py-32">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-gold-dark">
          404
        </p>
        <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">
          This page could not be found
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg text-muted">
          The page you were looking for has moved or never existed.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/" size="lg">
            Back to Home
          </ButtonLink>
          <ButtonLink href="/song-list" variant="secondary" size="lg">
            View Song List
          </ButtonLink>
        </div>
      </Container>
    </PageTransition>
  );
}
