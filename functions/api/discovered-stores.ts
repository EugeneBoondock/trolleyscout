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

export function attachPromotionDetails(
  stores: DiscoveredStore[],
  promotionCounts: Map<string, number>,
  promotions: StorePromotion[],
) {
  const promotionsByPlace = new Map<string, StorePromotion[]>();

  for (const promotion of promotions) {
    const storePromotions = promotionsByPlace.get(promotion.placeId) ?? [];
    storePromotions.push(promotion);
    promotionsByPlace.set(promotion.placeId, storePromotions);
  }

  return stores.map((store) => {
    const promotionCount = promotionCounts.get(store.placeId) ?? 0;

    return {
      ...store,
      deals: [],
      hasPromotions: promotionCount > 0,
      leaflets: [],
      logoUrl: nearbyStoreLogoUrl(store),
      promotionCount,
      promotions: prioritizePromotionDetails(
        promotionsByPlace.get(store.placeId) ?? [],
      ),
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

  const [{ stores, tileCount }, promotionCounts, promotions] =
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
    ]);

  const enriched = attachPromotionDetails(stores, promotionCounts, promotions);

  const response = json(
    {
      country,
      stores: enriched,
      summary: {
        areaCount: tileCount,
        knownChainCount: enriched.filter((store) => store.retailerId).length,
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
