import { Reveal } from '@/components/effects/Reveal';
import { Button, ButtonArrow } from '@/components/ui/Button';
import { CheckList } from '@/components/ui/CheckList';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';
import { audiences } from '@/lib/copy';

/**
 * The two sides of one rail, side by side: what a payer gets, what a merchant
 * gets. Tone-coded (accent for customers, success for merchants) so the columns
 * stay distinguishable at a glance.
 *
 * Each card ends on its own entry point, because the two audiences start in
 * different places: payers at the dashboard root, merchants at the application.
 */
export function Audiences() {
    return (
        <section id="audiences" className="container-page section">
            <SectionHeader eyebrow={audiences.eyebrow} heading={audiences.heading} lead={audiences.lead} />

            <div className="mt-13 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
                {audiences.cards.map((card, i) => (
                    <Reveal key={card.tag} delay={i * 90} className="h-full">
                        <div className="h-full rounded-[18px] border border-line bg-surface p-[clamp(28px,3vw,40px)]">
                            <span
                                className={cn(
                                    'font-mono text-xs uppercase tracking-[0.12em]',
                                    card.tone === 'success' ? 'text-success' : 'text-accent',
                                )}
                            >
                                {card.tag}
                            </span>
                            <h3 className="mb-3 mt-4 text-[26px] font-semibold tracking-[-0.02em]">
                                {card.title}
                            </h3>
                            <p className="text-base leading-[1.62] text-muted">{card.body}</p>
                            <CheckList items={card.points} tone={card.tone} className="mt-6" />
                            <Button
                                href={card.cta.href}
                                variant={card.tone === 'success' ? 'solid' : 'ghost'}
                                className="mt-7"
                            >
                                {card.cta.label}
                                <ButtonArrow />
                            </Button>
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}
