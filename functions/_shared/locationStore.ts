import type { NearbyStore } from "../../src/services/nearbyStores";
import type { TrolleyScoutEnv } from "./env";

// How long a discovered store list stays fresh for a tile (Geoapify results
// change slowly), and how long store promotions live without an end date.
const STORE_LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROMOTION_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StorePromotion {
  id: string;
  capturedAt?: string;
  countryCode?: string;
  placeId: string;
  storeName: string;
  retailerId?: string;
  kind: "deal" | "catalogue";
  title: string;
  priceText?: string;
  previousPriceText?: string;
  savingText?: string;
  sourceUrl: string;
  productUrl?: string;
  imageUrl?: string;
  validFrom?: string;
  validTo?: string;
}

export interface DiscoveredStore extends NearbyStore {
  firstSeenAt: string;
  lastSeenAt: string;
  lastSourceTile?: string;
  nextScoutAt: string;
  promotionCount?: number;
}

export interface DiscoveredStoreRow {
  place_id: string;
  store_name: string;
  address: string | null;
  website: string | null;
  lat: number;
  lon: number;
  retailer_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_source_tile: string | null;
  next_scout_at: string;
  country_code?: string | null;
  promotion_count?: number | null;
}

export interface DiscoveredStoreSummary {
  areaCount: number;
  knownChainCount: number;
  storeCount: number;
  withPromotionsCount: number;
}

function hasDb(
  env: TrolleyScoutEnv,
): env is TrolleyScoutEnv & { DB: D1Database } {
  return Boolean(env.DB);
}

// End of the promotion's last valid day, or a default TTL when no end date is
// printed. Used both to store expires_at and to filter out stale rows on read.
export function promotionExpiryIso(
  validTo: string | undefined,
  nowMs: number,
): string {
  if (validTo && /^\d{4}-\d{2}-\d{2}/.test(validTo)) {
    const localDate = validTo.slice(0, 10);
    const southAfricanEndOfDay = new Date(`${localDate}T21:59:59.999Z`);
    if (
      !Number.isNaN(southAfricanEndOfDay.getTime()) &&
      southAfricanEndOfDay.toISOString().slice(0, 10) === localDate
    ) {
      return southAfricanEndOfDay.toISOString();
    }
  }

  return new Date(nowMs + PROMOTION_DEFAULT_TTL_MS).toISOString();
}

export async function readCachedStores(
  env: TrolleyScoutEnv,
  tileKey: string,
  nowIso: string,
): Promise<NearbyStore[] | undefined> {
  if (!hasDb(env)) {
    return undefined;
  }

  try {
    const row = await env.DB.prepare(
      "SELECT stores_json, expires_at FROM nearby_store_cache WHERE tile_key = ?",
    )
      .bind(tileKey)
      .first<{ stores_json: string; expires_at: string }>();

    if (!row || row.expires_at < nowIso) {
      return undefined;
    }

    const stores = JSON.parse(row.stores_json) as NearbyStore[];
    return Array.isArray(stores) ? stores : undefined;
  } catch {
    return undefined;
  }
}

// Every store the platform has discovered anywhere, newest tiles first —
// the "stores found near shoppers" directory. Deduped by placeId.
export async function readAllDiscoveredStores(
  env: TrolleyScoutEnv,
  _nowIso: string,
  storeLimit = 2000,
  countryCode?: string,
  storeOffset = 0,
  searchQuery?: string,
  includeTileCount = true,
): Promise<{ stores: DiscoveredStore[]; tileCount: number }> {
  if (!hasDb(env)) {
    return { stores: [], tileCount: 0 };
  }

  try {
    const search = searchQuery?.trim().toLowerCase();
    const filters = [
      ...(countryCode ? ["country_code = ?"] : []),
      ...(search
        ? [
            "(LOWER(store_name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(address, '')) LIKE ? ESCAPE '\\')",
          ]
        : []),
    ];
    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const escapedSearch = search
      ?.replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const searchBindings = escapedSearch
      ? [`%${escapedSearch}%`, `%${escapedSearch}%`]
      : [];
    const [result, areaRow] = await Promise.all([
      env.DB.prepare(
        `SELECT place_id, store_name, address, website, lat, lon, retailer_id,
          first_seen_at, last_seen_at, last_source_tile, next_scout_at, country_code,
          promotion_count
          FROM discovered_stores
          ${where}
          ORDER BY last_seen_at DESC
          LIMIT ? OFFSET ?`,
      )
        .bind(
          ...(countryCode ? [countryCode] : []),
          ...searchBindings,
          storeLimit,
          Math.max(0, storeOffset),
        )
        .all<DiscoveredStoreRow>(),
      includeTileCount
        ? env.DB.prepare(
            `SELECT COUNT(DISTINCT last_source_tile) AS area_count
              FROM discovered_stores
              WHERE last_source_tile IS NOT NULL
              ${countryCode ? "AND country_code = ?" : ""}`,
          )
            .bind(...(countryCode ? [countryCode] : []))
            .first<{ area_count: number }>()
        : Promise.resolve(undefined),
    ]);

    return {
      stores: result.results.map(discoveredStoreFromRow),
      tileCount: Number(areaRow?.area_count ?? 0),
    };
  } catch {
    return { stores: [], tileCount: 0 };
  }
}

