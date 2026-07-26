-- Trolley Scout for Business publication, location, review, media, and
-- aggregate reporting data.

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'editor', 'analyst')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, account_id),
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO organization_members (organization_id, account_id, role, created_at)
SELECT id, account_id, 'owner', created_at FROM organizations;

CREATE TABLE IF NOT EXISTS organization_profiles (
  organization_id TEXT PRIMARY KEY,
  public_name TEXT NOT NULL,
  logo_url TEXT,
  category TEXT,
  description TEXT,
  website_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  default_target_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT,
  country_code TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_locations_owner
  ON organization_locations (organization_id, status, name);

CREATE TABLE IF NOT EXISTS organization_publications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('deal', 'special', 'promotion', 'post')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'changes_requested', 'scheduled', 'live',
      'paused', 'expired', 'rejected', 'archived'
    )),
  placement TEXT NOT NULL
    CHECK (placement IN ('marketplace', 'window', 'both')),
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  target_url TEXT,
  image_url TEXT,
  image_alt TEXT,
  price_cents INTEGER,
  previous_price_cents INTEGER,
  currency_code TEXT,
  offer_text TEXT,
  coupon_code TEXT,
  starts_at TEXT,
  ends_at TEXT,
  sold_out INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1)),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES member_accounts (id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES member_accounts (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_organization_publications_owner
  ON organization_publications (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_publications_delivery
  ON organization_publications (status, placement, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS organization_publication_media (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  publication_id TEXT,
  object_key TEXT,
  media_url TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_publication_media_order
  ON organization_publication_media (publication_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_organization_publication_media_owner
  ON organization_publication_media (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_publication_locations (
  publication_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  PRIMARY KEY (publication_id, location_id),
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES organization_locations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_publication_events_daily (
  publication_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  opens INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  outbound_visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publication_id, event_date),
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_publication_reviews (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  reviewer_account_id TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_account_id) REFERENCES member_accounts (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_organization_publication_reviews_publication
  ON organization_publication_reviews (publication_id, created_at DESC);
