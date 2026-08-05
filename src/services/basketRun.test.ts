import { describe, expect, it } from "vitest";
import type { Basket, BasketItem, SavedDeal } from "../types";
import { buildBasketStoreStops, formatBasketShareText } from "./basketRun";

function deal(id: string, retailerId: string, retailerName: string): SavedDeal {
  return {
    capturedAt: "2026-08-01T10:00:00.000Z",
    evidenceText: id,
    id,
    productUrl: `https://example.test/${id}`,
    retailerId: retailerId as SavedDeal["retailerId"],
    retailerName,
    savedAt: "2026-08-01T10:00:00.000Z",
    sourceLabel: "Weekly offers",
    sourceUrl: `https://example.test/${retailerId}`,
    title: id,
  };
}

function item(
  id: string,
  retailerId: string,
  retailerName: string,
  quantity: number,
  linePriceCents?: number,
  lineSavingCents?: number,
): BasketItem {
  return {
    addedAt: "2026-08-01T10:00:00.000Z",
    deal: deal(`deal-${id}`, retailerId, retailerName),
    id,
    linePriceCents,
    lineSavingCents,
    quantity,
    savedDealId: `saved-${id}`,
    updatedAt: "2026-08-01T10:00:00.000Z",
  };
}

describe("buildBasketStoreStops", () => {
  it("groups quantities and source-backed totals by retailer", () => {
    const basket: Basket = {
      items: [
        item("bread", "shoprite", "Shoprite", 2, 4000, 600),
        item("milk", "checkers", "Checkers", 1, 2300, 200),
        item("eggs", "shoprite", "Shoprite", 1),
      ],
      summary: {
        itemCount: 4,
        knownPriceItemCount: 3,
        savingsCents: 800,
        totalCents: 6300,
      },
    };

    expect(buildBasketStoreStops(basket)).toEqual([
      expect.objectContaining({
        itemCount: 1,
        knownPriceItemCount: 1,
        retailerId: "checkers",
        savingsCents: 200,
        totalCents: 2300,
      }),
      expect.objectContaining({
        itemCount: 3,
        knownPriceItemCount: 2,
        retailerId: "shoprite",
        savingsCents: 600,
        totalCents: 4000,
      }),
    ]);
  });

  it("formats a shareable list with store stops, links, and honest totals", () => {
    const basket: Basket = {
      items: [
        item("bread", "shoprite", "Shoprite", 2, 4000, 600),
        item("eggs", "shoprite", "Shoprite", 1),
      ],
      summary: {
        itemCount: 3,
        knownPriceItemCount: 2,
        savingsCents: 600,
        totalCents: 4000,
      },
    };

    const text = formatBasketShareText(basket, (cents) => `R${(cents / 100).toFixed(2)}`);

    expect(text).toContain("1. Shoprite (R40.00 known subtotal)");
    expect(text).toContain("• 2 × deal-bread: R40.00");
    expect(text).toContain("https://example.test/deal-bread");
    expect(text).toContain("• 1 × deal-eggs: price not found");
    expect(text).toContain("Savings found: R6.00");
  });
});
