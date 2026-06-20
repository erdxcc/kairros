import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = site.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated Open Graph image (original placeholder, no external assets).
 * Dark canvas + brand gradient wordmark.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(1200px 600px at 18% -10%, #1a1140 0%, #07070b 55%)",
          color: "#f4f4f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background:
                "linear-gradient(135deg, #8b5cf6 0%, #22d3ee 55%, #14f195 100%)",
            }}
          />
          <div style={{ fontSize: "34px", letterSpacing: "-0.02em" }}>
            Kairos
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: "76px",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "900px",
            }}
          >
            Subscriptions and allowances, settled on-chain.
          </div>
          <div style={{ fontSize: "30px", color: "#8a8a99" }}>
            The billing layer for Solana — non-custodial, settled in seconds.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
