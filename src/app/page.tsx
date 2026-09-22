import { ContactCta } from "@/components/home/ContactCta";
import { Hero } from "@/components/home/Hero";
import { Purpose } from "@/components/home/Purpose";
import { SongListCta } from "@/components/home/SongListCta";
import { PageTransition } from "@/components/ui/PageTransition";

export default function HomePage() {
  return (
    <PageTransition>
      <Hero />
      <Purpose />
      <SongListCta />
      <ContactCta />
    </PageTransition>
  );
}
