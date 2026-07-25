CREATE TABLE "consumed_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "consumed_tokens_expires_idx" ON "consumed_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "charges_plan_idx" ON "charges" USING btree ("plan_pda");--> statement-breakpoint
CREATE INDEX "charges_subscriber_idx" ON "charges" USING btree ("subscriber");--> statement-breakpoint
CREATE INDEX "charges_subscription_period_idx" ON "charges" USING btree ("subscription_pda","period_start_ts");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox" USING btree ("processed_at","id");--> statement-breakpoint
CREATE INDEX "plans_owner_idx" ON "plans" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "plans_status_reconciled_idx" ON "plans" USING btree ("status","reconciled_at");--> statement-breakpoint
CREATE INDEX "subscriptions_subscriber_idx" ON "subscriptions" USING btree ("subscriber");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_pda");--> statement-breakpoint
CREATE INDEX "subscriptions_status_reconciled_idx" ON "subscriptions" USING btree ("status","reconciled_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_merchant_idx" ON "webhook_endpoints" USING btree ("merchant");