export function discoveredStoreFromRow(
  row: DiscoveredStoreRow,
): DiscoveredStore {
  return {
    address: row.address ?? undefined,
    countryCode: row.country_code ?? "ZA",
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastSourceTile: row.last_source_tile ?? undefined,
    lat: row.lat,
    lon: row.lon,
    name: row.store_name,
    nextScoutAt: row.next_scout_at,
    placeId: row.place_id,
    ...(row.promotion_count == null
      ? {}
      : { promotionCount: Number(row.promotion_count) }),
    retailerId: (row.retailer_id as NearbyStore["retailerId"]) ?? undefined,
    website: row.website ?? undefined,
  };
}

export async function writeDiscoveredStores(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
  nowMs: number,
  sourceTile?: string,
  countryCode?: string,
): Promise<boolean> {
  if (!hasDb(env) || stores.length === 0) {
    return false;
  }

  const seenAt = new Date(nowMs).toISOString();
  const statement = env.DB.prepare(
    `INSERT INTO discovered_stores (
      place_id, store_name, address, website, lat, lon, retailer_id,
      first_seen_at, last_seen_at, last_source_tile, next_scout_at, country_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (place_id) DO UPDATE SET
      store_name = excluded.store_name,
      address = COALESCE(excluded.address, discovered_stores.address),
      website = COALESCE(excluded.website, discovered_stores.website),
      lat = excluded.lat,
      lon = excluded.lon,
      retailer_id = COALESCE(excluded.retailer_id, discovered_stores.retailer_id),
      last_seen_at = excluded.last_seen_at,
      country_code = excluded.country_code,
      last_source_tile = COALESCE(excluded.last_source_tile, discovered_stores.last_source_tile)`,
  );

  try {
    await env.DB.batch(
      stores.map((store) =>
        statement.bind(
          store.placeId,
          store.name,
          store.address ?? null,
          store.website ?? null,
          store.lat,
          store.lon,
          store.retailerId ?? null,
          seenAt,
          seenAt,
          sourceTile ?? null,
          seenAt,
          countryCode ?? store.countryCode ?? "ZA",
        ),
      ),
    );
    return true;
  } catch {
    // The public location request must still succeed if persistence is unavailable.
    return false;
  }
}

export async function readDueDiscoveredStores(
  env: TrolleyScoutEnv,
  nowIso: string,
  limit = 8,
): Promise<DiscoveredStore[]> {
  if (!hasDb(env)) {
    return [];
  }

  try {
    const result = await env.DB.prepare(
      `SELECT place_id, store_name, address, website, lat, lon, retailer_id,
        first_seen_at, last_seen_at, last_source_tile, next_scout_at, country_code
        FROM discovered_stores
        WHERE next_scout_at <= ?
        ORDER BY next_scout_at ASC, last_seen_at DESC
        LIMIT ?`,
    )
      .bind(nowIso, limit)
      .all<DiscoveredStoreRow>();

    return result.results.map(discoveredStoreFromRow);
  } catch {
    return [];
  }
}

// placeIds that currently have at least one live promotion attached.
export async function readPlacesWithPromotions(
  env: TrolleyScoutEnv,
  nowIso: string,
): Promise<Set<string>> {
  if (!hasDb(env)) {
    return new Set();
  }

  try {
    const result = await env.DB.prepare(
      "SELECT DISTINCT place_id FROM store_promotions WHERE expires_at >= ?",
    )
      .bind(nowIso)
      .all<{ place_id: string }>();

    return new Set(result.results.map((row) => row.place_id));
  } catch {
    return new Set();
  }
}

