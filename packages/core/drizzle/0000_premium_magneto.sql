CREATE TABLE "chain_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"signature" text NOT NULL,
	"outer_ix_index" integer NOT NULL,
	"inner_ix_index" integer NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" bigint,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_event_id" integer,
	"subscription_pda" text NOT NULL,
	"plan_pda" text NOT NULL,
	"subscriber" text NOT NULL,
	"mint" text NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"receiver" text,
	"period_start_ts" bigint,
	"period_end_ts" bigint,
	"status" text NOT NULL,
	"error_code" text,
	"signature" text,
	"executed_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"last_signature" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"plan_pda" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"plan_id" numeric(20, 0) NOT NULL,
	"mint" text NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"period_hours" bigint NOT NULL,
	"status" text NOT NULL,
	"end_ts" bigint NOT NULL,
	"destinations" jsonb NOT NULL,
	"pullers" jsonb NOT NULL,
	"metadata_uri" text DEFAULT '' NOT NULL,
	"created_at_chain" bigint NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"subscription_pda" text PRIMARY KEY NOT NULL,
	"plan_pda" text NOT NULL,
	"subscriber" text NOT NULL,
	"mint" text NOT NULL,
	"status" text NOT NULL,
	"created_ts" bigint NOT NULL,
	"current_period_start_ts" bigint NOT NULL,
	"amount_pulled_in_period" numeric(20, 0) DEFAULT '0' NOT NULL,
	"expires_at_ts" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_position_unique" ON "chain_events" USING btree ("signature","outer_ix_index","inner_ix_index");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_chain_event_unique" ON "charges" USING btree ("chain_event_id");