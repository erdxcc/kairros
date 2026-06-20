import { CodeBlock, type CodeTab } from "@/components/effects/CodeBlock";
import { Reveal } from "@/components/effects/Reveal";
import { Button } from "@/components/ui/Button";
import { developer } from "@/lib/copy";

// Realistic-but-fictional snippets for a made-up @kairos/sdk.
const TABS: CodeTab[] = [
  {
    id: "subscription",
    label: "Create a subscription",
    code: `import { Kairos } from "@kairos/sdk";

const kairos = new Kairos({ cluster: "mainnet-beta" });

// Charge 20 USDC every month, settled on Solana.
const subscription = await kairos.subscriptions.create({
  payer: wallet.publicKey,
  token: "USDC",
  amount: 20_000_000n, // 6 decimals
  interval: "monthly",
});

console.log(subscription.status); // "active"`,
  },
  {
    id: "allowance",
    label: "Set an allowance",
    code: `import { Kairos } from "@kairos/sdk";

const kairos = new Kairos({ cluster: "mainnet-beta" });

// Approve a capped, revocable spending limit.
const allowance = await kairos.allowances.approve({
  owner: wallet.publicKey,
  token: "USDC",
  limit: 100_000_000n, // 100 USDC cap
  period: "month",
});

// Revoke it any time — fully on-chain.
await kairos.allowances.revoke(allowance.id);`,
  },
  {
    id: "event",
    label: "Handle an event",
    code: `import { Kairos } from "@kairos/sdk";

const kairos = new Kairos({ cluster: "mainnet-beta" });

// React to settlements as they land on-chain.
kairos.on("charge.settled", (event) => {
  console.log(event.subscriptionId, event.signature);
  fulfill(event.subscriptionId);
});

await kairos.listen();`,
  },
];

export function DeveloperCode() {
  return (
    <section id="developers" className="section">
      <div className="container-page grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-accent-2">
              {developer.eyebrow}
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-4 text-balance text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-tight">
              {developer.heading}
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-4 text-pretty leading-relaxed text-fg-muted md:text-lg">
              {developer.body}
            </p>
          </Reveal>
          <Reveal delay={190}>
            <ul className="mt-7 space-y-3">
              {developer.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-sm text-fg">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full [background-image:var(--gradient-brand)]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={250}>
            <div className="mt-8">
              <Button href={developer.cta.href} variant="outline" size="lg">
                {developer.cta.label}
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <CodeBlock tabs={TABS} />
        </Reveal>
      </div>
    </section>
  );
}
