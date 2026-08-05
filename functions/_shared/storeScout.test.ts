// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_COMMON_COMMERCE_PAGE_SIZE } from '../../src/services/commonCommerceDeals'
import type { NearbyStore } from '../../src/services/nearbyStores'
import type { TrolleyScoutEnv } from './env'
import * as storeScoutModule from './storeScout'
import {
  extractOfficialLeaflets,
  extractPromotionDetailUrls,
  extractPublicStoreDeals,
  parseFoodWorldProducts,
  parseFourHarvestsDeals,
  parseGetMoreSpecialProducts,
  parseSparZimbabweProducts,
  parseTeloneProducts,
  parseTillPointProducts,
  scoutNearbyStores,
} from './storeScout'

describe('parseFirstClassGroceriesProducts', () => {
  it('reads purchasable products from the public Hostinger shop API', () => {
    const parseFirstClassGroceriesProducts = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseFirstClassGroceriesProducts as
      | ((payload: unknown) => Array<Record<string, unknown>>)
      | undefined

    expect(parseFirstClassGroceriesProducts).toBeTypeOf('function')
    if (!parseFirstClassGroceriesProducts) return

    expect(parseFirstClassGroceriesProducts({
      count: 3,
      products: [
        {
          id: 'prod_oil',
          is_available: true,
          purchasable: true,
          ribbon_text: 'On Sale',
          thumbnail: 'https://cdn.example.com/oil.png',
          title: "D'lite Pure Cooking Oil 2L",
          variants: [{
            is_available: true,
            prices: [{
              amount: 500,
              currency_code: 'zwl',
              sale_amount: 450,
            }],
          }],
        },
        {
          id: 'prod_rice',
          is_available: false,
          purchasable: true,
          ribbon_text: 'Best Seller',
          title: 'Tastic Rice 2kg',
          variants: [{
            is_available: false,
            prices: [{ amount: 300, currency_code: 'usd' }],
          }],
        },
        {
          id: 'hidden',
          purchasable: false,
          title: 'Hidden product',
          variants: [{
            prices: [{ amount: 100, currency_code: 'usd' }],
          }],
        },
      ],
    })).toEqual([
      {
        currencyCode: 'USD',
        imageUrl: 'https://cdn.example.com/oil.png',
        previousPriceCents: 500,
        priceCents: 450,
        productUrl: 'https://www.firstclassgroceries.com/product/prod_oil',
        promoLabel: 'On Sale',
        soldOut: false,
        title: "D'lite Pure Cooking Oil 2L",
      },
      {
        currencyCode: 'USD',
        imageUrl: undefined,
        previousPriceCents: undefined,
        priceCents: 300,
        productUrl: 'https://www.firstclassgroceries.com/product/prod_rice',
        promoLabel: 'Best Seller',
        soldOut: true,
        title: 'Tastic Rice 2kg',
      },
    ])
  })
})