export async function readPromotionCountsByPlace(
  env: TrolleyScoutEnv,
  nowIso: string,
  countryCode?: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (!hasDb(env)) {
    return counts;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT place_id, COUNT(*) AS promotion_count
        FROM store_promotions
        WHERE expires_at >= ? ${countryCode ? "AND country_code = ?" : ""}
        GROUP BY place_id`,
    )
      .bind(...(countryCode ? [nowIso, countryCode] : [nowIso]))
      .all<{ place_id: string; promotion_count: number }>();

    for (const row of result.results) {
      counts.set(row.place_id, Number(row.promotion_count));
    }
  } catch {
    // Missing storage returns an empty live count map.
  }

  return counts;
}

export async function readAllStorePromotions(
  env: TrolleyScoutEnv,
  nowIso: string,
  limit = 3000,
  countryCode?: string,
): Promise<StorePromotion[]> {
  if (!hasDb(env)) {
    return [];
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to, captured_at, country_code
        FROM store_promotions
        WHERE expires_at >= ? ${countryCode ? "AND country_code = ?" : ""}
        ORDER BY captured_at DESC
        LIMIT ?`,
    )
      .bind(...(countryCode ? [nowIso, countryCode, limit] : [nowIso, limit]))
      .all<StorePromotionRow>();

    return result.results.map(rowToPromotion);
  } catch {
    return [];
  }
}

export async function readDiscoveredStoreByPlaceId(
  env: TrolleyScoutEnv,
  placeId: string,
  countryCode?: string,
): Promise<DiscoveredStore | undefined> {
  if (!hasDb(env)) return undefined;

  try {
    const row = await env.DB.prepare(
      `SELECT place_id, store_name, address, website, lat, lon, retailer_id,
        first_seen_at, last_seen_at, last_source_tile, next_scout_at, country_code,
        promotion_count
        FROM discovered_stores
        WHERE place_id = ? ${countryCode ? "AND country_code = ?" : ""}
        LIMIT 1`,
    )
      .bind(placeId, ...(countryCode ? [countryCode] : []))
      .first<DiscoveredStoreRow>();

    return row ? discoveredStoreFromRow(row) : undefined;
  } catch {
    return undefined;
  }
}

