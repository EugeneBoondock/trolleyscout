// Public directory of every store the platform has discovered through the
// Near-me scouts, across all shoppers. This is what turns individual location
// searches into a shared national store database.

import { nearbyStoreLogoUrl } from "../../src/services/storeLogos";
import type { TrolleyScoutEnv } from "../_shared/env";
import {
  readAllDiscoveredStores,
  readAllStorePromotions,
  readDiscoveredStoreByPlaceId,
  readDiscoveredStoreSummary,
  readPromotionCountsByPlace,
  readRetailerDealCounts,
  readStorePromotions,
  type DiscoveredStore,
  type StorePromotion,
} from "../_shared/locationStore";
import { json, methodNotAllowed } from "../_shared/respond";
import {
  countryFromCode,
  detectRequestCountry,
} from "../_shared/countryContext";
import { getMemberSession } from "../_shared/memberStore";

// Public, cookieless data — same cross-origin policy as /api/nearby-stores.
const privateHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "private, no-store",
};

const MAX_PROMOTIONS_PER_STORE = 24;
const MAX_DIRECTORY_PAGE_SIZE = 100;

// How far a shop can be and still count as near the shopper. Wide enough to
// cover a metro and the towns around it, narrow enough that the page stops
// being a national directory of shops nobody can walk into.
const DEFAULT_NEAR_RADIUS_KM = 60;
const MAX_NEAR_RADIUS_KM = 500;

export function distanceBetweenKm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/// Keeps the shops a shopper could actually reach, nearest first.
///
/// The directory listed every shop in the country, so someone in Cape Town
/// scrolled past shops in Polokwane. Distance is used rather than a province
/// because it is exact from the coordinates already stored, it does not stop at
/// a border a shopper does not care about, and it still means something in
/// countries that have no provinces at all.
export function keepStoresNear<T extends { lat: number; lon: number }>(
  stores: T[],
  origin: { lat: number; lon: number } | undefined,
  radiusKm: number,
): Array<T & { distanceKm?: number }> {
  if (!origin) {
    return stores;
  }

  return stores
    .map((store) => ({
      distanceKm: distanceBetweenKm(origin.lat, origin.lon, store.lat, store.lon),
      store,
    }))
    .filter((entry) => entry.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map((entry) => ({
      ...entry.store,
      distanceKm: Math.round(entry.distanceKm * 10) / 10,
    }));
}

function readOrigin(url: URL): { lat: number; lon: number } | undefined {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  // Zero is a real coordinate but not one any shopper stands on, and it is what
  // an unset field parses to, so it is treated as absent rather than sending
  // everyone to the Gulf of Guinea.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return undefined;
  }

  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
}

function readRadiusKm(url: URL): number {
  const requested = Number(url.searchParams.get("radiusKm"));

  if (!Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_NEAR_RADIUS_KM;
  }

  return Math.min(requested, MAX_NEAR_RADIUS_KM);
}

export function attachPromotionDetails(
  stores: DiscoveredStore[],
  promotionCounts: Map<string, number>,
  promotions: StorePromotion[],
  retailerDealCounts: Map<string, number> = new Map(),
) {
  const promotionsByPlace = new Map<string, StorePromotion[]>();

  for (const promotion of promotions) {
    const storePromotions = promotionsByPlace.get(promotion.placeId) ?? [];
    storePromotions.push(promotion);
    promotionsByPlace.set(promotion.placeId, storePromotions);
  }

  return stores.map((store) => {
    const promotionCount = promotionCounts.get(store.placeId) ?? 0;
    // A branch of a known chain also carries whatever that chain published
    // through its own feed. Those deals belong to the retailer, not to any one
    // shop, so counting only what was scouted at this address told a shopper a
    // Shoprite had nothing on the day Shoprite had hundreds.
    const retailerDealCount = store.retailerId
      ? retailerDealCounts.get(store.retailerId) ?? 0
      : 0;
    const dealCount = promotionCount + retailerDealCount;

    return {
      ...store,
      deals: [],
      hasPromotions: dealCount > 0,
      leaflets: [],
      logoUrl: nearbyStoreLogoUrl(store),
      promotionCount: dealCount,
      promotions: prioritizePromotionDetails(
        promotionsByPlace.get(store.placeId) ?? [],
      ),
      // Kept apart so the card can say where a number came from: what was
      // found at this branch, and what the chain published for everyone.
      retailerDealCount,
      storePromotionCount: promotionCount,
    };
  });
}