describe('parseBulkBarrelProducts', () => {
  it('reads every visible card from the public wholesale catalogue', () => {
    const parseBulkBarrelProducts = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseBulkBarrelProducts as
      | ((html: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseBulkBarrelProducts).toBeTypeOf('function')
    if (!parseBulkBarrelProducts) return

    expect(parseBulkBarrelProducts(`
      <div class="container" id="Groceries">
        <div class="card">
          <img src="img/mazoe.jpg" alt="Mazoe Orange Crush 6*2l">
          <h3>Mazoe Orange Crush 6*2l</h3>
          <p>$21.60</p>
        </div>
        <div class="card">
          <img data-src="/bulk-barrel/img/sunlight.jpg" alt="Sunlight">
          <h3>Sunlight liquid 25*750ml</h3>
          <p>$60</p>
        </div>
      </div>
    `)).toEqual([
      {
        currencyCode: 'USD',
        imageUrl:
          'https://bulkbmarketing-ux.github.io/bulk-barrel/img/mazoe.jpg',
        priceCents: 2160,
        productUrl: 'https://bulkbmarketing-ux.github.io/bulk-barrel/',
        promoLabel: 'Bulk & Barrel catalogue',
        soldOut: false,
        title: 'Mazoe Orange Crush 6*2l',
      },
      {
        currencyCode: 'USD',
        imageUrl:
          'https://bulkbmarketing-ux.github.io/bulk-barrel/img/sunlight.jpg',
        priceCents: 6000,
        productUrl: 'https://bulkbmarketing-ux.github.io/bulk-barrel/',
        promoLabel: 'Bulk & Barrel catalogue',
        soldOut: false,
        title: 'Sunlight liquid 25*750ml',
      },
    ])
  })
})

describe('parseWatumiraHereOffers', () => {
  it('reads the public from-price grocery and hardware offers', () => {
    const parseWatumiraHereOffers = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseWatumiraHereOffers as
      | ((html: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseWatumiraHereOffers).toBeTypeOf('function')
    if (!parseWatumiraHereOffers) return

    expect(parseWatumiraHereOffers(`
      <section>
        <h3>Hampers for Every Budget</h3>
        <p>
          Choose ready-made grocery hampers from as low as R550, or build your
          own custom package.
        </p>
      </section>
      <section>
        <h3>Affordable Construction Supplies</h3>
        <p>
          Get the best prices on trusted brands like PPC, Superset &amp;
          Surecast – starting from R205.
        </p>
      </section>
    `)).toEqual([
      {
        currencyCode: 'ZAR',
        imageUrl: undefined,
        priceCents: 55000,
        productUrl: 'https://www.watumirahere.co.za/',
        promoLabel: 'From R550',
        soldOut: false,
        title: 'Grocery hampers',
      },
      {
        currencyCode: 'ZAR',
        imageUrl: undefined,
        priceCents: 20500,
        productUrl: 'https://www.watumirahere.co.za/',
        promoLabel: 'From R205',
        soldOut: false,
        title: 'Hardware supplies',
      },
    ])
  })
})

describe('parseZimZoneSpecials', () => {
  it('reads discounted products from Zim-Zone’s public specials page', () => {
    const parseZimZoneSpecials = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseZimZoneSpecials as
      | ((html: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseZimZoneSpecials).toBeTypeOf('function')
    if (!parseZimZoneSpecials) return

    expect(parseZimZoneSpecials(`
      <div class="product-item sevenspikes-ajaxcart" data-productid="2266">
        <div class="ribbon-wrapper">
          <div class="picture">
            <a href="/knorr-cream-of-mushroom-soup-10x50g">
              <img
                src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
                data-lazyloadsrc="https://zim-zone.co.uk/images/thumbs/knorr.jpeg"
                class="picture-img"
              >
            </a>
          </div>
          <a href="/knorr-cream-of-mushroom-soup-10x50g">
            <label class="ribbon-text">24% OFF</label>
          </a>
        </div>
        <div class="details">
          <h2 class="product-title">
            <a href="/knorr-cream-of-mushroom-soup-10x50g">
              KNORR CREAM OF MUSHROOM SOUP 10x50g
            </a>
          </h2>
          <div class="prices">
            <span class="price old-price">R97,43</span>
            <span class="price actual-price">R74,05</span>
          </div>
          <button class="product-box-add-to-cart-button">Add to cart</button>
        </div>
      </div>
      <div class="product-item sevenspikes-ajaxcart" data-productid="sold-out">
        <div class="picture">
          <img data-lazyloadsrc="/images/thumbs/rice.jpeg">
        </div>
        <h2 class="product-title">
          <a href="/mahatma-white-rice-2kg">Mahatma White Rice 2kg</a>
        </h2>
        <div class="prices">
          <span class="price actual-price">R39,81</span>
        </div>
        <span>Out of stock</span>
      </div>
    `)).toEqual([
      {
        currencyCode: 'ZAR',
        imageUrl: 'https://zim-zone.co.uk/images/thumbs/knorr.jpeg',
        previousPriceCents: 9743,
        priceCents: 7405,
        productUrl:
          'https://zim-zone.co.uk/knorr-cream-of-mushroom-soup-10x50g',
        promoLabel: '24% OFF',
        soldOut: false,
        title: 'KNORR CREAM OF MUSHROOM SOUP 10x50g',
      },
      {
        currencyCode: 'ZAR',
        imageUrl: 'https://zim-zone.co.uk/images/thumbs/rice.jpeg',
        previousPriceCents: undefined,
        priceCents: 3981,
        productUrl: 'https://zim-zone.co.uk/mahatma-white-rice-2kg',
        promoLabel: 'Zim-Zone specials',
        soldOut: true,
        title: 'Mahatma White Rice 2kg',
      },
    ])
  })
})

describe('parseKambudziSpecials', () => {
  it('keeps real discounted products from Kambudzi’s public search results', () => {
    const parseKambudziSpecials = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseKambudziSpecials as
      | ((html: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseKambudziSpecials).toBeTypeOf('function')
    if (!parseKambudziSpecials) return

    expect(parseKambudziSpecials(`
      <div class="product-item" data-productid="35501">
        <img data-lazyloadsrc="/images/thumbs/tastic-rice.jpeg">
        <h2 class="product-title">
          <a href="/tastic-rice-parboiled-2kg-2">TASTIC RICE PARBOILED 2KG</a>
        </h2>
        <div class="prices">
          <span class="price old-price">R81,06</span>
          <span class="price actual-price">R72,95</span>
        </div>
      </div>
      <div class="product-item" data-productid="regular">
        <h2 class="product-title">
          <a href="/regular-rice">REGULAR RICE</a>
        </h2>
        <div class="prices">
          <span class="price old-price">R50,00</span>
          <span class="price actual-price">R50,00</span>
        </div>
      </div>
    `)).toEqual([
      {
        currencyCode: 'ZAR',
        imageUrl: 'https://kambudzi.com/images/thumbs/tastic-rice.jpeg',
        previousPriceCents: 8106,
        priceCents: 7295,
        productUrl: 'https://kambudzi.com/tastic-rice-parboiled-2kg-2',
        promoLabel: '10% OFF',
        soldOut: false,
        title: 'TASTIC RICE PARBOILED 2KG',
      },
    ])
  })
})
describe('parseHelloKumbaProducts', () => {
  it('reads active grocery products from the public Hyperzod catalogue', () => {
    const parseHelloKumbaProducts = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseHelloKumbaProducts as
      | ((payload: unknown, merchantId: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseHelloKumbaProducts).toBeTypeOf('function')
    if (!parseHelloKumbaProducts) return

    expect(parseHelloKumbaProducts({
      success: true,
      data: {
        data: [
          {
            id: '6a5cef25c4af71b874015621',
            in_stock: true,
            name: 'COOKMORE COOKING OIL 2L',
            price: 62.9,
            price_currency: 'ZAR',
            price_sell_compare: 64.9,
            product_images: [{
              file_url:
                'https://cdn-upload.hyperzod.app/public/4729/images/oil.png',
              is_cover: true,
            }],
            status: true,
          },
          {
            id: 'hidden-product',
            in_stock: true,
            name: 'Hidden product',
            price: 5,
            price_currency: 'ZAR',
            status: false,
          },
          {
            id: 'sold-out-rice',
            in_stock: false,
            name: 'MARIANA RICE 5KG',
            price: 104.9,
            price_currency: 'ZAR',
            status: true,
          },
        ],
      },
    }, '67bb1fd97dcc40153a0c8ff3')).toEqual([
      {
        currencyCode: 'ZAR',
        imageUrl:
          'https://cdn-upload.hyperzod.app/public/4729/images/oil.png',
        previousPriceCents: 6490,
        priceCents: 6290,
        productUrl:
          'https://order.hellokumba.com/m/hellokumba-kwese/67bb1fd97dcc40153a0c8ff3/product/6a5cef25c4af71b874015621',
        promoLabel: 'Hello Kumba online catalogue',
        soldOut: false,
        title: 'COOKMORE COOKING OIL 2L',
      },
      {
        currencyCode: 'ZAR',
        imageUrl: undefined,
        priceCents: 10490,
        productUrl:
          'https://order.hellokumba.com/m/hellokumba-kwese/67bb1fd97dcc40153a0c8ff3/product/sold-out-rice',
        promoLabel: 'Hello Kumba online catalogue',
        soldOut: true,
        title: 'MARIANA RICE 5KG',
      },
    ])
  })
})

describe('parseTengaiProducts', () => {
  it('reads regular and discounted products from Tengai’s server-rendered shop', () => {
    const parseTengaiProducts = (
      storeScoutModule as unknown as Record<string, unknown>
    ).parseTengaiProducts as
      | ((html: string) => Array<Record<string, unknown>>)
      | undefined

    expect(parseTengaiProducts).toBeTypeOf('function')
    if (!parseTengaiProducts) return

    expect(parseTengaiProducts(`
      <div class="wd-product product-grid-item product type-product instock" data-id="18385">
        <a href="https://tengaionline.com/?product=happy-day-diapers"
           class="wd-product-img-link">
          <img src="https://i0.wp.com/tengaionline.com/diapers.png?resize=600%2C600&amp;ssl=1">
        </a>
        <h3 class="wd-entities-title">
          <a href="https://tengaionline.com/?product=happy-day-diapers">
            Happy Day Baby Diapers
          </a>
        </h3>
        <span class="price">
          <span class="woocommerce-Price-amount"><bdi><span>£</span>5.05</bdi></span>
        </span>
      </div>
      <div class="wd-product product-grid-item product type-product outofstock sale" data-id="200">
        <a href="https://tengaionline.com/?product=tea-bags" class="wd-product-img-link">
          <img data-src="/wp-content/uploads/tea.png">
        </a>
        <h3 class="wd-entities-title">
          <a href="https://tengaionline.com/?product=tea-bags">Tea Bags 100s</a>
        </h3>
        <span class="price">
          <del><span class="woocommerce-Price-amount"><bdi><span>£</span>6.00</bdi></span></del>
          <ins><span class="woocommerce-Price-amount"><bdi><span>£</span>4.50</bdi></span></ins>
        </span>
      </div>
    `)).toEqual([
      {
        currencyCode: 'GBP',
        imageUrl:
          'https://i0.wp.com/tengaionline.com/diapers.png?resize=600%2C600&ssl=1',
        previousPriceCents: undefined,
        priceCents: 505,
        productUrl: 'https://tengaionline.com/?product=happy-day-diapers',
        promoLabel: 'Tengai Online catalogue',
        soldOut: false,
        title: 'Happy Day Baby Diapers',
      },
      {
        currencyCode: 'GBP',
        imageUrl: 'https://tengaionline.com/wp-content/uploads/tea.png',
        previousPriceCents: 600,
        priceCents: 450,
        productUrl: 'https://tengaionline.com/?product=tea-bags',
        promoLabel: 'Tengai Online catalogue',
        soldOut: true,
        title: 'Tea Bags 100s',
      },
    ])
  })
})

describe('parseFourHarvestsDeals', () => {
  it('reads server-rendered WooCommerce sale cards with old and current prices', () => {
    expect(parseFourHarvestsDeals(`
      <div class="product type-product post-2092 sale">
        <div class="thumbnail-wrapper">
          <a href="https://www.4harvests.co.zw/product/koo-baked-beans/">
            <img src="/wp-content/uploads/koo-beans.png" alt="Koo Baked Beans">
          </a>
        </div>
        <h3 class="product-title">
          <a href="https://www.4harvests.co.zw/product/koo-baked-beans/">
            Koo Baked Beans
          </a>
        </h3>
        <span class="price">
          <del><span><bdi><span>$</span>3.36</bdi></span></del>
          <ins><span><bdi><span>$</span>2.34</bdi></span></ins>
        </span>
      </div>
    `)).toEqual([{
      currencyCode: 'USD',
      imageUrl: 'https://www.4harvests.co.zw/wp-content/uploads/koo-beans.png',
      previousPriceCents: 336,
      priceCents: 234,
      productUrl: 'https://www.4harvests.co.zw/product/koo-baked-beans/',
      promoLabel: '4 Harvests sale',
      soldOut: false,
      title: 'Koo Baked Beans',
    }])
  })

  it('ignores regular-price cards and off-site product links', () => {
    expect(parseFourHarvestsDeals(`
      <div class="product type-product">
        <h3 class="product-title">
          <a href="https://www.4harvests.co.zw/product/regular/">Regular</a>
        </h3>
        <span class="price">$2.00</span>
      </div>
      <div class="product type-product sale">
        <h3 class="product-title">
          <a href="https://example.com/other">Other</a>
        </h3>
        <del>$3.00</del><ins>$2.00</ins>
      </div>
    `)).toEqual([])
  })
})

describe('parseTillPointProducts', () => {
  it('reads regular and discounted products from the public catalogue table', () => {
    expect(parseTillPointProducts([
      {
        compare_at_price: 60,
        currency: 'USD',
        images: [],
        is_available: true,
        name: 'Portable Cordless Pressure Washer',
        price: 49.99,
        slug: 'portable-cordless-pressure-washer',
        stock_quantity: 10,
        thumbnail:
          'https://example.supabase.co/storage/v1/object/public/products/washer.jpg',
      },
      {
        currency: 'USD',
        is_available: true,
        name: 'Peanut Butter',
        price: 1,
        slug: 'peanut-butter',
        stock_quantity: 0,
      },
    ])).toEqual([
      {
        currencyCode: 'USD',
        imageUrl:
          'https://example.supabase.co/storage/v1/object/public/products/washer.jpg',
        previousPriceCents: 6000,
        priceCents: 4999,
        productUrl:
          'https://tillpoint.co.zw/p/portable-cordless-pressure-washer',
        promoLabel: 'TillPoint online catalogue',
        soldOut: false,
        title: 'Portable Cordless Pressure Washer',
      },
      {
        currencyCode: 'USD',
        imageUrl: undefined,
        previousPriceCents: undefined,
        priceCents: 100,
        productUrl: 'https://tillpoint.co.zw/p/peanut-butter',
        promoLabel: 'TillPoint online catalogue',
        soldOut: true,
        title: 'Peanut Butter',
      },
    ])
  })

  it('ignores hidden, malformed, and zero-priced rows', () => {
    expect(parseTillPointProducts([
      {
        is_available: false,
        name: 'Hidden item',
        price: 2,
        slug: 'hidden',
      },
      { is_available: true, name: 'Free item', price: 0, slug: 'free' },
      { is_available: true, name: 'No URL', price: 2 },
    ])).toEqual([])
  })
})

describe('parseGetMoreSpecialProducts', () => {
  it('reads product cards from the official Magento specials category', () => {
    expect(parseGetMoreSpecialProducts(`
      <li class="item product product-item">
        <div class="product-item-info">
          <img class="product-image-photo"
               data-src="/media/catalog/product/porridge.jpg">
          <strong class="product name product-item-name">
            <a class="product-item-link"
               href="https://getmore.co.zw/eden-porridge.html">
              EDEN Instant Porridge Original 1kg
            </a>
          </strong>
          <span data-price-amount="1.651651"
                data-price-type="finalPrice"
                class="price-wrapper"><span class="price">$1.65</span></span>
        </div>
      </li>
    `)).toEqual([{
      currencyCode: 'USD',
      imageUrl: 'https://getmore.co.zw/media/catalog/product/porridge.jpg',
      previousPriceCents: undefined,
      priceCents: 165,
      productUrl: 'https://getmore.co.zw/eden-porridge.html',
      promoLabel: 'GetMore special offers',
      title: 'EDEN Instant Porridge Original 1kg',
    }])
  })

  it('rejects off-site links, missing prices, and duplicate cards', () => {
    const card = `
      <li class="product-item">
        <a class="product-item-link"
           href="https://getmore.co.zw/rice.html">Rice 2kg</a>
        <span data-price-amount="4.50" data-price-type="finalPrice"></span>
      </li>
    `
    expect(parseGetMoreSpecialProducts(`
      <li class="product-item">
        <a class="product-item-link" href="https://example.com/item">Other</a>
        <span data-price-amount="2" data-price-type="finalPrice"></span>
      </li>
      <li class="product-item">
        <a class="product-item-link" href="/missing.html">Missing</a>
      </li>
      ${card}
      ${card}
    `)).toHaveLength(1)
  })
})

describe('parseFoodWorldProducts', () => {
  it('reads regular and discounted products from the public WooCommerce catalogue', () => {
    expect(parseFoodWorldProducts([
      {
        id: 21812,
        images: [{ src: 'https://www.foodworld.co.zw/wp-content/uploads/cream.jpg' }],
        is_in_stock: true,
        name: 'CLOVER DAIRY CREAM UHT 500ML',
        permalink: 'https://www.foodworld.co.zw/product/clover-dairy-cream-uht-500ml/',
        prices: {
          currency_code: 'USD',
          currency_minor_unit: 2,
          price: '535',
          regular_price: '535',
        },
      },
      {
        id: 22,
        is_in_stock: false,
        name: 'Discounted rice',
        prices: {
          currency_code: 'USD',
          currency_minor_unit: 2,
          price: '250',
          regular_price: '300',
        },
        slug: 'discounted-rice',
      },
    ])).toEqual([
      {
        currencyCode: 'USD',
        imageUrl: 'https://www.foodworld.co.zw/wp-content/uploads/cream.jpg',
        priceCents: 535,
        productUrl:
          'https://www.foodworld.co.zw/product/clover-dairy-cream-uht-500ml/',
        promoLabel: 'Food World online catalogue',
        soldOut: false,
        title: 'CLOVER DAIRY CREAM UHT 500ML',
      },
      {
        currencyCode: 'USD',
        imageUrl: undefined,
        previousPriceCents: 300,
        priceCents: 250,
        productUrl: 'https://foodworld.co.zw/product/discounted-rice/',
        promoLabel: 'Food World online catalogue',
        soldOut: true,
        title: 'Discounted rice',
      },
    ])
  })

  it('ignores zero-priced and malformed catalogue rows', () => {
    expect(parseFoodWorldProducts([
      {
        name: 'Price pending',
        permalink: 'https://www.foodworld.co.zw/product/price-pending/',
        prices: { currency_minor_unit: 2, price: '0' },
      },
      { name: 'No URL', prices: { currency_minor_unit: 2, price: '250' } },
    ])).toEqual([])
  })

  it('uses the verified origin and label for another Zimbabwe WooCommerce shop', () => {
    expect(parseFoodWorldProducts(
      [{
        name: 'Roller meal 20kg',
        prices: {
          currency_code: 'USD',
          currency_minor_unit: 2,
          price: '1026',
          regular_price: '1026',
        },
        slug: 'roller-meal-20kg',
      }],
      'https://greensonline.co.zw',
      'Greens online catalogue',
    )[0]).toMatchObject({
      priceCents: 1026,
      productUrl: 'https://greensonline.co.zw/product/roller-meal-20kg/',
      promoLabel: 'Greens online catalogue',
    })
  })
})

describe('parseSparZimbabweProducts', () => {
  it('reads the server-rendered Zimbabwe catalogue with USD prices and images', () => {
    expect(parseSparZimbabweProducts(`
      <div class="listing grid-listing product-listing">
        <ul>
          <li>
            <div class="listing-image">
              <a
                id="Content_List_Photo_0"
                href="/products/2996/mazoe-orange-crush-original-2l"
                style="background-image:url(https://cdn.spar.co.zw/data/2996-Thumb.jpg);"
              ></a>
            </div>
            <div class="listing-details">
              <p>MAZOE ORANGE CRUSH ORIGINAL 2L</p>
            </div>
            <div class="product-links">
              <div><strong>USD&#36;4.00</strong></div>
            </div>
          </li>
        </ul>
      </div>
    `)).toEqual([{
      currencyCode: 'USD',
      imageUrl: 'https://cdn.spar.co.zw/data/2996-Thumb.jpg',
      priceCents: 400,
      productUrl: 'https://www.spar.co.zw/products/2996/mazoe-orange-crush-original-2l',
      promoLabel: 'SPAR Zimbabwe online catalogue',
      title: 'MAZOE ORANGE CRUSH ORIGINAL 2L',
    }])
  })

  it('ignores navigation links, malformed prices, and duplicate product rows', () => {
    const product = `
      <li>
        <div class="listing-image">
          <a id="Content_List_Photo_2" href="/products/7/rice"
            style="background-image:url(https://cdn.spar.co.zw/data/7-Thumb.jpg);"></a>
        </div>
        <div class="listing-details"><p>Rice 2kg</p></div>
        <div class="product-links"><strong>USD&#36;2.50</strong></div>
      </li>
    `

    expect(parseSparZimbabweProducts(`
      <a href="/products/department/1/groceries">Groceries</a>
      <li>
        <div class="listing-image">
          <a id="Content_List_Photo_1" href="/products/8/flour"></a>
        </div>
        <div class="listing-details"><p>Flour 2kg</p></div>
        <div class="product-links"><strong>Price on request</strong></div>
      </li>
      ${product}
      ${product}
    `)).toHaveLength(1)
  })
})

describe('parseTeloneProducts', () => {
  it('reads the public TelOne shop API with USD prices and stock state', () => {
    expect(parseTeloneProducts([
      {
        active: true,
        id: 3,
        imageUrl:
          'https://springapi.telone.co.zw/digitalShop/api/v1/product-line/downloadFile/3.png',
        name: 'TP LINK ADSL Router',
        price: 35,
        productItemTotal: 0,
      },
    ])).toEqual([{
      currencyCode: 'USD',
      imageUrl:
        'https://springapi.telone.co.zw/digitalShop/api/v1/product-line/downloadFile/3.png',
      priceCents: 3500,
      productUrl: 'https://shop.telone.co.zw/product/3',
      promoLabel: 'TelOne Digital Shop',
      soldOut: true,
      title: 'TP LINK ADSL Router',
    }])
  })
})

describe('extractPublicStoreDeals', () => {
  it('finds bounded same-site promotion detail pages', () => {
    const html = `
      <a href="/monday-magic/">View specials</a>
      <a href="/privacy.pdf">Privacy policy</a>
      <a href="https://catalogue-copy.test/deals">Weekly deals</a>
      <a href="/monday-magic/">View specials again</a>
      <a href="/weekend-offers/">Weekend offers</a>
      <a href="/month-end/">Month end deals</a>
    `

    expect(
      extractPromotionDetailUrls(
        html,
        'https://choppies.co.bw/specials-promotions/',
        'https://choppies.co.bw',
        2,
      ),
    ).toEqual([
      'https://choppies.co.bw/monday-magic/',
      'https://choppies.co.bw/weekend-offers/',
    ])
  })

  it('reads source-backed JSON-LD Product and Offer records with images', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Tastic Rice 2kg",
          "image": ["https://store.test/rice.jpg"],
          "url": "/products/rice",
          "offers": {
            "@type": "Offer",
            "price": "29.99",
            "priceCurrency": "ZAR",
            "priceValidUntil": "2026-07-31"
          }
        }
      </script>`

    expect(
      extractPublicStoreDeals(
        {
          lat: -26.1,
          lon: 28.05,
          name: 'Example Market',
          placeId: 'example-market',
          website: 'https://store.test/',
        },
        html,
        'https://store.test/specials',
        Date.parse('2026-07-16T10:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://store.test/rice.jpg',
        kind: 'deal',
        priceText: 'R29.99',
        productUrl: 'https://store.test/products/rice',
        sourceUrl: 'https://store.test/specials',
        title: 'Tastic Rice 2kg',
        validTo: '2026-07-31',
      }),
    ])
  })

  it('removes duplicate public offers from repeated structured data', () => {
    const product = {
      '@type': 'Product',
      name: 'Milk 2L',
      offers: {
        '@type': 'Offer',
        price: 34.99,
        priceCurrency: 'ZAR',
        priceValidUntil: '2026-07-31',
      },
      url: 'https://store.test/milk',
    }
    const html = `<script type="application/ld+json">${JSON.stringify([product, product])}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
        html,
        'https://store.test/deals',
        0,
      ),
    ).toHaveLength(1)
  })

  it('reads bounded embedded product state and keeps explicit promotion evidence', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"items":[{
          "name":"Sunfoil Oil 2L",
          "currentPrice":49.99,
          "regularPrice":69.99,
          "promotionId":"promo-123",
          "image":"/oil.jpg",
          "url":"/products/oil",
          "validFrom":"2026-07-15",
          "validTo":"2026-07-21"
        }]}}}
      </script>
      <script>
        window.__INITIAL_STATE__ = {"promotions":[{
          "title":"Five Roses Tea 100s",
          "salePrice":79.99,
          "listPrice":99.99,
          "discountAmount":20,
          "imageUrl":"/tea.jpg",
          "productUrl":"/products/tea"
        }]};
      </script>`

    const deals = extractPublicStoreDeals(
      {
        lat: -26.1,
        lon: 28.05,
        name: 'Example Market',
        placeId: 'example-market',
        retailerId: 'spar',
      },
      html,
      'https://store.test/products',
      Date.parse('2026-07-16T10:00:00.000Z'),
    )

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://store.test/oil.jpg',
          previousPriceText: 'R69.99',
          priceText: 'R49.99',
          retailerId: 'spar',
          savingText: 'Save R20.00',
          title: 'Sunfoil Oil 2L',
          validFrom: '2026-07-15',
          validTo: '2026-07-21',
        }),
        expect.objectContaining({
          previousPriceText: 'R99.99',
          priceText: 'R79.99',
          savingText: 'Save R20.00',
          title: 'Five Roses Tea 100s',
        }),
      ]),
    )
  })

  it('reads Nuxt state and generic JSON scripts recursively', () => {
    const html = `
      <script>window.__NUXT__={"data":[{"offers":[{
        "name":"Cremora 750g","price":64.99,"oldPrice":84.99,"promotionText":"Weekly deal"
      }]}]};</script>
      <script type="application/json">{"payload":{"products":[{
        "name":"Nola Mayo 750g","specialPrice":39.99,"wasPrice":54.99,"promoId":"nola-weekly"
      }]}}</script>`

    const deals = extractPublicStoreDeals(
      { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
      html,
      'https://store.test/products',
      0,
    )

    expect(deals.map((deal) => deal.title)).toEqual(['Cremora 750g', 'Nola Mayo 750g'])
  })

  it('reads visible schema product cards when a supermarket has no JSON feed', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <a href="/products/maize" itemprop="url">
          <img itemprop="image" src="/images/maize.jpg" alt="Iwisa Maize Meal 5kg">
          <h3 itemprop="name">Iwisa Maize Meal 5kg</h3>
        </a>
        <span class="was-price">Was R89.99</span>
        <meta itemprop="priceCurrency" content="ZAR">
        <span class="sale-price" itemprop="price" content="69.99">R69.99</span>
        <strong class="promo-badge">Save R20</strong>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        Date.parse('2026-07-16T10:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://local.test/images/maize.jpg',
        previousPriceText: 'R89.99',
        priceText: 'R69.99',
        productUrl: 'https://local.test/products/maize',
        title: 'Iwisa Maize Meal 5kg',
      }),
    ])
  })

  it('marks embedded products sold out when every stated variant is unavailable', () => {
    const html = `<script type="application/json">${JSON.stringify({
      products: [{
        compareAtPrice: 1_899,
        name: 'Bathu Mesh Edition',
        price: 1_299,
        promotionId: 'mesh-sale',
        url: '/products/mesh-edition',
        variants: [
          { available: false, title: 'Size 6' },
          { available: false, title: 'Size 7' },
        ],
      }],
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Bathu', placeId: 'bathu-online' },
        html,
        'https://www.bathu.co.za/collections/sale',
        0,
      )[0],
    ).toMatchObject({
      soldOut: true,
      title: 'Bathu Mesh Edition',
    })
  })

  it('keeps an embedded product available when one variant can still be bought', () => {
    const html = `<script type="application/json">${JSON.stringify({
      products: [{
        compareAtPrice: 1_899,
        name: 'Bathu Mesh Edition',
        price: 1_299,
        promotionId: 'mesh-sale',
        variants: [
          { available: false, title: 'Size 6' },
          { available: true, title: 'Size 7' },
        ],
      }],
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Bathu', placeId: 'bathu-online' },
        html,
        'https://www.bathu.co.za/collections/sale',
        0,
      )[0]?.soldOut,
    ).toBeUndefined()
  })

  it('reads a sold-out label from within a visible product card', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <a href="/products/maize" itemprop="url">
          <h3 itemprop="name">Iwisa Maize Meal 5kg</h3>
        </a>
        <span class="was-price">Was R89.99</span>
        <span class="sale-price" itemprop="price" content="69.99">R69.99</span>
        <button disabled>Sold out</button>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        0,
      )[0],
    ).toMatchObject({
      soldOut: true,
      title: 'Iwisa Maize Meal 5kg',
    })
  })

  it('does not confuse a general availability note with sold-out stock', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <h3 itemprop="name">Iwisa Maize Meal 5kg</h3>
        <span class="was-price">Was R89.99</span>
        <span class="sale-price" itemprop="price" content="69.99">R69.99</span>
        <small>Subject to availability</small>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        0,
      )[0]?.soldOut,
    ).toBeUndefined()
  })

  it('does not treat a visible ordinary-price card as a deal on a general page', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <h3 itemprop="name">Everyday Sugar 2kg</h3>
        <span itemprop="price" content="44.99">R44.99</span>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/products',
        0,
      ),
    ).toEqual([])
  })

  it('reads official network plan cards without requiring a struck-through price', () => {
    const html = `
      <section class="mobile-plan-card">
        <img src="/images/unlimited-mobile.webp" alt="Unlimited mobile">
        <h3>Unlimited mobile</h3>
        <p>Unlimited calls and data</p>
        <p>from <strong>R595</strong> month-to-month</p>
        <a href="/plans/unlimited-mobile">Explore plan</a>
      </section>
      <article class="deal-card">
        <h3>Double deals Oppo A6 bundle</h3>
        <p>2GB Anytime Data and 75 All-Net Minutes</p>
        <span class="deal-price">R799 PM x36</span>
        <a href="/deals/oppo-a6-bundle">View details</a>
      </article>`

    const deals = extractPublicStoreDeals(
      {
        countryCode: 'ZA',
        lat: 0,
        lon: 0,
        name: 'Example Mobile',
        placeId: 'online:za:mobile.test',
        retailerId: 'example-mobile',
        sourceCategory: 'network-provider',
      },
      html,
      'https://mobile.test/deals',
      Date.parse('2026-07-26T10:00:00.000Z'),
    )

    expect(deals).toEqual([
      expect.objectContaining({
        imageUrl: 'https://mobile.test/images/unlimited-mobile.webp',
        priceText: 'R595',
        productUrl: 'https://mobile.test/plans/unlimited-mobile',
        retailerId: 'example-mobile',
        title: 'Unlimited mobile',
      }),
      expect.objectContaining({
        priceText: 'R799',
        productUrl: 'https://mobile.test/deals/oppo-a6-bundle',
        title: 'Double deals Oppo A6 bundle',
      }),
    ])
  })

  it('does not relax promotion proof for an ordinary non-network store', () => {
    const html = `
      <section class="mobile-plan-card">
        <h3>Unlimited mobile</h3>
        <p>Unlimited calls and data</p>
        <p>R595 month-to-month</p>
      </section>`

    expect(
      extractPublicStoreDeals(
        {
          countryCode: 'ZA',
          lat: 0,
          lon: 0,
          name: 'Ordinary Store',
          placeId: 'ordinary-store',
        },
        html,
        'https://ordinary.test/products',
        0,
      ),
    ).toEqual([])
  })

  it('drops unsafe product and image URLs from public store markup', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      image: 'data:image/svg+xml,unsafe',
      name: 'Safe title',
      offers: { '@type': 'Offer', price: 20, priceValidUntil: '2026-07-31' },
      url: 'javascript:alert(1)',
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: undefined,
        productUrl: 'https://local.test/specials',
      }),
    ])
  })

  it('rejects an ordinary product record without promotional proof', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Everyday Bread',
      offers: { '@type': 'Offer', price: 19.99, priceCurrency: 'ZAR' },
      url: '/products/bread',
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
        html,
        'https://store.test/products/bread',
        0,
      ),
    ).toEqual([])
  })

  it.each(['/specials', '/promotions'])(
    'rejects ordinary product rows on the promotional path %s',
    (path) => {
      const html = `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Everyday Long Life Milk 1L',
        offers: { '@type': 'Offer', price: 18.99, priceCurrency: 'ZAR' },
        url: '/products/milk',
      })}</script>`

      expect(
        extractPublicStoreDeals(
          { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
          html,
          `https://store.test${path}`,
          0,
        ),
      ).toEqual([])
    },
  )

  it('keeps a stable product identity when its promotional price changes', () => {
    const dealAt = (price: number) => extractPublicStoreDeals(
      { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Stable Rice 2kg',
        offers: {
          '@type': 'Offer',
          price,
          priceCurrency: 'ZAR',
          priceValidUntil: '2026-07-31',
        },
        url: '/products/stable-rice',
      })}</script>`,
      'https://store.test/specials',
      0,
    )[0]

    expect(dealAt(29.99).id).toBe(dealAt(24.99).id)
  })

  it('reads discounted headless products with nested copy, prices, links, and images', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"products":[{
          "copy":{"title":"Nike Air Max Dn8"},
          "prices":{"currentPrice":2199.95,"initialPrice":3299.95},
          "discountPercentage":33,
          "pdpUrl":{"url":"/t/air-max-dn8-shoes"},
          "colorwayImages":{"portraitURL":"/images/air-max.jpg"}
        }]}}}
      </script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Nike', placeId: 'nike-online' },
        html,
        'https://www.nike.com/za/w/sale-3yaep',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://www.nike.com/images/air-max.jpg',
        previousPriceText: 'R3299.95',
        priceText: 'R2199.95',
        productUrl: 'https://www.nike.com/t/air-max-dn8-shoes',
        title: 'Nike Air Max Dn8',
      }),
    ])
  })

  it('finds Next product state after many unrelated scripts', () => {
    const noise = Array.from(
      { length: 35 },
      (_, index) => `<script>window.noise${index} = "${'x'.repeat(100)}";</script>`,
    ).join('')
    const html = `${noise}
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"products":[{
          "copy":{"title":"Late Nike Sale Shoe"},
          "prices":{"currentPrice":999.95,"initialPrice":1499.95},
          "pdpUrl":{"url":"/za/t/late-sale-shoe"}
        }]}}
      </script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Nike', placeId: 'nike-online' },
        html,
        'https://www.nike.com/za/w/sale-3yaep',
        0,
      )[0]?.title,
    ).toBe('Late Nike Sale Shoe')
  })

  it('reads utility-class product cards with sale and line-through prices', () => {
    const html = `
      <div class="relative flex flex-col gap-1 text-sm" id="product-card-1643187">
        <a href="/women/shoes/augustina-sneaker/1643187" aria-label="View Augustina sneaker by Steve Madden">
          <img src="/images/augustina.jpg">
          <p class="font-jakarta-800">R995</p>
          <p class="text-neutral-500 line-through">R1299</p>
          <p class="text-red-500">-23%</p>
        </a>
      </div>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Superbalist', placeId: 'superbalist-online' },
        html,
        'https://superbalist.com/browse?min_discount=1',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        previousPriceText: 'R1299',
        priceText: 'R995',
        title: 'Augustina sneaker by Steve Madden',
      }),
    ])
  })

  it('reads JSON product rows nested inside VTEX state strings', () => {
    const product = {
      productName: 'Bash Court Sneaker',
      sellingPrice: 799,
      listPrice: 1199,
      link: '/bash-court-sneaker/p',
      primary_image: { cdn_path: '/arquivos/bash-court.jpg' },
    }
    const state = JSON.stringify({ products: JSON.stringify([product]) })
    const html = `<script>window.__STATE__ = ${state};</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Bash', placeId: 'bash-online' },
        html,
        'https://bash.com/feature/value',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://bash.com/arquivos/bash-court.jpg',
        previousPriceText: 'R1199',
        priceText: 'R799',
        productUrl: 'https://bash.com/bash-court-sneaker/p',
        title: 'Bash Court Sneaker',
      }),
    ])
  })

  it('reads accessible sale prices from product tiles without schema markup', () => {
    const html = `
      <div class="sf-product-tile product-tile" data-product-id="123">
        <a href="/pd/msfc-mens-home-replica/123">
          <img src="/images/msfc.jpg">
          <h3>MSFC Mens Home Replica</h3>
          <s aria-label="original price R 1 299">R 1 299</s>
          <h3 aria-label="current price R 779" data-testid="sf-current-price">R 779</h3>
        </a>
      </div>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'PUMA', placeId: 'puma-online' },
        html,
        'https://za.puma.com/outlet',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://za.puma.com/images/msfc.jpg',
        previousPriceText: 'R1299',
        priceText: 'R779',
        productUrl: 'https://za.puma.com/pd/msfc-mens-home-replica/123',
        title: 'MSFC Mens Home Replica',
      }),
    ])
  })

  it('reads discounted products from bounded framework JSON attributes', () => {
    const payload = {
      results: [
        {
          result: {
            is_on_sale: 1,
            price: 19.99,
            primary_image: {
              url: 'https://images.market.test/red-bull.jpg',
            },
            slug: 'red-bull-watermelon',
            title: 'Red Bull Watermelon 250ml',
            was_price: 21.99,
          },
        },
        {
          result: {
            is_on_sale: 0,
            price: 15.99,
            title: 'Regular milk 1L',
            was_price: 15.99,
          },
        },
      ],
    }
    const html = `
      <elasticsearch-listing
        :default-search-result='${JSON.stringify(payload)}'>
      </elasticsearch-listing>`

    expect(
      extractPublicStoreDeals(
        {
          countryCode: 'NA',
          lat: -22.56,
          lon: 17.08,
          name: 'Woermann Fresh',
          placeId: 'woermann-windhoek',
        },
        html,
        'https://shop.market.test/promotions/',
        Date.parse('2026-07-23T12:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://images.market.test/red-bull.jpg',
        previousPriceText: 'NAD 21.99',
        priceText: 'NAD 19.99',
        title: 'Red Bull Watermelon 250ml',
      }),
    ])
  })
})

// Fixtures below are the real shapes that reached shoppers as "catalogues":
// every one was stored from a Zimbabwean store page with no price on it.
describe('extractOfficialLeaflets', () => {
  const FILE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|pdf|png|svg|tiff?|webp)\b/i

  function leaflets(store: NearbyStore, html: string, pageUrl: string) {
    return extractOfficialLeaflets(
      store,
      html,
      pageUrl,
      new URL(pageUrl).origin,
      Date.parse('2026-07-24T00:00:00.000Z'),
    )
  }

  function storeFixture(name: string, placeId: string): NearbyStore {
    return { lat: -17.82, lon: 31.05, name, placeId }
  }

  it('rejects the shop own logo, however promotional the page around it', () => {
    const saiMart = storeFixture('Sai Mart', 'sai-mart')
    const html = `
      <h1>Sai Mart weekly specials</h1>
      <img src="/wp-content/uploads/2026/03/cropped-cropped-saimart.png" alt="Sai Mart">
      <img src="/img/specials/cropped-cropped-saimart.png" alt="Sai Mart">
      <img src="/assets/logo-saimart-header.png" alt="Sai Mart specials">`

    expect(leaflets(saiMart, html, 'https://saimart.co.zw/specials')).toEqual([])
  })

  it('rejects social graphics and CMS-derived thumbnails on a specials page', () => {
    const tvsh = storeFixture('TV Sales & Home', 'tv-sales-home')
    const freshco = storeFixture('Freshco Market', 'freshco-market')
    const tvshHtml = `
      <h1>Promotions</h1>
      <img src="/wp-content/uploads/2026/06/TVSH-Hisense-World-Cup-Promotion-Generic-FB-Post-WM-02-768x770.png"
        alt="Hisense World Cup Promotion">`
    const freshcoHtml = `
      <h1>Managers Specials</h1>
      <img src="/wp-content/uploads/2026/07/Managers-Special-1-1024x1024.jpg" alt="Managers Special 1">
      <img src="/wp-content/uploads/2026/07/Managers-Special-2-1024x1024.jpg" alt="Managers Special 2">
      <img src="/wp-content/uploads/2026/07/IG-Freshco-Winter-Promo-300x300.png" alt="Winter Promo">`

    expect(leaflets(tvsh, tvshHtml, 'https://tvsales.co.zw/promotions')).toEqual([])
    expect(leaflets(freshco, freshcoHtml, 'https://freshcomarket.co.zw/specials')).toEqual([])
  })

  it('rejects image-CDN artefacts and decorative page photos', () => {
    const voltman = storeFixture('Voltman Hardware', 'voltman-hardware')
    const html = `
      <h1>Voltman specials</h1>
      <img src="/images/xThings-to-do-camping.jpg.webp.pagespeed.ce.xJ1LofBGc9.webp"
        alt="Things to do camping">
      <img src="/images/store-front-photo.jpg" alt="Our Borrowdale branch">`

    expect(leaflets(voltman, html, 'https://voltman.co.zw/specials')).toEqual([])
  })

  it('rejects a promotional-looking image when only the site nav mentions specials', () => {
    // The bug: 1.2KB of surrounding markup was searched for promo wording, so a
    // single nav link made every image on an ordinary page a "catalogue".
    const voltman = storeFixture('Voltman Hardware', 'voltman-hardware')
    const html = `
      <nav><a href="/specials">Specials</a><a href="/deals">Weekly deals</a></nav>
      <h1>About us</h1>
      <img src="/images/team.jpg" alt="Our team">`

    expect(leaflets(voltman, html, 'https://voltman.co.zw/about-us')).toEqual([])
  })

  it('still accepts a real dated retailer leaflet PDF', () => {
    const shoprite = storeFixture('Shoprite Parkview', 'shoprite-parkview')
    const html = `
      <h2>Shoprite weekly specials</h2>
      <a href="/medias/ZA-Shoprite-Weekly-Specials-14-July-2026.pdf">Weekly Specials 14 July 2026</a>`

    const found = leaflets(shoprite, html, 'https://www.shoprite.co.za/specials')

    expect(found).toEqual([
      expect.objectContaining({
        kind: 'catalogue',
        productUrl: 'https://www.shoprite.co.za/medias/ZA-Shoprite-Weekly-Specials-14-July-2026.pdf',
        title: 'Weekly Specials 14 July 2026',
      }),
    ])
  })

  it('still accepts a genuine promotional catalogue image', () => {
    const freshco = storeFixture('Freshco Market', 'freshco-market')
    const html = `
      <h1>June weekly specials catalogue</h1>
      <img src="/media/catalogue/june-weekly-specials-page-1.jpg"
        alt="June weekly specials catalogue" width="827" height="1169">`

    const found = leaflets(freshco, html, 'https://freshcomarket.co.zw/specials')

    expect(found).toEqual([
      expect.objectContaining({
        kind: 'catalogue',
        productUrl: 'https://freshcomarket.co.zw/media/catalogue/june-weekly-specials-page-1.jpg',
        title: 'June weekly specials catalogue',
      }),
    ])
  })

  it('never titles a promotion from a filename', () => {
    const freshco = storeFixture('Freshco Market', 'freshco-market')
    // No heading and no alt text: the only name left is the filename, which a
    // shopper must never see. A plain truthful label is used instead.
    const html = '<div><img src="/media/june-weekly-specials-catalogue.jpg"></div>'

    const found = leaflets(freshco, html, 'https://freshcomarket.co.zw/specials')

    expect(found).toHaveLength(1)
    expect(found[0].title).toBe('Freshco Market specials')
    expect(found.every((promotion) => !FILE_EXTENSION.test(promotion.title))).toBe(true)
  })
})

describe('scheduled discovered-store scouting', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'store-scout-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    await createScoutTables(db)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await miniflare.dispose()
  })

  it('does not count full-price Z-Store stock as a deal', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'zstore.co.zw' &&
        url.pathname === '/wp-json/wc/store/v1/products'
      ) {
        return jsonResponse(url.searchParams.get('page') === '1'
          ? [{
              images: [{ src: 'https://zstore.co.zw/wp-content/uploads/hamper.jpg' }],
              is_in_stock: true,
              name: 'Basic Hamper',
              permalink: 'https://zstore.co.zw/basic-hamper/',
              prices: {
                currency_code: 'USD',
                currency_minor_unit: 2,
                price: '6000',
                regular_price: '6000',
              },
            }]
          : [])
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Z-Store Zimbabwe',
        website: 'https://zstore.co.zw/',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    expect(requestedUrls.some((url) =>
      new URL(url).pathname === '/wp-json/wc/store/v1/products'
    )).toBe(false)
    const row = await db.prepare(
      `SELECT title, price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ price_text: string; product_url: string; title: string }>()
    expect(row).toBeNull()
  })

  it('uses a verified Zimbabwe WooCommerce sale endpoint without counting full-price stock',
      async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'magnet.co.zw' &&
        url.pathname === '/wp-json/wc/store/v1/products'
      ) {
        return jsonResponse([{
          images: [{ src: 'https://magnet.co.zw/wp-content/uploads/router.webp' }],
          name: 'Dual-band Wi-Fi router',
          prices: {
            currency_code: 'USD',
            currency_minor_unit: 2,
            price: '6500',
            regular_price: '8500',
            sale_price: '6500',
          },
          slug: 'dual-band-wifi-router',
        }])
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Magnet Zimbabwe',
        website: 'https://magnet.co.zw/',
      })],
      Date.parse('2026-07-30T00:00:00.000Z'),
      1,
    )

    const productRequests = requestedUrls
      .map((url) => new URL(url))
      .filter((url) => url.pathname === '/wp-json/wc/store/v1/products')
    expect(productRequests).toHaveLength(1)
    expect(productRequests[0]?.searchParams.get('on_sale')).toBe('true')
    expect(productRequests[0]?.searchParams.get('per_page')).toBe('100')
    const row = await db.prepare(
      `SELECT title, price_text, previous_price_text
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      title: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'USD 85.00',
      price_text: 'USD 65.00',
      title: 'Dual-band Wi-Fi router',
    })
  })

  it('uses Everything Zimbabwean’s public sale catalogue', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'api.everythingzimbabwean.com' &&
        url.pathname === '/wp-json/wc/store/v1/products'
      ) {
        return jsonResponse(url.searchParams.get('page') === '1'
          ? [{
              images: [{
                src: 'https://api.everythingzimbabwean.com/wp-content/uploads/tape.webp',
              }],
              is_in_stock: true,
              name: 'Beifa Packing Tape 48mm',
              permalink:
                'https://everythingzimbabwean.com/product/beifa-packing-tape-48mm/',
              prices: {
                currency_code: 'USD',
                currency_minor_unit: 2,
                price: '120528',
                regular_price: '150660',
              },
            }]
          : [])
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Everything Zimbabwean',
        website: 'https://everythingzimbabwean.com/',
      })],
      Date.parse('2026-07-30T00:00:00.000Z'),
      1,
    )

    const productRequests = requestedUrls
      .map((url) => new URL(url))
      .filter((url) =>
        url.hostname === 'api.everythingzimbabwean.com' &&
        url.pathname === '/wp-json/wc/store/v1/products')
    expect(productRequests).toHaveLength(6)
    expect(productRequests.every((url) => url.searchParams.get('on_sale') === 'true'))
      .toBe(true)
    const row = await db.prepare(
      `SELECT title, price_text, previous_price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      product_url: string
      title: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'USD 1506.60',
      price_text: 'USD 1205.28',
      product_url:
        'https://everythingzimbabwean.com/product/beifa-packing-tape-48mm/',
      title: 'Beifa Packing Tape 48mm',
    })
  })

  it('discovers and saves Hello Kumba grocery products', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'order.hellokumba.com' &&
        url.pathname === '/merchant_sitemap.xml'
      ) {
        return htmlResponse(`
          <urlset>
            <url>
              <loc>https://order.hellokumba.com/m/hellokumba-kwese/67bb1fd97dcc40153a0c8ff3</loc>
            </url>
          </urlset>`)
      }
      if (
        url.hostname === 'api.hyperzod.app' &&
        url.pathname === '/store/v1/catalog/products'
      ) {
        return jsonResponse({
          success: true,
          data: {
            data: url.searchParams.get('page') === '1'
              ? [{
                  id: 'grocery-product',
                  in_stock: true,
                  name: 'Roller Meal 10kg',
                  price: 109.9,
                  price_currency: 'ZAR',
                  status: true,
                }]
              : [],
          },
        })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Hello Kumba',
        website: 'https://order.hellokumba.com/',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    expect(requestedUrls.some((url) =>
      new URL(url).pathname === '/merchant_sitemap.xml'
    )).toBe(true)
    expect(requestedUrls.filter((url) =>
      new URL(url).pathname === '/store/v1/catalog/products'
    )).toHaveLength(4)
    const row = await db.prepare(
      `SELECT title, price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ price_text: string; product_url: string; title: string }>()
    expect(row).toEqual({
      price_text: 'R109.90',
      product_url:
        'https://order.hellokumba.com/m/hellokumba-kwese/67bb1fd97dcc40153a0c8ff3/product/grocery-product',
      title: 'Roller Meal 10kg',
    })
  })

  it('discovers and saves Zim-Zone specials', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'zim-zone.co.uk' &&
        url.pathname === '/grocery-deals'
      ) {
        return htmlResponse(`
          <div class="product-item sevenspikes-ajaxcart" data-productid="2266">
            <div class="picture">
              <img src="/images/thumbs/knorr.jpeg" class="picture-img">
            </div>
            <label class="ribbon-text">24% OFF</label>
            <h2 class="product-title">
              <a href="/knorr-soup">Knorr Soup 50g</a>
            </h2>
            <div class="prices">
              <span class="price old-price">R9,93</span>
              <span class="price actual-price">R7,94</span>
            </div>
          </div>
        `)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Zim-Zone',
        website: 'https://zim-zone.co.uk/grocery-deals',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    expect(requestedUrls).toContain(
      'https://zim-zone.co.uk/grocery-deals?pagesize=100',
    )
    const row = await db.prepare(
      `SELECT title, price_text, previous_price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      product_url: string
      title: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'R9.93',
      price_text: 'R7.94',
      product_url: 'https://zim-zone.co.uk/knorr-soup',
      title: 'Knorr Soup 50g',
    })
  })

  it('discovers and saves Kambudzi’s public specials', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (
        url.hostname === 'kambudzi.com' &&
        url.pathname === '/search' &&
        url.searchParams.get('q') === 'special'
      ) {
        return htmlResponse(`
          <div class="product-item" data-productid="35501">
            <h2 class="product-title">
              <a href="/tastic-rice-parboiled-2kg-2">
                TASTIC RICE PARBOILED 2KG
              </a>
            </h2>
            <div class="prices">
              <span class="price old-price">R81,06</span>
              <span class="price actual-price">R72,95</span>
            </div>
          </div>
        `)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Kambudzi Groceries',
        website: 'https://kambudzi.com/search?q=special',
      })],
      Date.parse('2026-07-30T00:00:00.000Z'),
      1,
    )

    expect(requestedUrls).toContain(
      'https://kambudzi.com/search?q=special',
    )
    const row = await db.prepare(
      `SELECT title, price_text, previous_price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      product_url: string
      title: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'R81.06',
      price_text: 'R72.95',
      product_url: 'https://kambudzi.com/tastic-rice-parboiled-2kg-2',
      title: 'TASTIC RICE PARBOILED 2KG',
    })
  })

  it('discovers and saves Watumira Here’s public offers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname.endsWith('watumirahere.co.za')) {
        return htmlResponse(`
          <section>
            <h3>Hampers for Every Budget</h3>
            <p>Choose grocery hampers from as low as R550.</p>
          </section>
          <section>
            <h3>Affordable Construction Supplies</h3>
            <p>Get trusted hardware brands starting from R205.</p>
          </section>
        `)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Watumira Here',
        website: 'https://www.watumirahere.co.za/',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title, price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'
       ORDER BY price_text DESC`,
    ).all<{
      price_text: string
      product_url: string
      title: string
    }>()
    expect(rows.results).toEqual([
      {
        price_text: 'R550.00',
        product_url: 'https://www.watumirahere.co.za/',
        title: 'Grocery hampers',
      },
      {
        price_text: 'R205.00',
        product_url: 'https://www.watumirahere.co.za/',
        title: 'Hardware supplies',
      },
    ])
  })

  it('discovers and saves Bulk & Barrel’s product catalogue', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (
        url.hostname === 'bulkbmarketing-ux.github.io' &&
        url.pathname === '/bulk-barrel/'
      ) {
        return htmlResponse(`
          <div class="container" id="Groceries">
            <div class="card">
              <img src="img/mazoe.jpg" alt="Mazoe Orange Crush">
              <h3>Mazoe Orange Crush 6*2l</h3>
              <p>$21.60</p>
            </div>
          </div>
        `)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Bulk & Barrel Zimbabwe',
        website: 'https://bulkbmarketing-ux.github.io/bulk-barrel/',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT title, price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      price_text: string
      product_url: string
      title: string
    }>()
    expect(row).toEqual({
      price_text: 'USD 21.60',
      product_url: 'https://bulkbmarketing-ux.github.io/bulk-barrel/',
      title: 'Mazoe Orange Crush 6*2l',
    })
  })

  it('discovers and saves First Class Groceries products', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (url.hostname === 'api-ecommerce.hostinger.com') {
        return Response.json({
          count: 1,
          products: [{
            id: 'prod_oil',
            is_available: true,
            purchasable: true,
            ribbon_text: 'On Sale',
            thumbnail: 'https://cdn.example.com/oil.png',
            title: "D'lite Pure Cooking Oil 2L",
            variants: [{
              is_available: true,
              prices: [{
                amount: 500,
                currency_code: 'zwl',
                sale_amount: 450,
              }],
            }],
          }],
        })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'First Class Groceries Zimbabwe',
        website: 'https://www.firstclassgroceries.com/',
      })],
      Date.parse('2026-07-29T00:00:00.000Z'),
      1,
    )

    expect(requestedUrls).toContain(
      'https://api-ecommerce.hostinger.com/store/store_01KQGWJMJ110BVYHPYPHVH0GZ0/products?limit=100',
    )
    const row = await db.prepare(
      `SELECT title, price_text, previous_price_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      product_url: string
      title: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'USD 5.00',
      price_text: 'USD 4.50',
      product_url: 'https://www.firstclassgroceries.com/product/prod_oil',
      title: "D'lite Pure Cooking Oil 2L",
    })
  })

  it('saves a country-scoped network plan from its official provider page',
      async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'carrier.test' && url.pathname === '/offers') {
        return htmlResponse(`
          <section class="mobile-plan-card">
            <h3>Unlimited 5G plan</h3>
            <p>Unlimited mobile data from $45 monthly</p>
            <a href="/plans/unlimited-5g">View plan</a>
          </section>`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'US',
        countryName: 'United States',
        name: 'Example Carrier',
        placeId: 'online:us:carrier.test',
        retailerId: 'example-carrier-us',
        sourceCategory: 'network-provider',
        website: 'https://carrier.test/offers',
        websiteSource: 'country-retailer',
      })],
      Date.parse('2026-07-26T10:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT title, price_text, product_url, country_code
       FROM store_promotions WHERE place_id = 'online:us:carrier.test'`,
    ).first<{
      country_code: string
      price_text: string
      product_url: string
      title: string
    }>()

    expect(row).toEqual({
      country_code: 'US',
      price_text: 'USD 45',
      product_url: 'https://carrier.test/plans/unlimited-5g',
      title: 'Unlimited 5G plan',
    })
  })

  it('uses a discovered country retailer website for a matching nearby branch', async () => {
    const retailers = [{
      accentColor: '#00843d',
      group: 'Supermarket',
      id: 'country:zw:fresh-choice-co-zw',
      name: 'Fresh Choice Zimbabwe',
      program: 'Zimbabwe store',
      shortName: 'Fresh Choice Zimbabwe',
      sourceNote: 'Official Zimbabwe website.',
      sources: [
        {
          kind: 'store-finder',
          label: 'Official website',
          url: 'https://fresh-choice.co.zw/',
        },
      ],
      verifiedOn: '2026-07-23',
    }]
    await db.prepare(
      `INSERT INTO country_retailer_cache
        (country_code, retailers_json, checked_at, source_count)
       VALUES ('ZW', ?, ?, 1)`,
    ).bind(JSON.stringify(retailers), new Date().toISOString()).run()

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'fresh-choice.co.zw'
        ? htmlResponse(jsonLdDeal('Zimbabwe branch rice 2kg', 'Fresh Choice Zimbabwe'))
        : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        countryCode: 'ZW',
        countryName: 'Zimbabwe',
        name: 'Fresh Choice Harare',
      })],
      Date.parse('2026-07-23T10:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT website FROM store_scout_log WHERE place_id = 'market-place'`,
    ).first<{ website: string }>()
    expect(row?.website).toBe('https://fresh-choice.co.zw/')
  })

  it('checks a discovered branch page before generic specials paths', async () => {
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedPaths.push(url.pathname)
      if (url.hostname === 'market.test' && url.pathname === '/stores/branch-1') {
        return htmlResponse(`<script type="application/json">${JSON.stringify({
          business: { '@type': 'LocalBusiness', name: 'Market Place' },
          product: {
            name: 'Branch-only chicken portions 2kg',
            oldPrice: 99.99,
            promotionId: 'branch-weekly',
            salePrice: 79.99,
          },
        })}</script>`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/stores/branch-1' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requestedPaths[0]).toBe('/stores/branch-1')
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Branch-only chicken portions 2kg')
  })

  it('resolves and saves a current Shoprite Group branch promotion before fallbacks', async () => {
    const nowMs = Date.parse('2026-07-22T12:00:00.000Z')
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedPaths.push(url.pathname)
      if (url.pathname.endsWith('/get-stores-by-location')) {
        return jsonResponse({
          stores: [
            { id: 'branch-1', brand: 'Checkers', name: 'Checkers The Mutual CBD' },
          ],
        })
      }
      if (url.pathname.endsWith('/get-products-filter')) {
        return jsonResponse({
          products: [
            {
              bonusBuys: [
                {
                  active: true,
                  browseStoreIds: ['branch-1'],
                  endDate: Date.parse('2026-08-09T21:59:59.000Z'),
                  shortDescription: 'Buy 4 For R20',
                  startDate: Date.parse('2026-07-20T00:00:00.000Z'),
                },
              ],
              id: 'crackers-1',
              name: 'Tait’s Crackers',
              price: 16.99,
            },
          ],
        })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        name: 'Checkers The Mutual CBD',
        retailerId: 'checkers',
        website: 'https://www.checkers.co.za/',
      })],
      nowMs,
      1,
    )

    expect(requestedPaths).toEqual([
      '/api/browse-by-store/get-stores-by-location',
      '/api/browse-by-store/get-products-filter',
    ])
    const row = await db.prepare(
      `SELECT title, price_text, saving_text, valid_to
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      price_text: string
      saving_text: string
      title: string
      valid_to: string
    }>()
    expect(row).toEqual({
      price_text: 'R16.99',
      saving_text: 'Buy 4 For R20',
      title: 'Tait’s Crackers',
      valid_to: '2026-08-09',
    })
  })

  it('detects a verified Shopify store and saves only discounted catalogue products', async () => {
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedPaths.push(`${url.pathname}${url.search}`)

      if (url.pathname === '/specials') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'LocalBusiness',
            name: 'Market Place',
          })}</script>
          <script src="https://cdn.shopify.com/shopifycloud/storefront.js"></script>`)
      }
      if (url.pathname === '/products.json') {
        return jsonResponse({
          products: [
            {
              handle: 'weekly-rice-5kg',
              title: 'Weekly Rice 5kg',
              variants: [{ compare_at_price: '109.99', price: '89.99' }],
            },
            {
              handle: 'everyday-milk-2l',
              title: 'Everyday Milk 2L',
              variants: [{ compare_at_price: '39.99', price: '39.99' }],
            },
          ],
        })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      Date.parse('2026-07-22T12:00:00.000Z'),
      1,
    )

    expect(requestedPaths).toEqual([
      '/specials',
      `/products.json?limit=${DEFAULT_COMMON_COMMERCE_PAGE_SIZE}&page=1`,
    ])
    const rows = await db.prepare(
      `SELECT title, price_text, previous_price_text, saving_text, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{
      previous_price_text: string
      price_text: string
      product_url: string
      saving_text: string
      title: string
    }>()
    expect(rows.results).toEqual([{
      previous_price_text: 'R109.99',
      price_text: 'R89.99',
      product_url: 'https://market.test/products/weekly-rice-5kg',
      saving_text: 'Online catalogue · Save R20.00',
      title: 'Weekly Rice 5kg',
    }])
  })

  it('scans bounded later catalogue pages and formats the store country currency', async () => {
    const requestedPages: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/specials') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'LocalBusiness',
            name: 'Market Place',
          })}</script>
          <script src="https://cdn.shopify.com/shopifycloud/storefront.js"></script>`)
      }
      if (url.pathname === '/products.json') {
        requestedPages.push(url.searchParams.get('page') ?? '')
        if (url.searchParams.get('page') === '1') {
          // A full page with nothing discounted on it. Short of a full page
          // the scout knows the catalogue ended and stops, so this is what
          // makes it go looking on the next one.
          return jsonResponse({
            products: Array.from(
              { length: DEFAULT_COMMON_COMMERCE_PAGE_SIZE },
              (_, index) => ({
                handle: `regular-${index}`,
                title: `Regular item ${index}`,
                variants: [{ compare_at_price: '10.00', price: '10.00' }],
              }),
            ),
          })
        }
        return jsonResponse({
          products: [{
            handle: 'later-page-deal',
            title: 'Later page deal',
            variants: [{ compare_at_price: '10.00', price: '9.00' }],
          }],
        })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ countryCode: 'US', website: 'https://market.test/' })],
      Date.parse('2026-07-22T12:00:00.000Z'),
      1,
    )

    expect(requestedPages).toEqual(['1', '2'])
    const row = await db.prepare(
      `SELECT price_text, previous_price_text, saving_text
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{
      previous_price_text: string
      price_text: string
      saving_text: string
    }>()
    expect(row).toEqual({
      previous_price_text: 'USD 10.00',
      price_text: 'USD 9.00',
      saving_text: 'Online catalogue · Save USD 1.00',
    })
  })

  it('continues through every official specials path across runs and resets after the root', async () => {
    const store = discoveredStore({ website: 'https://market.test/' })
    const pathsByRun: string[][] = []

    for (let run = 0; run < 5; run += 1) {
      const paths: string[] = []
      pathsByRun.push(paths)
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'market.test') {
          paths.push(url.pathname)
        }
        return htmlResponse('')
      }))

      await scoutNearbyStores(env, [store], run * 86_400_000 + run, 1)
    }

    expect(pathsByRun).toEqual([
      ['/specials', '/specials.html', '/promotions', '/promotions.php'],
      ['/promocoes', '/ofertas', '/offres', '/deals'],
      ['/catalogue', '/catalogues', '/catalogo', '/folheto'],
      ['/punguzo', '/weekly-specials', '/'],
      ['/specials', '/specials.html', '/promotions', '/promotions.php'],
    ])
  })

  it('does not overwrite a native token cursor with the store path cursor', async () => {
    await db.prepare(
      `INSERT INTO deal_source_cursors (source_key, cursor_kind, cursor_value, updated_at)
       VALUES (?, 'token', 'native-secret-token', ?)`,
    ).bind('store-paths::jg1xhm', '2026-07-16T10:00:00.000Z').run()
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('')))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const cursor = await db.prepare(
      `SELECT cursor_kind, cursor_value FROM deal_source_cursors
       WHERE source_key = 'store-paths::jg1xhm'`,
    ).first<{ cursor_kind: string; cursor_value: string }>()
    expect(cursor).toEqual({ cursor_kind: 'token', cursor_value: 'native-secret-token' })
  })

  it('attempts a due discovered store even when a stale scout log says it is not due', async () => {
    await db.prepare(
      `INSERT INTO store_scout_log
       (place_id, store_name, scouted_at, next_scout_at, promotion_count)
       VALUES (?, ?, ?, ?, 0)`,
    ).bind(
      'market-place',
      'Market Place',
      '2026-07-15T10:00:00.000Z',
      '2026-07-20T10:00:00.000Z',
    ).run()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ nextScoutAt: '2026-07-16T09:00:00.000Z', website: 'https://market.test/' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requests.some((url) => url.startsWith('https://market.test/'))).toBe(true)
  })

  it('continues to a later store after one store throws unexpectedly', async () => {
    const broken = discoveredStore({ name: 'Broken Market', placeId: 'broken' }) as NearbyStore
    Object.defineProperty(broken, 'address', {
      get() {
        throw new Error('malformed provider address')
      },
    })
    const healthy = discoveredStore({
      name: 'Healthy Market',
      placeId: 'healthy',
      website: 'https://healthy.test/',
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'healthy.test' && url.pathname === '/specials') {
        return htmlResponse(jsonLdDeal('Healthy Milk 2L', 'Healthy Market'))
      }
      return htmlResponse('')
    }))

    await expect(scoutNearbyStores(env, [broken, healthy], 0, 2)).resolves.toBeUndefined()
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'healthy'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Healthy Milk 2L')
  })

  it('checks independent online stores concurrently', async () => {
    let activeRequests = 0
    let peakRequests = 0
    const stores = Array.from({ length: 5 }, (_, index) =>
      discoveredStore({
        countryCode: 'ZW',
        name: `Zimbabwe Market ${index + 1}`,
        placeId: `online:zw:market-${index + 1}.test`,
        website: `https://market-${index + 1}.test/`,
        websiteSource: 'country-retailer',
      }))

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const storeIndex = Number(url.hostname.match(/\d+/)?.[0] ?? 0)
      activeRequests += 1
      peakRequests = Math.max(peakRequests, activeRequests)
      await new Promise((resolve) => setTimeout(resolve, 10))
      activeRequests -= 1
      return htmlResponse(
        jsonLdDeal(
          `Concurrent deal ${storeIndex}`,
          `Zimbabwe Market ${storeIndex}`,
        ),
      )
    }))

    await scoutNearbyStores(
      env,
      stores,
      Date.parse('2026-07-28T10:00:00.000Z'),
      stores.length,
    )

    const count = await db.prepare(
      `SELECT COUNT(*) AS count FROM store_promotions
       WHERE country_code = 'ZW'`,
    ).first<{ count: number }>()
    expect(Number(count?.count)).toBe(5)
    expect(peakRequests).toBeGreaterThan(1)
  })

  it('keeps only same-origin catalogue PDFs from a verified official website', async () => {
    const html = `
      <h2>Market Place weekly specials</h2>
      <address>10 Main Road, Edenvale</address>
      <a href="https://market.test/files/weekly-specials.pdf">Official catalogue</a>
      <a href="https://files.example/copied-specials.pdf">Copied catalogue</a>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(html)
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const rows = await db.prepare(
      `SELECT product_url FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ product_url: string }>()
    expect(rows.results.map((row) => row.product_url)).toEqual([
      'https://market.test/files/weekly-specials.pdf',
    ])
  })

  it('allows a trusted hosted flipbook linked by a verified official store page', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'LocalBusiness',
        name: 'Market Place',
      })}</script>
      <h2>Market Place offres de la semaine</h2>
      <a href="https://online.fliphtml5.com/market/july/">Catalogue officiel</a>
      <a href="https://files.example/copied-catalogue/">Copied catalogue</a>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(html)
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const rows = await db.prepare(
      `SELECT product_url FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ product_url: string }>()
    expect(rows.results.map((row) => row.product_url)).toEqual([
      'https://online.fliphtml5.com/market/july/',
    ])
  })

  it('keeps an external promotion image but sends taps to the verified store page', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'LocalBusiness',
        name: 'Market Place',
      })}</script>
      <h2>July promotions</h2>
      <img
        alt="July weekly promotions"
        src="https://images.cdn.test/market/july-specials.jpg">`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(html)
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const row = await db.prepare(
      `SELECT image_url, product_url
       FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ image_url: string; product_url: string }>()
    expect(row).toEqual({
      image_url: 'https://images.cdn.test/market/july-specials.jpg',
      product_url: 'https://market.test/specials',
    })
  })

  it('rejects supplied website promotions when the page has no store identity evidence', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Unrelated promoted cereal',
        offers: {
          '@type': 'Offer',
          price: 39.99,
          priceCurrency: 'ZAR',
          priceValidUntil: '2026-07-31',
        },
      })}</script>
      <a href="https://market.test/files/unrelated-specials.pdf">Weekly catalogue</a>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' ? htmlResponse(html) : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results).toEqual([])
  })

  it('accepts a country-directory retailer page without requiring a branch address', async () => {
    const html = `
      <h1>Choppies Botswana weekly specials</h1>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Maize Meal 5kg',
        offers: {
          '@type': 'Offer',
          price: 59.99,
          priceCurrency: 'BWP',
          priceValidUntil: '2026-07-31',
        },
      })}</script>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'choppies.co.bw' &&
        url.pathname === '/specials-promotions/'
        ? htmlResponse(html)
        : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        address: 'Gaborone, Botswana',
        countryCode: 'BW',
        countryName: 'Botswana',
        name: 'Choppies Gaborone',
        website: 'https://choppies.co.bw/specials-promotions/',
        websiteSource: 'country-retailer',
      })],
      Date.parse('2026-07-23T12:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results).toEqual([{ title: 'Maize Meal 5kg' }])
  })

  it('rejects a known retailer website when its host is not the known official host', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify([
        { '@type': 'LocalBusiness', name: 'Woolworths Edenvale' },
        {
          '@type': 'Product',
          name: 'Promoted apples 1kg',
          offers: {
            '@type': 'Offer',
            price: 34.99,
            priceCurrency: 'ZAR',
            priceValidUntil: '2026-07-31',
          },
        },
      ])}</script>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'lookalike-market.test' ? htmlResponse(html) : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        name: 'Woolworths Edenvale',
        retailerId: 'woolworths',
        website: 'https://lookalike-market.test/',
      })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results).toEqual([])
  })

  it('verifies a newly discovered official domain from LocalBusiness structured data', async () => {
    const store = discoveredStore({
      name: 'Fresh Basket',
      placeId: 'fresh-basket',
      website: undefined,
    })
    await db.prepare(
      `INSERT INTO discovered_stores (
        place_id, store_name, address, website, lat, lon, retailer_id,
        first_seen_at, last_seen_at, last_source_tile, last_scout_at,
        next_scout_at, promotion_count, country_code
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, 'ZA')`,
    ).bind(
      store.placeId,
      store.name,
      store.address,
      store.lat,
      store.lon,
      store.firstSeenAt,
      store.lastSeenAt,
      store.nextScoutAt,
    ).run()

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        const target = encodeURIComponent('https://freshbasket.co.za/specials')
        return htmlResponse(
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${target}&amp;rut=x">Fresh Basket specials</a>`,
        )
      }
      if (url.hostname === 'freshbasket.co.za') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify([
            {
              '@type': 'https://schema.org/LocalBusiness',
              name: 'Fresh Basket',
            },
            {
              '@type': 'Product',
              name: 'Albany Bread 700g',
              offers: {
                '@type': 'Offer',
                price: 17.99,
                priceCurrency: 'ZAR',
                priceValidUntil: '2026-07-20',
              },
            },
          ])}</script>`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [store],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT
        (SELECT title FROM store_promotions WHERE place_id = 'fresh-basket') AS title,
        (SELECT website FROM discovered_stores WHERE place_id = 'fresh-basket') AS website`,
    ).first<{ title: string; website: string | null }>()
    expect(row?.title).toBe('Albany Bread 700g')
    expect(row?.website).toBe('https://freshbasket.co.za')
  })

  it('rejects a matching brand website that has no evidence for the store country', async () => {
    const store = discoveredStore({
      address: 'Port Louis, Mauritius',
      countryCode: 'MU',
      countryName: 'Mauritius',
      name: 'Pharmalink',
      placeId: 'pharmalink-mauritius',
      website: undefined,
    })
    await db.prepare(
      `INSERT INTO discovered_stores (
        place_id, store_name, address, website, lat, lon, retailer_id,
        first_seen_at, last_seen_at, last_source_tile, last_scout_at,
        next_scout_at, promotion_count, country_code
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, 'MU')`,
    ).bind(
      store.placeId,
      store.name,
      store.address,
      store.lat,
      store.lon,
      store.firstSeenAt,
      store.lastSeenAt,
      store.nextScoutAt,
    ).run()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        const target = encodeURIComponent('https://pharmalinkinc.com/promotions')
        return htmlResponse(
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${target}&amp;rut=x">Pharmalink promotions</a>`,
        )
      }
      if (url.hostname === 'pharmalinkinc.com') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'LocalBusiness',
            name: 'Pharmalink',
          })}</script>
          <h1>Pharmalink promotions</h1>
          <img src="/manufacturing-promotion.jpg" alt="Manufacturing promotion">`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [store],
      Date.parse('2026-07-23T12:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT website, promotion_count
       FROM discovered_stores WHERE place_id = 'pharmalink-mauritius'`,
    ).first<{ promotion_count: number; website: string | null }>()
    expect(row).toEqual({ promotion_count: 0, website: null })
  })

  it('keeps a short retry when a searched catalogue page has a transient store API failure', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        const target = encodeURIComponent('https://freshbasket.co.za/specials')
        return htmlResponse(
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${target}&amp;rut=x">Fresh Basket specials</a>`,
        )
      }
      if (url.hostname === 'freshbasket.co.za' && url.pathname === '/specials') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'LocalBusiness',
            name: 'Fresh Basket',
          })}</script>
          <script src="https://cdn.shopify.com/shopifycloud/storefront.js"></script>
          <h1>Fresh Basket weekly specials</h1>`)
      }
      if (url.hostname === 'freshbasket.co.za' && url.pathname === '/products.json') {
        return new Response('', { status: 503 })
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ name: 'Fresh Basket', placeId: 'fresh-basket', website: undefined })],
      nowMs,
      1,
    )

    const promotion = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'fresh-basket'`,
    ).first<{ title: string }>()
    const log = await db.prepare(
      `SELECT next_scout_at FROM store_scout_log WHERE place_id = 'fresh-basket'`,
    ).first<{ next_scout_at: string }>()
    expect(promotion?.title).toBe('Fresh Basket specials')
    expect(log?.next_scout_at).toBe('2026-07-16T11:00:00.000Z')
  })

  it('uses the anonymous SPAR branch flow before a generic website probe', async () => {
    const requests: Array<{ cookie?: string; url: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ cookie: requestHeader(init?.headers, 'cookie'), url: url.toString() })

      if (url.pathname === '/stores/search') {
        return htmlResponse(`
          <a href="/stores/101017/select?back=/specials">SUPERSPAR Kempton</a>
          <a href="/stores/102646/select?back=/specials">KWIKSPAR Dowerglen</a>`)
      }
      if (url.pathname === '/stores/102646/select') {
        const headers = new Headers({
          'content-type': 'text/html',
          location: '/specials',
        })
        headers.append('set-cookie', 'spar-session=abc123; Path=/; HttpOnly; SameSite=Lax')
        headers.append('set-cookie', 'selected-store=102646; Path=/; Secure')
        return new Response(null, { headers, status: 302 })
      }
      if (url.pathname === '/specials') {
        return htmlResponse(`
          <a href="/specials/11111111-1111-1111-1111-111111111111/show">July groceries</a>
          <a href="/specials/22222222-2222-2222-2222-222222222222/show">Fresh deals</a>`)
      }
      if (/^\/specials\/[a-f0-9-]+\/show$/.test(url.pathname)) {
        return htmlResponse('<p>Valid 16 July to 22 July</p>')
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [
        discoveredStore({
          address: 'Dowerglen, Edenvale, Gauteng',
          name: 'KWIKSPAR Dowerglen',
          retailerId: 'spar',
          website: 'https://wrong-generic-site.test/',
        }),
      ],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requests.some((request) => request.url.includes('/stores/102646/select'))).toBe(true)
    expect(requests.some((request) => request.url.startsWith('https://wrong-generic-site.test')))
      .toBe(false)
    const authenticatedRequests = requests.filter((request) =>
      request.url.includes('/specials') && request.cookie,
    )
    expect(authenticatedRequests.length).toBeGreaterThan(0)
    for (const request of authenticatedRequests) {
      expect(new Set(request.cookie?.split('; '))).toEqual(
        new Set(['spar-session=abc123', 'selected-store=102646']),
      )
      expect(request.cookie).not.toMatch(/Path=|HttpOnly|SameSite|Secure/i)
    }

    const rows = await db.prepare(
      `SELECT retailer_id, store_name, source_url, image_url
       FROM store_promotions WHERE place_id = 'market-place' ORDER BY image_url`,
    ).all<{
      image_url: string
      retailer_id: string
      source_url: string
      store_name: string
    }>()
    expect(rows.results).toEqual([
      {
        image_url: 'https://www.spar.co.za/getattachment/11111111-1111-1111-1111-111111111111/img',
        retailer_id: 'spar',
        source_url: 'https://mobile.spar.co.za/specials/11111111-1111-1111-1111-111111111111/show',
        store_name: 'KWIKSPAR Dowerglen',
      },
      {
        image_url: 'https://www.spar.co.za/getattachment/22222222-2222-2222-2222-222222222222/img',
        retailer_id: 'spar',
        source_url: 'https://mobile.spar.co.za/specials/22222222-2222-2222-2222-222222222222/show',
        store_name: 'KWIKSPAR Dowerglen',
      },
    ])
  })

  it('does not use South African native retailer adapters for stores in another country', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [
        discoveredStore({
          countryCode: 'ZW',
          name: 'Spar Harare',
          placeId: 'spar-harare',
          retailerId: 'spar',
        }),
        discoveredStore({
          countryCode: 'ZW',
          name: 'Shoprite Harare',
          placeId: 'shoprite-harare',
          retailerId: 'shoprite',
        }),
      ],
      Date.parse('2026-07-23T12:00:00.000Z'),
      2,
    )

    expect(requests.some((url) => url.includes('mobile.spar.co.za'))).toBe(false)
    expect(requests.some((url) => url.includes('api.browse-by-store'))).toBe(false)
    expect(requests.some((url) => decodeURIComponent(url).includes('site:spar.co.za'))).toBe(false)
  })

  it('continues to the official website when the preferred SPAR branch method is unavailable', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (url.hostname === 'mobile.spar.co.za' && url.pathname === '/stores/search') {
        return new Response('', { status: 503 })
      }
      if (url.hostname === 'mobile.spar.co.za' && url.pathname === '/branch-specials') {
        return htmlResponse(jsonLdDeal('Branch maize meal 5kg', 'SPAR Branch Market'))
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        name: 'SPAR Branch Market',
        retailerId: 'spar',
        website: 'https://mobile.spar.co.za/branch-specials',
      })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requestedUrls.some((url) => new URL(url).pathname === '/stores/search')).toBe(true)
    expect(requestedUrls.some((url) => new URL(url).pathname === '/branch-specials')).toBe(true)
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Branch maize meal 5kg')
  })

  it('retires missing rows after a certain non-empty refresh from the same source', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    await db.prepare(
      `INSERT INTO store_promotions
       (id, place_id, store_name, kind, title, source_url, captured_at, expires_at)
       VALUES ('old-promo', 'market-place', 'Market Place', 'deal', 'Old weekly item',
         'https://market.test/specials/old', ?, ?)`,
    ).bind(
      new Date(nowMs - 86_400_000).toISOString(),
      new Date(nowMs + 86_400_000).toISOString(),
    ).run()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(jsonLdDeal('Current weekly item', 'Market Place'))
        : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      nowMs,
      1,
    )

    const rows = await db.prepare(
      `SELECT id, title FROM store_promotions WHERE place_id = 'market-place' ORDER BY title`,
    ).all<{ id: string; title: string }>()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.title).toBe('Current weekly item')
    expect(rows.results[0]?.id).not.toBe('old-promo')
  })

  it('rescues a bot-blocked store site through the reader proxy', async () => {
    // Many store sites 403 datacenter fetches while serving the same public
    // specials page to browsers — the reader fallback must still get them.
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'market.test') {
        return new Response('blocked', { status: 403 })
      }
      if (url.hostname === 'r.jina.ai' && String(input).includes('market.test')) {
        return htmlResponse(jsonLdDeal('Reader-rescued weekly item', 'Market Place'))
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      nowMs,
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results.map((row) => row.title)).toContain('Reader-rescued weekly item')
  })

  it('uses a short retry for a transient failure and preserves old promotions', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    await db.prepare(
      `INSERT INTO store_promotions
       (id, place_id, store_name, kind, title, source_url, captured_at, expires_at)
       VALUES ('old-promo', 'market-place', 'Market Place', 'deal', 'Still valid',
         'https://market.test/deal', ?, ?)`,
    ).bind(
      new Date(nowMs - 86_400_000).toISOString(),
      new Date(nowMs + 86_400_000).toISOString(),
    ).run()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test'
        ? new Response('', { status: 503 })
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], nowMs, 1)

    const old = await db.prepare(
      `SELECT title FROM store_promotions WHERE id = 'old-promo'`,
    ).first<{ title: string }>()
    const log = await db.prepare(
      `SELECT next_scout_at FROM store_scout_log WHERE place_id = 'market-place'`,
    ).first<{ next_scout_at: string }>()
    expect(old?.title).toBe('Still valid')
    expect(log?.next_scout_at).toBe('2026-07-16T11:00:00.000Z')
  })
})

