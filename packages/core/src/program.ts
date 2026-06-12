/**
 * Constants for the Subscriptions program's self-CPI event wire format.
 *
 * Events are emitted as inner instructions targeting the program's no-op
 * `emit_event` instruction. The instruction data is:
 *
 *   [ 8-byte tag (LE) | 1-byte event kind | packed event payload ]
 *
 * The tag is Anchor-compatible: Sha256("anchor:event")[..8] = 0x1d9acb512ea545e4.
 * These values are not exported by `@solana/subscriptions` (events are absent
 * from the Codama IDL as of v0.3.0), so we define them here. Source of truth:
 * `program/src/event_engine.rs` in solana-program/subscriptions.
 */
export const EVENT_IX_TAG = 0x1d9acb512ea545e4n;

/** Little-endian bytes of {@link EVENT_IX_TAG}, as they appear in instruction data. */
export const EVENT_IX_TAG_LE = new Uint8Array([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

/** Instruction discriminator of the no-op EmitEvent instruction. */
export const EMIT_EVENT_IX_DISC = 228;

/** Event kind byte (9th byte of the event instruction data). */
export enum EventKind {
    SubscriptionCreated = 0,
    SubscriptionCancelled = 1,
    SubscriptionTransfer = 2,
    FixedTransfer = 3,
    RecurringTransfer = 4,
    SubscriptionResumed = 5,
}
