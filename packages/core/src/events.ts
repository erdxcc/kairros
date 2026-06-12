/**
 * Decoders for the Subscriptions program's self-CPI events.
 *
 * The program emits events as inner instructions targeting its own no-op
 * `emit_event` instruction. Instruction data layout:
 *
 *   [ 8-byte tag (LE, Anchor-compatible) | 1-byte event kind | packed payload ]
 *
 * Payload layouts are `#[repr(C, packed)]` structs serialized field-by-field
 * in declaration order with little-endian integers. The official SDK exports
 * no event decoders (events are absent from the Codama IDL as of v0.3.0), so
 * these are hand-written against `program/src/events/*.rs` and regression-
 * locked by fixtures recorded from real devnet transactions.
 */
import { type Address, getBase58Decoder, getBase58Encoder } from '@solana/kit';
import { EVENT_IX_TAG_LE, EventKind } from './program.js';

export interface SubscriptionCreatedEvent {
    kind: 'subscriptionCreated';
    plan: Address;
    subscriber: Address;
    mint: Address;
    createdTs: bigint;
}

export interface SubscriptionCancelledEvent {
    kind: 'subscriptionCancelled';
    plan: Address;
    subscriber: Address;
    expiresAtTs: bigint;
}

export interface SubscriptionResumedEvent {
    kind: 'subscriptionResumed';
    plan: Address;
    subscriber: Address;
    resumedTs: bigint;
}

export interface SubscriptionTransferEvent {
    kind: 'subscriptionTransfer';
    subscription: Address;
    plan: Address;
    delegator: Address;
    mint: Address;
    amount: bigint;
    periodStartTs: bigint;
    periodEndTs: bigint;
    amountPulledInPeriod: bigint;
    receiver: Address;
}

export interface FixedTransferEvent {
    kind: 'fixedTransfer';
    delegation: Address;
    delegator: Address;
    delegatee: Address;
    mint: Address;
    amount: bigint;
    remainingAmount: bigint;
    receiver: Address;
}

export interface RecurringTransferEvent {
    kind: 'recurringTransfer';
    delegation: Address;
    delegator: Address;
    delegatee: Address;
    mint: Address;
    amount: bigint;
    periodStartTs: bigint;
    periodEndTs: bigint;
    amountPulledInPeriod: bigint;
    receiver: Address;
}

export type KairosChainEvent =
    | SubscriptionCreatedEvent
    | SubscriptionCancelledEvent
    | SubscriptionResumedEvent
    | SubscriptionTransferEvent
    | FixedTransferEvent
    | RecurringTransferEvent;

const PREFIX_LEN = 9; // 8-byte tag + 1-byte kind

/** Sequential reader over a packed little-endian payload. */
class ByteReader {
    private offset = 0;
    private readonly view: DataView;