export async function readDiscoveredStoreSummary(
  env: TrolleyScoutEnv,
  nowIso: string,
  countryCode?: string,
): Promise<DiscoveredStoreSummary> {
  const empty = {
    areaCount: 0,
    knownChainCount: 0,
    storeCount: 0,
    withPromotionsCount: 0,
  };
  if (!hasDb(env)) {
    return empty;
  }

  try {
    const countryWhere = countryCode ? "WHERE country_code = ?" : "";
    const [storeRow, promotionRow] = await Promise.all([
      env.DB.prepare(
        `SELECT
          COUNT(*) AS store_count,
          COUNT(DISTINCT last_source_tile) AS area_count,
          SUM(CASE WHEN retailer_id IS NOT NULL AND retailer_id <> '' THEN 1 ELSE 0 END)
            AS known_chain_count
          FROM discovered_stores
          ${countryWhere}`,
      )
        .bind(...(countryCode ? [countryCode] : []))
        .first<{
          area_count: number | null;
          known_chain_count: number | null;
          store_count: number | null;
        }>(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT discovered_stores.place_id) AS store_count
          FROM discovered_stores
          INNER JOIN store_promotions
            ON store_promotions.place_id = discovered_stores.place_id
            AND store_promotions.expires_at >= ?
            ${countryCode ? "AND store_promotions.country_code = ?" : ""}
          ${countryCode ? "WHERE discovered_stores.country_code = ?" : ""}`,
      )
        .bind(...(countryCode ? [nowIso, countryCode, countryCode] : [nowIso]))
        .first<{ store_count: number | null }>(),
    ]);

    return {
      areaCount: Number(storeRow?.area_count ?? 0),
      knownChainCount: Number(storeRow?.known_chain_count ?? 0),
      storeCount: Number(storeRow?.store_count ?? 0),
      withPromotionsCount: Number(promotionRow?.store_count ?? 0),
    };
  } catch {
    return empty;
  }
}

// Alert snapshots use a strict, paged deal-only reader. Query failures must
// abort the alert batch instead of looking like an empty promotion corpus.
export async function readActiveStoreDealPromotionsStrict(
  env: TrolleyScoutEnv,
  nowIso: string,
  limit = 200,
  offset = 0,
): Promise<StorePromotion[]> {
  if (!hasDb(env)) {
    throw new Error("Strict store promotion reads require a database binding.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("limit must be an integer between 1 and 1000.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("offset must be a non-negative integer.");
  }

  const result = await env.DB.prepare(
    `SELECT id, place_id, store_name, retailer_id, kind, title, price_text,
      previous_price_text, saving_text, source_url, product_url, image_url,
      valid_from, valid_to, captured_at
      FROM store_promotions
      WHERE kind = 'deal' AND expires_at >= ?
      ORDER BY captured_at DESC, id ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(nowIso, limit, offset)
    .all<StorePromotionRow>();

  return result.results.map(rowToPromotion);
}

// Reads only catalogue rows before applying pagination. A large deal feed can
// therefore never push a branch catalogue beyond this query's page limit.
export async function readAllStoreCatalogues(
  env: TrolleyScoutEnv,
  nowIso: string,
  limit = 3000,
  offset = 0,
  countryCode?: string,
): Promise<StorePromotion[]> {
  if (!hasDb(env)) {
    return [];
  }

  const pageSize = Math.max(1, Math.min(3000, Math.floor(limit)));
  const pageOffset = Math.max(0, Math.floor(offset));

  try {
    const result = await env.DB.prepare(
      `SELECT id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to, captured_at, country_code
        FROM store_promotions
        WHERE kind = 'catalogue' AND expires_at >= ?
          ${countryCode ? "AND country_code = ?" : ""}
        ORDER BY captured_at DESC, id ASC
        LIMIT ? OFFSET ?`,
    )
      .bind(
        ...(countryCode
          ? [nowIso, countryCode, pageSize, pageOffset]
          : [nowIso, pageSize, pageOffset]),
      )
      .all<StorePromotionRow>();

    return result.results.map(rowToPromotion);
  } catch {
    return [];
  }
}

export async function writeCachedStores(
  env: TrolleyScoutEnv,
  tileKey: string,
  stores: NearbyStore[],
  nowMs: number,
  countryCode?: string,
): Promise<boolean> {
  if (!hasDb(env) || stores.length === 0) {
    return false;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO nearby_store_cache (tile_key, stores_json, checked_at, expires_at, country_code)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (tile_key) DO UPDATE SET
          stores_json = excluded.stores_json,
          checked_at = excluded.checked_at,
          expires_at = excluded.expires_at,
          country_code = excluded.country_code`,
    )
      .bind(
        tileKey,
        JSON.stringify(stores),
        new Date(nowMs).toISOString(),
        new Date(nowMs + STORE_LIST_TTL_MS).toISOString(),
        countryCode ?? stores[0]?.countryCode ?? "ZA",
      )
      .run();
    return await writeDiscoveredStores(
      env,
      stores,
      nowMs,
      tileKey,
      countryCode,
    );
  } catch {
    // Best-effort cache; discovery already succeeded.
    return false;
  }
}

// Valid (unexpired) promotions for a set of stores, newest capture first.
export async function readStorePromotions(
  env: TrolleyScoutEnv,
  placeIds: string[],
  nowIso: string,
  countryCode?: string,
): Promise<Map<string, StorePromotion[]>> {
  const byPlace = new Map<string, StorePromotion[]>();

  if (!hasDb(env) || placeIds.length === 0) {
    return byPlace;
  }

  try {
    const placeholders = placeIds.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to, captured_at, country_code
        FROM store_promotions
        WHERE place_id IN (${placeholders}) AND expires_at >= ?
          ${countryCode ? "AND country_code = ?" : ""}
        ORDER BY captured_at DESC`,
    )
      .bind(...placeIds, nowIso, ...(countryCode ? [countryCode] : []))
      .all<StorePromotionRow>();

    for (const row of result.results) {
      const list = byPlace.get(row.place_id) ?? [];
      list.push(rowToPromotion(row));
      byPlace.set(row.place_id, list);
    }
  } catch {
    // Missing table (migration not applied) degrades to no cached promotions.
  }

  return byPlace;
}

export async function saveStorePromotions(
  env: TrolleyScoutEnv,
  promotions: StorePromotion[],
  nowMs: number,
): Promise<boolean> {
  if (!hasDb(env) || promotions.length === 0) {
    return false;
  }

  try {
    const statement = env.DB.prepare(
      `INSERT INTO store_promotions (
        id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to, captured_at, expires_at, country_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        price_text = excluded.price_text,
        previous_price_text = excluded.previous_price_text,
        saving_text = excluded.saving_text,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        captured_at = excluded.captured_at,
        expires_at = excluded.expires_at,
        country_code = excluded.country_code`,
    );
    const capturedAt = new Date(nowMs).toISOString();

    await env.DB.batch(
      promotions.map((promotion) =>
        statement.bind(
          promotion.id,
          promotion.placeId,
          promotion.storeName,
          promotion.retailerId ?? null,
          promotion.kind,
          promotion.title,
          promotion.priceText ?? null,
          promotion.previousPriceText ?? null,
          promotion.savingText ?? null,
          promotion.sourceUrl,
          promotion.productUrl ?? null,
          promotion.imageUrl ?? null,
          promotion.validFrom ?? null,
          promotion.validTo ?? null,
          capturedAt,
          promotionExpiryIso(promotion.validTo, nowMs),
          promotion.countryCode ?? "ZA",
        ),
      ),
    );
    return true;
  } catch {
    // Best-effort write.
    return false;
  }
}

// Call only after a source returned a certain, non-empty success. Rows that
// disappeared from that same place and official host are removed. Supplying an
// empty result is intentionally a no-op so failed or uncertain empty attempts
// retain the last known valid promotions.
export async function reconcileSuccessfulStorePromotions(
  env: TrolleyScoutEnv,
  placeId: string,
  currentPromotions: StorePromotion[],
): Promise<number> {
  if (!hasDb(env) || currentPromotions.length === 0) {
    return 0;
  }

  const sourceIdentities = new Set(
    currentPromotions
      .map((promotion) => storePromotionSourceIdentity(promotion.sourceUrl))
      .filter((identity): identity is string => Boolean(identity)),
  );
  if (sourceIdentities.size === 0) {
    return 0;
  }

  const retainedIds = new Set(
    currentPromotions.map((promotion) => promotion.id),
  );

  try {
    const result = await env.DB.prepare(
      "SELECT id, source_url FROM store_promotions WHERE place_id = ?",
    )
      .bind(placeId)
      .all<{ id: string; source_url: string }>();
    const staleIds = result.results
      .filter((row) => {
        const identity = storePromotionSourceIdentity(row.source_url);
        return (
          identity !== undefined &&
          sourceIdentities.has(identity) &&
          !retainedIds.has(row.id)
        );
      })
      .map((row) => row.id);

    if (staleIds.length === 0) {
      return 0;
    }

    const statement = env.DB.prepare(
      "DELETE FROM store_promotions WHERE id = ? AND place_id = ?",
    );
    const deleteResults = await env.DB.batch(
      staleIds.map((id) => statement.bind(id, placeId)),
    );
    return deleteResults.reduce((total, deleteResult) => {
      return total + (deleteResult.meta.changes ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}

function storePromotionSourceIdentity(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Removes every row whose expiry has passed. Returns how many were deleted so
// the scheduled scout can report it. This is the "expire after the date" rule.
export async function purgeExpired(
  env: TrolleyScoutEnv,
  nowIso: string,
): Promise<number> {
  if (!hasDb(env)) {
    return 0;
  }

  let removed = 0;

  for (const table of ["store_promotions", "nearby_store_cache"]) {
    try {
      const result = await env.DB.prepare(
        `DELETE FROM ${table} WHERE expires_at < ?`,
      )
        .bind(nowIso)
        .run();
      removed += result.meta.changes ?? 0;
    } catch {
      // Table may not exist yet; ignore.
    }
  }

  return removed;
}

export async function shouldScoutStore(
  env: TrolleyScoutEnv,
  placeId: string,
  nowIso: string,
): Promise<boolean> {
  if (!hasDb(env)) {
    return false;
  }

  try {
    const row = await env.DB.prepare(
      "SELECT next_scout_at FROM store_scout_log WHERE place_id = ?",
    )
      .bind(placeId)
      .first<{ next_scout_at: string }>();

    return !row || row.next_scout_at < nowIso;
  } catch {
    return false;
  }
}

// How long one caller holds an exclusive claim on scouting a store. Long
// enough to cover a full scrape (4 fetches × 8s timeout), short enough that a
// crashed attempt is retried on the next nearby search.
const STORE_SCOUT_CLAIM_MS = 10 * 60 * 1000;

/**
 * Atomically claims a store for scouting. Unlike [shouldScoutStore] (a
 * read-then-decide check), this is race-safe: of N concurrent requests near
 * the same due store, exactly one wins the claim and scrapes; the rest skip.
 * The winner's [recordStoreScout] overwrites the claim window with the real
 * next-scout time; a crashed winner is retried once the claim expires.
 */
export async function claimStoreScout(
  env: TrolleyScoutEnv,
  placeId: string,
  nowIso: string,
): Promise<boolean> {
  if (!hasDb(env)) {
    return false;
  }

  const holdUntil = new Date(
    Date.parse(nowIso) + STORE_SCOUT_CLAIM_MS,
  ).toISOString();

  try {
    const updated = await env.DB.prepare(
      "UPDATE store_scout_log SET next_scout_at = ? WHERE place_id = ? AND next_scout_at < ?",
    )
      .bind(holdUntil, placeId, nowIso)
      .run();
    if ((updated.meta.changes ?? 0) > 0) {
      return true;
    }

    // No row yet (never scouted): the first inserter wins the claim.
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO store_scout_log
        (place_id, store_name, website, retailer_id, scouted_at, next_scout_at, promotion_count)
        VALUES (?, '', NULL, NULL, ?, ?, 0)`,
    )
      .bind(placeId, nowIso, holdUntil)
      .run();
    return (inserted.meta.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRANSIENT_RETRY_MS = 60 * 60 * 1000;

export type StoreScoutOutcomeStatus =
  "success" | "empty" | "transient_failure" | "permanent_unverified";

export async function recordStoreScout(
  env: TrolleyScoutEnv,
  store: NearbyStore,
  promotionCount: number,
  nowMs: number,
  // Numeric delays remain supported for areaScout. Store source scouts use a
  // typed outcome so transient transport failures retry sooner than a fully
  // completed empty or successful attempt.
  outcomeOrDelay: StoreScoutOutcomeStatus | number = "empty",
): Promise<void> {
  if (!hasDb(env)) {
    return;
  }

  const nextScoutMs =
    typeof outcomeOrDelay === "number"
      ? outcomeOrDelay
      : outcomeOrDelay === "transient_failure"
        ? TRANSIENT_RETRY_MS
        : DAY_MS;
  const nextScoutAt = new Date(nowMs + nextScoutMs).toISOString();
  const preservePromotionCount =
    outcomeOrDelay === "transient_failure" ||
    outcomeOrDelay === "permanent_unverified";

  try {
    await env.DB.prepare(
      `INSERT INTO store_scout_log (place_id, store_name, website, retailer_id, scouted_at, next_scout_at, promotion_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (place_id) DO UPDATE SET
          store_name = excluded.store_name,
          website = excluded.website,
          retailer_id = excluded.retailer_id,
          scouted_at = excluded.scouted_at,
          next_scout_at = excluded.next_scout_at,
          promotion_count = CASE
            WHEN ? = 1 THEN store_scout_log.promotion_count
            ELSE excluded.promotion_count
          END`,
    )
      .bind(
        store.placeId,
        store.name,
        store.website ?? null,
        store.retailerId ?? null,
        new Date(nowMs).toISOString(),
        nextScoutAt,
        promotionCount,
        preservePromotionCount ? 1 : 0,
      )
      .run();
    await env.DB.prepare(
      `UPDATE discovered_stores
        SET last_scout_at = ?, next_scout_at = ?, promotion_count = CASE
          WHEN ? = 1 THEN promotion_count
          ELSE ?
        END
        WHERE place_id = ?`,
    )
      .bind(
        new Date(nowMs).toISOString(),
        nextScoutAt,
        preservePromotionCount ? 1 : 0,
        promotionCount,
        store.placeId,
      )
      .run();
  } catch {
    // Best-effort.
  }
}

interface StorePromotionRow {
  id: string;
  captured_at: string;
  place_id: string;
  store_name: string;
  retailer_id: string | null;
  kind: string;
  title: string;
  price_text: string | null;
  previous_price_text: string | null;
  saving_text: string | null;
  source_url: string;
  product_url: string | null;
  image_url: string | null;
  valid_from: string | null;
  valid_to: string | null;
  country_code?: string | null;
}

function rowToPromotion(row: StorePromotionRow): StorePromotion {
  return {
    capturedAt: row.captured_at,
    countryCode: row.country_code ?? "ZA",
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    kind: row.kind === "catalogue" ? "catalogue" : "deal",
    placeId: row.place_id,
    previousPriceText: row.previous_price_text ?? undefined,
    priceText: row.price_text ?? undefined,
    productUrl: row.product_url ?? undefined,
    retailerId: row.retailer_id ?? undefined,
    savingText: row.saving_text ?? undefined,
    sourceUrl: row.source_url,
    storeName: row.store_name,
    title: row.title,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
  };
}
