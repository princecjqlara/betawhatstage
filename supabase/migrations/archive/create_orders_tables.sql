-- Migration: Create Orders and Order Items Tables
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ORDERS TABLE (Carts)
-- ============================================================================

CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  status order_status DEFAULT 'pending',
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'PHP',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding open carts (pending orders) for a lead
CREATE INDEX IF NOT EXISTS idx_orders_lead_status ON orders(lead_id, status);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on orders" ON orders
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL, -- Snapshot of name in case product is deleted
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  variations JSONB, -- Store selected options e.g. {"Size": "M", "Color": "Red"}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying items in an order
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on order_items" ON order_items
  FOR ALL USING (true) WITH CHECK (true);
