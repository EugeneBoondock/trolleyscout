-- Organisation onboarding: a member who wants to trade on Trolley Scout (a
-- store, a brand, a market stall) applies with their business details. An admin
-- reads the queue and decides. Only an approval creates the organizations row,
-- and that row is what grants the org portal — where they post their own deals
-- and window-shopping posts. Mirrors the ad_submissions conventions: TEXT ids,
-- ISO-8601 TEXT timestamps, CHECK-guarded enums, FK cascade to member_accounts.
CREATE TABLE IF NOT EXISTS organization_applications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  organisation_name TEXT NOT NULL,
  trading_name TEXT,
  registration_number TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  website_url TEXT,
  category TEXT,
  description TEXT NOT NULL,
  city TEXT,
  province TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES member_accounts (id) ON DELETE SET NULL
);

-- The admin review queue reads by status, newest first.
CREATE INDEX IF NOT EXISTS idx_organization_applications_status
  ON organization_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_applications_account
  ON organization_applications (account_id, created_at DESC);

-- One application in the queue per account at a time, so a member cannot flood
-- the admin with resubmissions. Decided applications are exempt, which leaves a
-- rejected applicant free to apply again once they have fixed what was wrong.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_applications_one_pending
  ON organization_applications (account_id)
  WHERE status = 'pending';

-- An approved application becomes an organisation. This row is the access
-- grant: no row, no portal. Suspension revokes the portal without deleting the
-- history behind it.
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  application_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES organization_applications (id) ON DELETE SET NULL
);

-- The portal gate reads the owner's organisation on every request.
CREATE INDEX IF NOT EXISTS idx_organizations_account
  ON organizations (account_id, status);

-- One organisation per approved application, so a repeated approval can never
-- mint a second storefront even if two admins click at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_application
  ON organizations (application_id);