function prioritizePromotionDetails(
  promotions: StorePromotion[],
): StorePromotion[] {
  return [...promotions]
    .sort(
      (left, right) =>
        Number(right.kind === "catalogue") - Number(left.kind === "catalogue"),
    )
    .slice(0, MAX_PROMOTIONS_PER_STORE);
}

const EDGE_CACHE_SECONDS = 300;

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({
  env,
  request,
  waitUntil,
}) => {
  if (request.method !== "GET") {
    return methodNotAllowed(request.method, "GET");
  }

  const nowIso = new Date().toISOString();
  const url = new URL(request.url);
  const summaryOnly = url.searchParams.get("summary") === "1";
  const lightweight = url.searchParams.get("details") === "0";
  const placeId = url.searchParams.get("placeId")?.trim().slice(0, 256);
  const searchQuery = url.searchParams.get("q")?.trim().slice(0, 100);
  const requestedLimit = Number(url.searchParams.get("limit"));
  const requestedOffset = Number(url.searchParams.get("offset"));
  const origin = readOrigin(url);
  const radiusKm = readRadiusKm(url);
  const pageLimit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_DIRECTORY_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
    : MAX_DIRECTORY_PAGE_SIZE;
  const pageOffset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.floor(requestedOffset))
    : 0;
  const session = await getMemberSession(env, request);
  const detected = detectRequestCountry(request);
  const country = countryFromCode(
    session.account?.countryCode ?? detected.code,
  );

  // The directory is identical for every visitor in a country — one edge
  // copy per country instead of three D1 sweeps per request.
  // Search terms are high-cardinality and already debounced by clients. Avoid
  // filling edge storage with one-off query variants.
  const edgeCache = searchQuery ? undefined : await openEdgeCache();
  const cacheParams = new URLSearchParams({
    country: country.code,
    details: lightweight ? "0" : "1",
    limit: String(pageLimit),
    offset: String(pageOffset),
    summary: summaryOnly ? "1" : "0",
  });
  if (placeId) cacheParams.set("placeId", placeId);
  if (searchQuery) cacheParams.set("q", searchQuery.toLowerCase());
  const edgeCacheKey = `https://edge-cache.trolleyscout.co.za/api/discovered-stores?${cacheParams}`;
  if (edgeCache) {
    const cached = await edgeCache.match(edgeCacheKey);
    if (cached) {
      return cached;
    }
  }

  if (summaryOnly) {
    const summary = await readDiscoveredStoreSummary(env, nowIso, country.code);
    return cacheResponse(
      json({ country, stores: [], summary }, { headers: privateHeaders }),
    );
  }

  if (placeId) {
    const store = await readDiscoveredStoreByPlaceId(
      env,
      placeId,
      country.code,
    );
    if (!store) {
      return cacheResponse(
        json(
          {
            country,
            pagination: { hasMore: false, limit: 1, offset: 0 },
            stores: [],
            summary: {
              areaCount: 0,
              knownChainCount: 0,
              storeCount: 0,
              withPromotionsCount: 0,
            },
          },
          { headers: privateHeaders },
        ),
      );
    }
    const promotionsByPlace = await readStorePromotions(
      env,
      [placeId],
      nowIso,
      country.code,
    );
    const promotions = promotionsByPlace.get(placeId) ?? [];
    const stores = attachPromotionDetails(
      [store],
      new Map([[placeId, promotions.length]]),
      promotions,
    ).map((item) => ({ ...item, detailsLoaded: true }));
    return cacheResponse(
      json(
        {
          country,
          pagination: { hasMore: false, limit: 1, offset: 0 },
          stores,
          summary: {
            areaCount: 0,
            knownChainCount: store.retailerId ? 1 : 0,
            storeCount: 1,
            withPromotionsCount: promotions.length > 0 ? 1 : 0,
          },
        },
        { headers: privateHeaders },
      ),
    );
  }

  if (lightweight) {
    const [{ stores: pageWithSentinel }, summary] = await Promise.all([
      readAllDiscoveredStores(
        env,
        nowIso,
        pageLimit + 1,
        country.code,
        pageOffset,
        searchQuery,
        false,
      ),
      readDiscoveredStoreSummary(env, nowIso, country.code),
    ]);
    const hasMore = pageWithSentinel.length > pageLimit;
    const stores = pageWithSentinel.slice(0, pageLimit).map((store) => ({
      ...store,
      deals: [],
      detailsLoaded: false,
      hasPromotions: (store.promotionCount ?? 0) > 0,
      leaflets: [],
      logoUrl: nearbyStoreLogoUrl(store),
      promotions: [],
    }));
    return cacheResponse(
      json(
        {
          country,
          pagination: { hasMore, limit: pageLimit, offset: pageOffset },
          stores,
          summary,
        },
        { headers: privateHeaders },
      ),
    );
  }

  // A client that never sends limit/offset wants the whole directory, so this
  // branch keeps its own much larger defaults (2000 stores, 3000 promotions)
  // instead of the lightweight branch's page size. But a client that does
  // paginate must be honoured here too — previously these two params were
  // read only for the lightweight/placeId branches and silently ignored here,
  // so a paginated request still paid for (and received) the full directory.
  const detailsPaginated =
    Number.isFinite(requestedLimit) || Number.isFinite(requestedOffset);
  const detailsStoreLimit = detailsPaginated ? pageLimit : 2000;
  const detailsStoreOffset = detailsPaginated ? pageOffset : 0;
  const detailsPromotionLimit = detailsPaginated ? pageLimit : 3000;

  const [{ stores, tileCount }, promotionCounts, promotions, retailerDealCounts] =
    await Promise.all([
      readAllDiscoveredStores(
        env,
        nowIso,
        detailsStoreLimit,
        country.code,
        detailsStoreOffset,
      ),
      readPromotionCountsByPlace(env, nowIso, country.code),
      readAllStorePromotions(
        env,
        nowIso,
        detailsPromotionLimit,
        country.code,
      ),
      readRetailerDealCounts(env, nowIso),
    ]);

  const enriched = keepStoresNear(
    attachPromotionDetails(
      stores,
      promotionCounts,
      promotions,
      retailerDealCounts,
    ),
    origin,
    radiusKm,
  );

  const response = json(
    {
      country,
      stores: enriched,
      summary: {
        areaCount: tileCount,
        knownChainCount: enriched.filter((store) => store.retailerId).length,
        // Absent when nothing was filtered, so the page can tell "everything
        // near you" apart from "everything we know".
        nearRadiusKm: origin ? radiusKm : undefined,
        storeCount: enriched.length,
        withPromotionsCount: enriched.filter((store) => store.hasPromotions)
          .length,
      },
    },
    { headers: privateHeaders },
  );

  return cacheResponse(response);

  function cacheResponse(value: Response) {
    if (!edgeCache) return value;
    const publicResponse = new Response(value.body, value);
    publicResponse.headers.set(
      "cache-control",
      `public, max-age=60, s-maxage=${EDGE_CACHE_SECONDS}`,
    );
    waitUntil(
      edgeCache
        .put(edgeCacheKey, publicResponse.clone())
        .catch(() => undefined),
    );
    return publicResponse;
  }
};

// The Cache API is absent in unit tests and some local runtimes — treat it
// as an optional accelerator, never a requirement.
async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === "undefined" ? undefined : caches.default;
  } catch {
    return undefined;
  }
}