function discoveredStore(overrides: Partial<NearbyStore & { nextScoutAt: string }> = {}) {
  return {
    address: '10 Main Road, Edenvale, Gauteng',
    firstSeenAt: '2026-07-15T10:00:00.000Z',
    lastSeenAt: '2026-07-16T09:00:00.000Z',
    lat: -26.1,
    lon: 28.05,
    name: 'Market Place',
    nextScoutAt: '1970-01-01T00:00:00.000Z',
    placeId: 'market-place',
    ...overrides,
  }
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status,
  })
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function jsonLdDeal(title: string, storeName: string) {
  return `<script type="application/ld+json">${JSON.stringify([
    { '@type': 'LocalBusiness', name: storeName },
    {
      '@type': 'Product',
      name: title,
      offers: {
        '@type': 'Offer',
        price: 34.99,
        priceCurrency: 'ZAR',
        priceValidUntil: '2026-07-31',
      },
    },
  ])}</script>`
}

function requestHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined
  }
  return new Headers(headers).get(name) ?? undefined
}

async function createScoutTables(db: D1Database) {
  const statements = [
    `CREATE TABLE store_promotions (
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, store_name TEXT NOT NULL,
      retailer_id TEXT, kind TEXT NOT NULL DEFAULT 'deal', title TEXT NOT NULL,
      price_text TEXT, previous_price_text TEXT, saving_text TEXT, source_url TEXT NOT NULL,
      product_url TEXT, image_url TEXT, valid_from TEXT, valid_to TEXT,
      captured_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'ZA',
      sold_out INTEGER
    )`,
    `CREATE TABLE store_scout_log (
      place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, website TEXT, retailer_id TEXT,
      scouted_at TEXT NOT NULL, next_scout_at TEXT NOT NULL, promotion_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE discovered_stores (
      place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, website TEXT,
      lat REAL NOT NULL, lon REAL NOT NULL, retailer_id TEXT, first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL, last_source_tile TEXT, last_scout_at TEXT,
      next_scout_at TEXT NOT NULL, promotion_count INTEGER NOT NULL DEFAULT 0,
      country_code TEXT NOT NULL DEFAULT 'ZA'
    )`,
    `CREATE TABLE deal_source_cursors (
      source_key TEXT PRIMARY KEY, cursor_kind TEXT NOT NULL,
      cursor_value TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE country_retailer_cache (
      country_code TEXT PRIMARY KEY, retailers_json TEXT NOT NULL,
      checked_at TEXT NOT NULL, source_count INTEGER NOT NULL DEFAULT 0
    )`,
  ]

  for (const statement of statements) {
    await db.prepare(statement).run()
  }
}
