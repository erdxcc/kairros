import { AudienceTabs } from '@/components/sections/AudienceTabs';
import { CtaBand } from '@/components/sections/CtaBand';
import { DeveloperCode } from '@/components/sections/DeveloperCode';
import { EcosystemRow } from '@/components/sections/EcosystemRow';
import { FeatureGrid } from '@/components/sections/FeatureGrid';
import { Footer } from '@/components/sections/Footer';
import { Hero } from '@/components/sections/Hero';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Nav } from '@/components/sections/Nav';
import { TrustBand } from '@/components/sections/TrustBand';

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