    constructor(private readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    private ensure(byteCount: number): void {
        if (this.offset + byteCount > this.bytes.byteLength) {
            throw new Error(
                `Event payload length mismatch: needed ${byteCount} bytes at offset ${this.offset}, payload is ${this.bytes.byteLength} bytes. The on-chain event layout may have changed — update the decoders and fixtures.`,
            );
        }
    }

    address(): Address {
        this.ensure(32);
        const slice = this.bytes.subarray(this.offset, this.offset + 32);
        this.offset += 32;
        return getBase58Decoder().decode(slice) as Address;
    }

    u64(): bigint {
        this.ensure(8);
        const value = this.view.getBigUint64(this.offset, true);
        this.offset += 8;
        return value;
    }

    i64(): bigint {
        this.ensure(8);
        const value = this.view.getBigInt64(this.offset, true);
        this.offset += 8;
        return value;
    }

    expectExhausted(kind: string): void {
        if (this.offset !== this.bytes.byteLength) {
            throw new Error(
                `Event payload length mismatch for ${kind}: read ${this.offset} of ${this.bytes.byteLength} bytes. The on-chain event layout may have changed — update the decoders and fixtures.`,
            );
        }
    }
}

/** Returns true when instruction data carries the program's event tag. */
export function isEventInstructionData(data: Uint8Array): boolean {
    if (data.byteLength < PREFIX_LEN) return false;
    for (let i = 0; i < 8; i++) {
        if (data[i] !== EVENT_IX_TAG_LE[i]) return false;
    }
    return true;
}

/**
 * Decodes raw event-instruction data into a typed event.
 * Returns `undefined` for non-event data; throws on a recognized event with
 * an unexpected payload length (i.e. an upstream layout change).
 */
export function decodeEventData(data: Uint8Array): KairosChainEvent | undefined {
    if (!isEventInstructionData(data)) return undefined;
    const kind = data[PREFIX_LEN - 1];
    const reader = new ByteReader(data.subarray(PREFIX_LEN));

    switch (kind) {
        case EventKind.SubscriptionCreated: {
            const event: SubscriptionCreatedEvent = {
                kind: 'subscriptionCreated',
                plan: reader.address(),
                subscriber: reader.address(),
                mint: reader.address(),
                createdTs: reader.i64(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        case EventKind.SubscriptionCancelled: {
            const event: SubscriptionCancelledEvent = {
                kind: 'subscriptionCancelled',
                plan: reader.address(),
                subscriber: reader.address(),
                expiresAtTs: reader.i64(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        case EventKind.SubscriptionTransfer: {
            const event: SubscriptionTransferEvent = {
                kind: 'subscriptionTransfer',
                subscription: reader.address(),
                plan: reader.address(),
                delegator: reader.address(),
                mint: reader.address(),
                amount: reader.u64(),
                periodStartTs: reader.i64(),
                periodEndTs: reader.i64(),
                amountPulledInPeriod: reader.u64(),
                receiver: reader.address(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        case EventKind.FixedTransfer: {
            const event: FixedTransferEvent = {
                kind: 'fixedTransfer',
                delegation: reader.address(),
                delegator: reader.address(),
                delegatee: reader.address(),
                mint: reader.address(),
                amount: reader.u64(),
                remainingAmount: reader.u64(),
                receiver: reader.address(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        case EventKind.RecurringTransfer: {
            const event: RecurringTransferEvent = {
                kind: 'recurringTransfer',
                delegation: reader.address(),
                delegator: reader.address(),
                delegatee: reader.address(),
                mint: reader.address(),
                amount: reader.u64(),
                periodStartTs: reader.i64(),
                periodEndTs: reader.i64(),
                amountPulledInPeriod: reader.u64(),
                receiver: reader.address(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        case EventKind.SubscriptionResumed: {
            const event: SubscriptionResumedEvent = {
                kind: 'subscriptionResumed',
                plan: reader.address(),
                subscriber: reader.address(),
                resumedTs: reader.i64(),
            };
            reader.expectExhausted(event.kind);
            return event;
        }
        default:
            throw new Error(
                `Unknown event kind ${kind} — a new event type was likely added upstream. Update EventKind and the decoders.`,
            );
    }
}

/** One decoded event with its position inside the transaction (idempotency key). */
export interface ExtractedEvent {
    outerIxIndex: number;
    innerIxIndex: number;
    event: KairosChainEvent;
}

interface ParsedInnerInstruction {
    readonly programId?: string;
    readonly data?: string; // base58
}

interface ParsedTransactionLike {
    readonly meta?: {
        readonly err?: unknown;
        readonly innerInstructions?: ReadonlyArray<{
            readonly index: number;
            readonly instructions: readonly ParsedInnerInstruction[];
        }> | null;
    } | null;
}

/**
 * Extracts all Subscriptions events from a `getTransaction` response with
 * `jsonParsed` encoding. Failed transactions never emit events and yield [].
 */
export function extractEventsFromTransaction(
    tx: ParsedTransactionLike,
    programAddress: string,
): ExtractedEvent[] {
    if (!tx.meta || tx.meta.err != null) return [];
    const groups = tx.meta.innerInstructions ?? [];
    const results: ExtractedEvent[] = [];
    for (const group of groups) {
        group.instructions.forEach((ix, innerIxIndex) => {
            if (ix.programId !== programAddress || typeof ix.data !== 'string') return;
            const bytes = getBase58Encoder().encode(ix.data) as Uint8Array;
            const event = decodeEventData(bytes);
            if (event) {
                results.push({ outerIxIndex: group.index, innerIxIndex, event });
            }
        });
    }
    return results;
}
