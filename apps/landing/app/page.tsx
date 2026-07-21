import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { AudienceTabs } from "@/components/sections/AudienceTabs";
import { EcosystemRow } from "@/components/sections/EcosystemRow";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { DeveloperCode } from "@/components/sections/DeveloperCode";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { TrustBand } from "@/components/sections/TrustBand";
import { CtaBand } from "@/components/sections/CtaBand";
import { Footer } from "@/components/sections/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <AudienceTabs />
        <EcosystemRow />
        <FeatureGrid />
        <DeveloperCode />
        <HowItWorks />
        <TrustBand />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
