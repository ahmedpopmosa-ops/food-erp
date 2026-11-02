-- Phase 7a: kitchen display (P7-5).

CREATE TABLE "kitchen_stations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "delay_threshold_sec" INTEGER NOT NULL DEFAULT 600,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_station_routes" (
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    CONSTRAINT "kitchen_station_routes_pkey" PRIMARY KEY ("branch_id", "category_id")
);

CREATE TABLE "kitchen_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "fire_id" UUID NOT NULL,
    "ticket_no" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "fired_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "served_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    CONSTRAINT "kitchen_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_ticket_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "modifiers" JSONB NOT NULL DEFAULT '[]',
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    CONSTRAINT "kitchen_ticket_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_ticket_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kitchen_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kitchen_stations_branch_id_code_key" ON "kitchen_stations"("branch_id", "code");
CREATE INDEX "kitchen_stations_tenant_id_branch_id_idx" ON "kitchen_stations"("tenant_id", "branch_id");
CREATE INDEX "kitchen_station_routes_station_id_idx" ON "kitchen_station_routes"("station_id");
CREATE INDEX "kitchen_tickets_tenant_id_branch_id_status_idx" ON "kitchen_tickets"("tenant_id", "branch_id", "status");
CREATE INDEX "kitchen_tickets_tenant_id_order_id_idx" ON "kitchen_tickets"("tenant_id", "order_id");
CREATE INDEX "kitchen_ticket_items_tenant_id_order_item_id_idx" ON "kitchen_ticket_items"("tenant_id", "order_item_id");
CREATE INDEX "kitchen_ticket_events_tenant_id_ticket_id_idx" ON "kitchen_ticket_events"("tenant_id", "ticket_id");
ALTER TABLE "kitchen_station_routes" ADD CONSTRAINT "kitchen_station_routes_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "kitchen_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kitchen_stations', 'kitchen_station_routes', 'kitchen_tickets', 'kitchen_ticket_items', 'kitchen_ticket_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;
-- Tickets are operational records: never deleted; their history is append-only.
REVOKE DELETE ON TABLE kitchen_tickets, kitchen_ticket_items FROM ros_app;
REVOKE UPDATE, DELETE ON TABLE kitchen_ticket_events FROM ros_app;

CREATE UNIQUE INDEX kitchen_stations_id_tenant_key ON kitchen_stations (id, tenant_id);
CREATE UNIQUE INDEX kitchen_tickets_id_tenant_key ON kitchen_tickets (id, tenant_id);
-- One default station per branch.
CREATE UNIQUE INDEX kitchen_stations_one_default ON kitchen_stations (branch_id) WHERE is_default;
-- Ticket numbers are unique per branch and business day; the day is part of the number's sequence scope, so
-- only (station, fire) is enforced here: one ticket per station for each firing.
CREATE UNIQUE INDEX kitchen_tickets_fire_station_key ON kitchen_tickets (fire_id, station_id);

ALTER TABLE kitchen_stations ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE kitchen_stations ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE kitchen_station_routes ADD FOREIGN KEY (station_id, tenant_id) REFERENCES kitchen_stations (id, tenant_id);
ALTER TABLE kitchen_station_routes ADD FOREIGN KEY (category_id, tenant_id) REFERENCES categories (id, tenant_id);
ALTER TABLE kitchen_station_routes ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE kitchen_tickets ADD FOREIGN KEY (station_id, tenant_id) REFERENCES kitchen_stations (id, tenant_id);
ALTER TABLE kitchen_tickets ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE kitchen_ticket_items ADD FOREIGN KEY (ticket_id, tenant_id) REFERENCES kitchen_tickets (id, tenant_id);
ALTER TABLE kitchen_ticket_events ADD FOREIGN KEY (ticket_id, tenant_id) REFERENCES kitchen_tickets (id, tenant_id);

ALTER TABLE kitchen_stations ADD CHECK (delay_threshold_sec BETWEEN 60 AND 7200);
ALTER TABLE kitchen_stations ADD CHECK (NOT is_default OR is_active);
ALTER TABLE kitchen_tickets ADD CHECK (status IN ('new', 'preparing', 'ready', 'served', 'cancelled') AND ticket_no > 0);
ALTER TABLE kitchen_ticket_items ADD CHECK (qty > 0);
ALTER TABLE kitchen_ticket_events ADD CHECK (actor_type IN ('user', 'device', 'system'));

-- Tickets only move along the kitchen flow; served and cancelled tickets are final.
CREATE OR REPLACE FUNCTION kitchen_ticket_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status', 'started_at', 'ready_at', 'served_at', 'cancelled_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'started_at', 'ready_at', 'served_at', 'cancelled_at']) THEN
    RAISE EXCEPTION 'kitchen tickets are immutable except their status' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'new' AND NEW.status IN ('preparing', 'ready', 'cancelled')) OR
    (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled')) OR
    (OLD.status = 'ready' AND NEW.status IN ('served', 'preparing', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'kitchen ticket cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kitchen_ticket_guard BEFORE UPDATE ON kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION kitchen_ticket_guard();

-- Ticket items: the snapshot never changes; only the void stamp may be set, once.
CREATE TRIGGER kitchen_ticket_items_immutable BEFORE UPDATE ON kitchen_ticket_items
  FOR EACH ROW EXECUTE FUNCTION immutable_except('voided_at', 'void_reason');
