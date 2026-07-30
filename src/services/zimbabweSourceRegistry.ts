export type ZimbabweSourceCategory =
  | 'agriculture'
  | 'automotive'
  | 'books-and-gifts'
  | 'fashion'
  | 'food'
  | 'fuel-and-centres'
  | 'groceries'
  | 'hardware'
  | 'home'
  | 'marketplaces'
  | 'pharmacy'
  | 'restaurants'
  | 'technology'
  | 'telecoms'
  | 'verify-first'

export type ZimbabweSourceStatus = 'A' | 'B' | 'C' | 'D' | 'R' | 'V'

export type ZimbabweSourceAutomation =
  | 'direct'
  | 'discovery'
  | 'social-reference'
  | 'verify-first'

export interface ZimbabweSourceLink {
  label: string
  url: string
}

export interface ZimbabweSource {
  automation: ZimbabweSourceAutomation
  category: ZimbabweSourceCategory
  id: string
  links: readonly ZimbabweSourceLink[]
  name: string
  status: readonly ZimbabweSourceStatus[]
}

export interface ZimbabweAutomatedRetailSource {
  kind: 'specials' | 'store-finder'
  label: string
  retailerName: string
  url: string
}

export interface ZimbabweCatalogueSourcePage {
  retailerName: string
  sourceId: string
  url: string
}

// Imported from the Zimbabwe online deals, promotions, specials and
// catalogues directory compiled on 27 July 2026. Entries remain typed and
// country-specific so social references, discovery directories and retired
// domains never enter the direct retailer fetch queue by accident.
export const ZIMBABWE_SOURCE_DIRECTORY = [
  {
    "id": "001",
    "name": "TM Pick n Pay Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / online shop",
        "url": "https://tmpnponline.co.zw/"
      },
      {
        "label": "Specials",
        "url": "https://tmpnponline.co.zw/specials"
      },
      {
        "label": "Catalogue",
        "url": "https://tmpnponline.co.zw/catalog"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "002",
    "name": "SPAR Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.spar.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://www.spar.co.zw/products"
      },
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/SPAR.Zimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "003",
    "name": "OK Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://okonline.co.zw/"
      },
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/ok.zimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "004",
    "name": "Bon Marche Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/BonMarcheZimbabwe/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "005",
    "name": "OKmart Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/OKmartZim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "006",
    "name": "Food World Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.foodworld.co.zw/"
      },
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/FoodWorldZim/"
      },
      {
        "label": "Instagram promos",
        "url": "https://www.instagram.com/foodworldzimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "007",
    "name": "N. Richards Wholesalers",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://nrichards.co.zw/"
      },
      {
        "label": "Promotions",
        "url": "https://nrichards.co.zw/promotions/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "008",
    "name": "Gain Cash & Carry",
    "category": "groceries",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://gain.co.zw/"
      },
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/gaincashandcarry/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "009",
    "name": "Metro Peech & Browne / Metro Hypermarket Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/MetroHypermarketZim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "010",
    "name": "Mahomed Mussa Wholesalers",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/mahomedmussawholesalers/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "011",
    "name": "Zapalala Supermarket",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/zapalalasupermarket/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "012",
    "name": "Food Lover’s Market Greendale",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Zimbabwe store page",
        "url": "https://foodloversmarket.co.za/stores/zimbabwe/food-lovers-market-greendale/"
      },
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/foodloversgreendale/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "013",
    "name": "Food Lover’s Market Bulawayo",
    "category": "groceries",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promos",
        "url": "https://www.facebook.com/p/Food-Lovers-Market-Bulawayo-100054289189512/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "014",
    "name": "Greens Supermarket / Greens Online",
    "category": "groceries",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://greensonline.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/greenssupermarketzw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "015",
    "name": "FreshCo Market Zimbabwe",
    "category": "groceries",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://freshcomarket.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/freshcomarketzimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "016",
    "name": "TillPoint",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://tillpoint.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "017",
    "name": "GetMore Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://getmore.co.zw/"
      },
      {
        "label": "Special offers",
        "url": "https://getmore.co.zw/special-offers.html"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "018",
    "name": "Zim Mega Store",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.zimmegastore.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "019",
    "name": "Tengai Online",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://tengaionline.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "020",
    "name": "Z-Store Zimbabwe",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://zstore.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://zstore.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "021",
    "name": "Pook Zimbabwe",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://pook.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "022",
    "name": "ShopExpress Zimbabwe",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.shopexpresszw.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "023",
    "name": "Hello Kumba",
    "category": "groceries",
    "status": [
      "R",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Order online",
        "url": "https://order.hellokumba.com/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/hellokumba/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "024",
    "name": "Malaicha",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://malaicha.com/"
      },
      {
        "label": "Zimbabwe catalogue",
        "url": "https://malaicha.com/catalogue/zimbabwe.pdf"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "025",
    "name": "Zim-Zone",
    "category": "groceries",
    "status": [
      "R",
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://zim-zone.co.uk/"
      },
      {
        "label": "Grocery deals",
        "url": "https://zim-zone.co.uk/grocery-deals"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "026",
    "name": "Watumira Here",
    "category": "groceries",
    "status": [
      "R",
      "C"
    ],
    "links": [
      {
        "label": "Offers and online ordering",
        "url": "https://www.watumirahere.co.za/"
      },
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/WatumiraHere/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "027",
    "name": "Grocery OnDial Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/groceryondialzim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "028",
    "name": "Budget Cash & Carry Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/budgetcashcarry/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "029",
    "name": "Bulk & Barrel Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Product catalogue",
        "url": "https://bulkbmarketing-ux.github.io/bulk-barrel/"
      },
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/bulkbarrelzw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "030",
    "name": "First Class Groceries Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.firstclassgroceries.com/products"
      },
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/firstclassgroceries1/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "031",
    "name": "Taraz Wholesale Zimbabwe",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/p/Taraz-Wholesale-61557534164220/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "032",
    "name": "1 Up Cash & Carry",
    "category": "groceries",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/1upcashandcarry/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "033",
    "name": "Trade Centre Zimbabwe",
    "category": "groceries",
    "status": [
      "B",
      "C",
      "V"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://tradecentre.co.zw/"
      },
      {
        "label": "Instagram promos",
        "url": "https://www.instagram.com/tradecentre_zimbabwe/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "034",
    "name": "Kambudzi Groceries",
    "category": "groceries",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop specials",
        "url": "https://kambudzi.com/search?q=special"
      },
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/kambudzigroceries/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "035",
    "name": "Food Emporium Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online shop and weekly specials",
        "url": "https://foodemporium.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "036",
    "name": "FlexiMart Online Store",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://fleximart.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "037",
    "name": "MutareMart",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://mutaremart.com/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "038",
    "name": "Online Musika",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.onlinemusika.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "039",
    "name": "SA to Zim",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.satozim.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "040",
    "name": "Everything Zimbabwean",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://everythingzimbabwean.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "041",
    "name": "Raines Africa",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://raines.africa/en"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "042",
    "name": "ZikiMall",
    "category": "groceries",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://zikimall.com/"
      },
      {
        "label": "Marketplace",
        "url": "https://shop.zikimall.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "043",
    "name": "Africa.store",
    "category": "groceries",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://africa.store/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "044",
    "name": "Zambezi Cart",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.zambezicart.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "045",
    "name": "10ngah",
    "category": "groceries",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://10ngah.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "046",
    "name": "Primestores Zimbabwe",
    "category": "groceries",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://primestores.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "047",
    "name": "Kwingy",
    "category": "groceries",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Online store / marketplace",
        "url": "https://kwingy.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "048",
    "name": "Daily Sale Shop Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Deals store",
        "url": "https://dailysale.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "049",
    "name": "The Daily Sale",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Deals store",
        "url": "https://www.thedailysale.shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "050",
    "name": "TopDeals Zimbabwe",
    "category": "groceries",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Deals store",
        "url": "https://www.topdeals.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "051",
    "name": "ShopZim",
    "category": "groceries",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Online store / marketplace",
        "url": "https://shopzim.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "052",
    "name": "ZimexApp Marketplace",
    "category": "groceries",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Marketplace",
        "url": "https://zimexapp.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "053",
    "name": "Pa-Musika",
    "category": "groceries",
    "status": [
      "B",
      "D",
      "V"
    ],
    "links": [
      {
        "label": "Marketplace",
        "url": "https://pa-musika.com/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "054",
    "name": "AMP Meats",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.ampmeats.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "055",
    "name": "Texas Meats Zimbabwe",
    "category": "food",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/TexasMeatsZimbabwe/"
      },
      {
        "label": "Brand page",
        "url": "https://www.ampmeats.co.zw/our-brands/texas-meats"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "056",
    "name": "Texas Meat Market",
    "category": "food",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Brand page",
        "url": "https://www.ampmeats.co.zw/our-brands/texas-meat-market"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "057",
    "name": "Butcher Box Zimbabwe",
    "category": "food",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Brand page",
        "url": "https://www.ampmeats.co.zw/our-brands/butcher-box"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "058",
    "name": "Budget Meat Shop / Budget Butchery Bulawayo",
    "category": "food",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://budgetmeatshop.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://budgetmeatshop.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "059",
    "name": "Para Meats",
    "category": "food",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store and specials",
        "url": "https://www.parameats.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "060",
    "name": "MC Meats",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://mcmeats.co.zw/"
      },
      {
        "label": "Meat shop",
        "url": "https://mcmeats.co.zw/meat-shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "061",
    "name": "Meat Express Zimbabwe",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.meatexpress.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "062",
    "name": "Binder Abattoir / Binder",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://binder.co.zw/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/binder_zimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "063",
    "name": "Colcom Foods",
    "category": "food",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.colcom.co.zw/"
      },
      {
        "label": "Online shop",
        "url": "https://www.colcom.co.zw/shop/"
      },
      {
        "label": "Instagram deals",
        "url": "https://www.instagram.com/colcom.foods/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "064",
    "name": "Hyper Meats Zimbabwe",
    "category": "food",
    "status": [
      "B",
      "V"
    ],
    "links": [
      {
        "label": "Store listing / discovery source",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/13"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "065",
    "name": "Riveredge Farm Fresh Meat",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Store discovery page",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/19"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "066",
    "name": "Vegetable Basket Zimbabwe",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.vegetablebasket.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "067",
    "name": "4 Harvests",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.4harvests.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "068",
    "name": "The Fresh Company Zimbabwe",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://thefreshcompany.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "069",
    "name": "Dendairy",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://dendairy.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "070",
    "name": "Arenel",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://arenel.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "071",
    "name": "Cairns Foods",
    "category": "food",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://cairnsfoods.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://cairnsfoods.co.zw/products/"
      },
      {
        "label": "Facebook competitions/offers",
        "url": "https://www.facebook.com/CairnsFoods/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "072",
    "name": "Cake Fairy Zimbabwe",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.cakefairy1.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "073",
    "name": "Cake Studio Zimbabwe",
    "category": "food",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://cakestudio.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "074",
    "name": "Kashep Bakery",
    "category": "food",
    "status": [
      "B",
      "V"
    ],
    "links": [
      {
        "label": "Store discovery page",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/13"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "075",
    "name": "Dairibord Zimbabwe",
    "category": "food",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.dairibord.com/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/DairibordZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "076",
    "name": "Irvine’s Zimbabwe",
    "category": "food",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.irvineschicken.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/IrvinesZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "077",
    "name": "National Foods Zimbabwe",
    "category": "food",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.nationalfoods.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/NationalFoodsZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "078",
    "name": "Probrands Zimbabwe",
    "category": "food",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://probrands.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/ProbrandsZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "079",
    "name": "Tanganda Tea Company",
    "category": "food",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://tangandatea.com/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/TangandaTeaCompany/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "080",
    "name": "Dr Trouble",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://drtrouble.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "081",
    "name": "Oasis Water Zimbabwe",
    "category": "food",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.oasiswater.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "082",
    "name": "KFC Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.kfc.co.zw/"
      },
      {
        "label": "Menu and offers",
        "url": "https://www.kfc.co.zw/en/menu"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "083",
    "name": "Hungry Lion Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.hungrylion.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "084",
    "name": "Chicken Inn Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online ordering",
        "url": "https://www.chicken-inn.online/"
      },
      {
        "label": "Facebook deals",
        "url": "https://www.facebook.com/ChickenInnZW/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "085",
    "name": "Pizza Inn Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook deals",
        "url": "https://www.facebook.com/PizzaInnZim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "086",
    "name": "Creamy Inn Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook deals",
        "url": "https://www.facebook.com/CreamyInnZW/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "087",
    "name": "Baker’s Inn Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Brand page",
        "url": "https://www.simbisabrands.com/our-brands/bakers-inn/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/BakersInnZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "088",
    "name": "Fish Inn Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Brand page",
        "url": "https://www.simbisabrands.com/our-brands/fish-inn/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "089",
    "name": "Nando’s Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.nandos.co.zw/"
      },
      {
        "label": "Menu",
        "url": "https://www.nandos.co.zw/eat/menu"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "090",
    "name": "Chicken Slice",
    "category": "restaurants",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://chickenslice.com/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/ChickenSliceZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "091",
    "name": "Chicken Hut Zimbabwe",
    "category": "restaurants",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://chickenhut.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "092",
    "name": "The Poultry Shop Zimbabwe",
    "category": "restaurants",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://thepoultryshop.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "093",
    "name": "Yanaya Lifestyle",
    "category": "restaurants",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Order online",
        "url": "https://www.yanaya.co.zw/order-online/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/yanayalifestyle/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "094",
    "name": "Dial-A-Delivery Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook deals",
        "url": "https://www.facebook.com/DialADeliveryZW/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "095",
    "name": "Dial Eats Zimbabwe",
    "category": "restaurants",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Food ordering",
        "url": "https://dialeats.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "096",
    "name": "Slyder Zimbabwe",
    "category": "restaurants",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Food ordering",
        "url": "https://www.slyder.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "097",
    "name": "ReadyGo Zimbabwe",
    "category": "restaurants",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Offers",
        "url": "https://readygo.co.zw/offers"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "098",
    "name": "Simbisa Brands Zimbabwe",
    "category": "restaurants",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Brand group website",
        "url": "https://www.simbisabrands.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "099",
    "name": "Coffee Republik Zimbabwe",
    "category": "restaurants",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online store / site",
        "url": "https://coffeerepublik.online/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "100",
    "name": "Compare Prices Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "D"
    ],
    "links": [
      {
        "label": "Catalogue specials",
        "url": "http://www.compareprices.co.zw/catalogues/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/comparepriceszimbabwe/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "101",
    "name": "Zimpricecheck",
    "category": "marketplaces",
    "status": [
      "A",
      "D"
    ],
    "links": [
      {
        "label": "Price comparison",
        "url": "https://zimpricecheck.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "102",
    "name": "DotCompare Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "D"
    ],
    "links": [
      {
        "label": "Price comparison",
        "url": "https://dotcompare.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "103",
    "name": "Pricelyst Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "D"
    ],
    "links": [
      {
        "label": "Price comparison",
        "url": "https://pricelyst.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "104",
    "name": "Latest Specials Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "C",
      "D"
    ],
    "links": [
      {
        "label": "Facebook specials feed",
        "url": "https://www.facebook.com/latestspecialszw/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "105",
    "name": "Catalog Deals Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "C",
      "D"
    ],
    "links": [
      {
        "label": "Facebook catalogue feed",
        "url": "https://www.facebook.com/CatalogDeals.zw/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "106",
    "name": "TheDirectory.co.zw",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Business directory and promotions",
        "url": "https://thedirectory.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "107",
    "name": "ZimPlaza",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Business and shopping directory",
        "url": "https://www.zimplaza.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "108",
    "name": "ZimbabweYP",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Business directory",
        "url": "https://www.zimbabweyp.com/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "109",
    "name": "Search.co.zw",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Business directory",
        "url": "https://search.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "110",
    "name": "Think Local Zimbabwe",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Local business directory",
        "url": "https://thinklocal.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "111",
    "name": "Zimbabwe Yellow Pages",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Business directory",
        "url": "https://yellowpages.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "112",
    "name": "AfterShip Zimbabwe Online Stores Directory",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Zimbabwe e-commerce directory",
        "url": "https://ecommerce.aftership.com/countries/zw/stores"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "113",
    "name": "StoreLeads Zimbabwe Shopify Store Report",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Zimbabwe Shopify stores",
        "url": "https://storeleads.app/reports/shopify/ZW/top-stores"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "114",
    "name": "Marketing Association of Zimbabwe Directory",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "MAZ directory",
        "url": "https://directory.maz.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "115",
    "name": "ZimHub",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Marketplace / directory",
        "url": "https://zimhub.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "116",
    "name": "Ownai",
    "category": "marketplaces",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Marketplace",
        "url": "https://www.ownai.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "117",
    "name": "Classifieds Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Classifieds and discounted listings",
        "url": "https://www.classifieds.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "118",
    "name": "Facebook Marketplace - Harare",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Marketplace",
        "url": "https://www.facebook.com/marketplace/105977082774327/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "119",
    "name": "Auto.co.zw",
    "category": "marketplaces",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Automotive marketplace",
        "url": "https://auto.co.zw/"
      },
      {
        "label": "Car parts",
        "url": "https://auto.co.zw/car-parts"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "120",
    "name": "Cars.co.zw",
    "category": "marketplaces",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Automotive marketplace",
        "url": "https://cars.co.zw/"
      },
      {
        "label": "Tyres, mags and wheels",
        "url": "https://cars.co.zw/tyres-mags-wheels/new"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "121",
    "name": "AMA Market",
    "category": "marketplaces",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Agricultural marketplace",
        "url": "https://market.ama.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "122",
    "name": "Local Ads Zimbabwe",
    "category": "marketplaces",
    "status": [
      "D"
    ],
    "links": [
      {
        "label": "Classifieds / local ads",
        "url": "https://localads.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "123",
    "name": "For Sale Classifieds Zimbabwe",
    "category": "marketplaces",
    "status": [
      "D",
      "V"
    ],
    "links": [
      {
        "label": "Discovery listing",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/18"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "124",
    "name": "Zimbabwemall",
    "category": "marketplaces",
    "status": [
      "B",
      "D"
    ],
    "links": [
      {
        "label": "Marketplace",
        "url": "https://www.zimbabwemall.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "125",
    "name": "Hotbox Marketplace",
    "category": "marketplaces",
    "status": [
      "B",
      "D",
      "V"
    ],
    "links": [
      {
        "label": "Store discovery page",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/10"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "126",
    "name": "Ubuy Zimbabwe",
    "category": "marketplaces",
    "status": [
      "A",
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Zimbabwe storefront",
        "url": "https://www.ubuy.co.zw/en/"
      },
      {
        "label": "Deals",
        "url": "https://www.ubuy.co.zw/en/deals/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "127",
    "name": "Desertcart Zimbabwe",
    "category": "marketplaces",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Zimbabwe storefront",
        "url": "https://www.desertcart.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "128",
    "name": "Goxip Zimbabwe",
    "category": "marketplaces",
    "status": [
      "R",
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Zimbabwe fashion shopping",
        "url": "https://www.goxip.com/zw/en"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "129",
    "name": "Send Love Zimbabwe",
    "category": "marketplaces",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://sendlove.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://sendlove.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "130",
    "name": "From Me Zimbabwe",
    "category": "marketplaces",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.fromme.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://www.fromme.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "131",
    "name": "Unforgettable Gifts Zimbabwe",
    "category": "marketplaces",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online gift store",
        "url": "https://unforgettablegifts.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "132",
    "name": "The African Collection",
    "category": "marketplaces",
    "status": [
      "R",
      "B"
    ],
    "links": [
      {
        "label": "Online art store",
        "url": "https://africancollection.art/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "133",
    "name": "Edgars Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://edgarsstores.co.zw/"
      },
      {
        "label": "Catalogue/categories",
        "url": "https://www.edgarsstores.co.zw/category.html"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "134",
    "name": "Jet Stores Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://jetstores.co.zw/"
      },
      {
        "label": "Online store",
        "url": "https://jetstores.co.zw/online-store/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "135",
    "name": "Truworths Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://truworths.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/TruworthsZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "136",
    "name": "Topics Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook sales",
        "url": "https://www.facebook.com/topicszimbabwe/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/TOPICSZW/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "137",
    "name": "Powersales Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/PowersalesZim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "138",
    "name": "Number 1 Stores Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/number1zim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "139",
    "name": "Power Fashion Factory Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook sales",
        "url": "https://www.facebook.com/PowerFashionFactory/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "140",
    "name": "Bata Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Zimbabwe website",
        "url": "https://www.bata.com/zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/batazim/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "141",
    "name": "Pipeline Fashions",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://pipelinefashions.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "142",
    "name": "JanJam Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://janjam.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "143",
    "name": "Lucky Brand Zimbabwe",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://luckybrandonline.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "144",
    "name": "Absolute Sports Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://absolute-sports.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "145",
    "name": "Ideal Sports Zimbabwe",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://idealsports.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "146",
    "name": "Mark Manolios Sports",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.mmsports.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "147",
    "name": "Lite Active",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://liteactive.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "148",
    "name": "Femina Garments",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://femina.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "149",
    "name": "Enbee Stores",
    "category": "fashion",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.enbee.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/enbeestores/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/enbeestores/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "150",
    "name": "Toppers Uniforms",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://toppersuniforms.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://toppersuniforms.co.zw/shop/"
      },
      {
        "label": "Special collection",
        "url": "https://toppersuniforms.co.zw/homepage/special-collection/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "151",
    "name": "Fantasy Fabrics Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://fantasyfabrics.co.zw/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/fantasyfabricszw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/fantasyfabricszw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "152",
    "name": "Zimbabwe Leather Collective",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://zimbabweleathercollective.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "153",
    "name": "Mawu Africa",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://mawuafrica.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "154",
    "name": "J de la Rue",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://jdelarue.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "155",
    "name": "Ndau Collection",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.ndaucollectionstore.com/"
      },
      {
        "label": "Shop all pieces",
        "url": "https://www.ndaucollectionstore.com/collections/all"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "156",
    "name": "The Zuri Collection",
    "category": "fashion",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://thezuricollection.com/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/THE_ZURI_COLLECTION/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "157",
    "name": "Claytess Jewellers",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://claytessjewellers.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "158",
    "name": "Dariro Mode",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://dariromode.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "159",
    "name": "Maveneka For Her",
    "category": "fashion",
    "status": [
      "C"
    ],
    "links": [
      {
        "label": "Instagram shop and promotions",
        "url": "https://www.instagram.com/mavenekaforher/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "160",
    "name": "ZARF Zimbabwe fashion store",
    "category": "fashion",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://zarf.co.zw/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/zarf_official/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "161",
    "name": "Avacarts",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://avacarts.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "162",
    "name": "Buy Avon Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://buyavon.co.zw/"
      },
      {
        "label": "Shop / specials",
        "url": "https://buyavon.co.zw/shop"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "163",
    "name": "Owens Beauty Studios Zimbabwe",
    "category": "fashion",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Instagram deals",
        "url": "https://www.instagram.com/owensbeautystudios_zim/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "164",
    "name": "No Grow Zimbabwe",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://nogrow.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "165",
    "name": "Hippo Studio Zimbabwe",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.hippo.studio/"
      },
      {
        "label": "Online shop",
        "url": "https://www.hippo.studio/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "166",
    "name": "Belinda Marshall Art",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://belindamarshallart.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "167",
    "name": "Hope Masike Shop",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://hopemasike.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "168",
    "name": "National Handcraft Centre / NHC Textiles",
    "category": "fashion",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Textiles shop",
        "url": "https://www.nhc.co.zw/product-category/textiles/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "169",
    "name": "TV Sales & Home",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://tvsales.co.zw/"
      },
      {
        "label": "Promotions",
        "url": "https://tvsales.co.zw/promotions/"
      },
      {
        "label": "Products / featured deals",
        "url": "https://www.tvsales.co.zw/products/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "170",
    "name": "House & Home Zimbabwe",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Deals and online store",
        "url": "https://houseandhome.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "171",
    "name": "Nash Furnishers",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://nashfurnishers.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "172",
    "name": "Pezm Furniture",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.pezmfurniture.co.zw/"
      },
      {
        "label": "Products / hot deals",
        "url": "https://www.pezmfurniture.co.zw/products.php"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "173",
    "name": "Best Furniture Zimbabwe",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://bestfurniture.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "174",
    "name": "Bhiks Home Store",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://bhikshomestore.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "175",
    "name": "Station Furnishers",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://stationfurnishers.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "176",
    "name": "Edcorp Zimbabwe",
    "category": "home",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/EdcorpZimbabwe/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "177",
    "name": "Royal Home Furniture Zimbabwe",
    "category": "home",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/royalhomefurniturezim19/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "178",
    "name": "Capri Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / appliances",
        "url": "https://www.capri.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "179",
    "name": "Silkwood Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://silkwood.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "180",
    "name": "Bathroom Boutique Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://bathroomboutique.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "181",
    "name": "Tile & Carpet Centre Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.tileandcarpetcentre.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "182",
    "name": "Maguires Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://maguires.co/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "183",
    "name": "Manhattan Interiors Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://www.manhattaninteriors.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "184",
    "name": "Lighting World Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://lightingworld.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "185",
    "name": "Creative Credit Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / product catalogue",
        "url": "https://creativecredit.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "186",
    "name": "Keson TVs",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store / offers",
        "url": "https://kesontvs.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "187",
    "name": "Electromaster Zimbabwe",
    "category": "home",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://electromaster.co.zw/"
      },
      {
        "label": "Electronics and specials",
        "url": "https://electromaster.co.zw/electronics"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "188",
    "name": "Montana Zim / Montana Mall",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://montanamallzw.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "189",
    "name": "Shopdecor Zimbabwe",
    "category": "home",
    "status": [
      "B",
      "R"
    ],
    "links": [
      {
        "label": "Zimbabwe storefront",
        "url": "https://zw.shopdecor.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "190",
    "name": "Golden Stairs Nursery",
    "category": "home",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://goldenstairsnursery.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "191",
    "name": "Burnt Earth Designs",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://burntearthdesigns.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "192",
    "name": "TC Gas Zimbabwe",
    "category": "home",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online appliances / gas store",
        "url": "https://tcgas.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "193",
    "name": "Powershop Zimbabwe",
    "category": "home",
    "status": [
      "B",
      "V"
    ],
    "links": [
      {
        "label": "Store discovery page",
        "url": "https://ecommerce.aftership.com/countries/zw/stores/page/8"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "194",
    "name": "Halsted Builders Express",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / shop",
        "url": "https://www.halsteds.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "195",
    "name": "Union Hardware",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://unionhardware.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://unionhardware.co.zw/shop/"
      },
      {
        "label": "Catalogues",
        "url": "https://unionhardware.co.zw/msasa/catalogues/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "196",
    "name": "Electrosales Hardware",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.electrosales.co.zw/"
      },
      {
        "label": "Promotions",
        "url": "https://www.electrosales.co.zw/promotions"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "197",
    "name": "Bhola Hardware",
    "category": "hardware",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.bholahardware.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "198",
    "name": "ZBMS Zimbabwe Building Materials Suppliers",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.zbms.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://www.zbms.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "199",
    "name": "Ace Hardware Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://acehardware.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "200",
    "name": "Viking Hardware",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / catalogues / clearance",
        "url": "https://viking.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "201",
    "name": "Masters Paint & Hardware",
    "category": "hardware",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "http://www.masters.co.zw/"
      },
      {
        "label": "Facebook specials",
        "url": "https://www.facebook.com/masterspaintnhardware/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/masterspaintnhardware/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "202",
    "name": "INGCO Tools Zimbabwe",
    "category": "hardware",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://ingcotools.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "203",
    "name": "Macdonald Bricks",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://macbricks.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "204",
    "name": "BSI Steel Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.bsisteel.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "205",
    "name": "Steel Centre Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / product catalogue",
        "url": "https://steelcentre.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "206",
    "name": "Willdale",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://willdale.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "207",
    "name": "Lamasat Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://lamasat.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "208",
    "name": "Roofing Materials Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://roofingmaterials.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "209",
    "name": "Dura World Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://duraworld.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "210",
    "name": "Steelmate Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://steelmate.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "211",
    "name": "HS Bricks",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://www.hsbricks.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "212",
    "name": "Royal Precast",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://royalprecast.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "213",
    "name": "YakhaSquare",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://yakhasquare.store/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "214",
    "name": "Zim Steel",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://zimsteel.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "215",
    "name": "Steel Horizon",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://steelhorizon.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "216",
    "name": "Vaka Concrete",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://vakaconcrete.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "217",
    "name": "Harare Quarry",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://www.hararequarry.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "218",
    "name": "Kingdom Paints Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://kingdompaints.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "219",
    "name": "DIY Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.diy.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "220",
    "name": "Itachi Plastics",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://itachiplastics.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "221",
    "name": "Zelpac",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / packaging products",
        "url": "https://zelpac.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "222",
    "name": "Power Seven Canvas",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://powersevencanvas.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "223",
    "name": "Cutting Edge Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://cuttingedge.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "224",
    "name": "Bluetek Generators",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://bluetek.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "225",
    "name": "Security Shop Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.securityshopzim.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "226",
    "name": "Established Security Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / security products",
        "url": "https://establishedsecurity.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "227",
    "name": "Security Distributors Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / product catalogue",
        "url": "https://secdis.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "228",
    "name": "Dencopal Systems",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://dencopal.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "229",
    "name": "Onel Electrical",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://www.onelelectrical.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "230",
    "name": "Amanat Electrical",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://amanatelectrical.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "231",
    "name": "SolarCity Zimbabwe",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.solarcity.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://www.solarcity.co.zw/shop"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "232",
    "name": "Infinity Solar Zimbabwe",
    "category": "hardware",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.infinitysolar.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://www.infinitysolar.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "233",
    "name": "Felicity Solar Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://www.felicitysolar.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "234",
    "name": "Frecon Solar",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://freconsolar.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "235",
    "name": "Taqon Electrico",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://taqon.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "236",
    "name": "Solar Shack Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://solarshack.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "237",
    "name": "Zonful Energy",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://zonfulenergy.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "238",
    "name": "Genking Power Services",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://genking.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "239",
    "name": "Clamore Power",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://clamorepower.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "240",
    "name": "Viconion",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.viconion.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "241",
    "name": "Huawei Distributor Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://huaweidistributor.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "242",
    "name": "E-Ultraled Electronics Zimbabwe",
    "category": "hardware",
    "status": [
      "C",
      "V"
    ],
    "links": [
      {
        "label": "Facebook product and promotion page",
        "url": "https://www.facebook.com/eultraled.electronics.solarsystem/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "243",
    "name": "Rakiten / Lithium Battery Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://rakiten.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "244",
    "name": "Proplastics Zimbabwe",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://www.proplastics.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "245",
    "name": "Autoworld 4x4",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online 4x4 accessories store",
        "url": "https://autoworld4x4.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "246",
    "name": "Big Sky Supplies",
    "category": "hardware",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Outdoor and 4x4 store",
        "url": "https://bigsky.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "247",
    "name": "Farm & City Centre",
    "category": "agriculture",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://farmandcity.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/farmandcitycentre/"
      },
      {
        "label": "Instagram promotions",
        "url": "https://www.instagram.com/farmandcityzw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "248",
    "name": "Profeeds Zimbabwe",
    "category": "agriculture",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.profeeds.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://www.profeeds.co.zw/products"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "249",
    "name": "Agricura",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://agricura.co.zw/"
      },
      {
        "label": "Shop",
        "url": "https://shop.agricura.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "250",
    "name": "ZFC Limited",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.zfc.co.zw/"
      },
      {
        "label": "Online store",
        "url": "https://zfcstore.com/"
      },
      {
        "label": "Shop",
        "url": "https://zfcstore.com/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "251",
    "name": "Seed Co Online Shop Zimbabwe",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://www.seedcoonlineshop.com/zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "252",
    "name": "National Tested Seeds",
    "category": "agriculture",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/nationaltestedseeds/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "253",
    "name": "Cropserve",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://cropserve.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://cropserve.co.zw/products/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "254",
    "name": "FeedMix",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://feedmix.co.zw/"
      },
      {
        "label": "Online product store",
        "url": "https://feedmix.co.zw/our-products/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "255",
    "name": "Novafeed Zimbabwe",
    "category": "agriculture",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://novafeed.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://novafeed.co.zw/all-products/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/novafeedzim/"
      },
      {
        "label": "Instagram promotions",
        "url": "https://www.instagram.com/novafeedzim/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "256",
    "name": "Zimplow",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://zimplow.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "257",
    "name": "Mealie Brand",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / implements",
        "url": "https://mealiebrand.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "258",
    "name": "Massey Ferguson Zimbabwe",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Tractors and implements",
        "url": "https://www.masseyferguson.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "259",
    "name": "DripTech Zimbabwe",
    "category": "agriculture",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Irrigation store",
        "url": "https://driptech.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "260",
    "name": "Capital Foods Zimbabwe",
    "category": "agriculture",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.capitalfoods.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/capitalfoods/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "261",
    "name": "Laptops Zimbabwe / Elite Laptops",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://laptop.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "262",
    "name": "Laptops Direct Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://laptopsdirect.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "263",
    "name": "FI Laptops",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.filaptops.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "264",
    "name": "LaptopZone Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://laptopzone.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "265",
    "name": "Recompute Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://recompute.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "266",
    "name": "GIZMO Tech Store",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://gizmotechstore.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "267",
    "name": "Magnet Zimbabwe",
    "category": "technology",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://magnet.co.zw/"
      },
      {
        "label": "Shop / sale items",
        "url": "https://magnet.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "268",
    "name": "Energy Electronics Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://energyelectronicszw.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "269",
    "name": "Techzim Shop",
    "category": "technology",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.techzim.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "270",
    "name": "Spellbound Mobile",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://spellboundmobile.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "271",
    "name": "SMT Technologies Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://smttechnologies.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "272",
    "name": "Gadgets Zone Zimbabwe",
    "category": "technology",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook deals",
        "url": "https://www.facebook.com/TheGadgetsZoneZimbabwe/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "273",
    "name": "999 Electronics Zimbabwe",
    "category": "technology",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Instagram deals",
        "url": "https://www.instagram.com/999electronicszimbabwe/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "274",
    "name": "iClik Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.iclik.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "275",
    "name": "First Pack Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://firstpack.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "276",
    "name": "Gtel Zimbabwe",
    "category": "technology",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website / devices",
        "url": "https://www.gtel.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "277",
    "name": "Switch Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://switch.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "278",
    "name": "Fusertech Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://fusertech.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "279",
    "name": "Innovative Technologies Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Shop",
        "url": "https://innovative.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "280",
    "name": "RanConnect",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Shop",
        "url": "https://ranconnect.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "281",
    "name": "Solution Centre Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://solutioncentre.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "282",
    "name": "Nyeredzi Global",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://nyeredzi.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "283",
    "name": "Nemstech",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://nemstech.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "284",
    "name": "iHelp Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / store",
        "url": "https://ihelp.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "285",
    "name": "Goldtech Electronics",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://goldtechelectronics.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "286",
    "name": "Foxgear Gaming",
    "category": "technology",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Gaming store",
        "url": "https://foxgear.org/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "287",
    "name": "The Copier Parts Company Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://copierparts.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "288",
    "name": "Digjet Enterprises",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://digjet.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "289",
    "name": "Canlink Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://canlink.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "290",
    "name": "Tech Africa Zimbabwe",
    "category": "technology",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://techafrica.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "291",
    "name": "Econet Wireless Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.econet.co.zw/"
      },
      {
        "label": "Deals and promotions",
        "url": "https://www.econet.co.zw/deals-and-promotions/"
      },
      {
        "label": "Devices",
        "url": "https://www.econet.co.zw/devices/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "292",
    "name": "NetOne Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.netone.co.zw/"
      },
      {
        "label": "Promotions",
        "url": "https://www.netone.co.zw/promotions"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "293",
    "name": "Telecel Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://telecel.co.zw/"
      },
      {
        "label": "Products",
        "url": "https://telecel.co.zw/products/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "294",
    "name": "TelOne Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.telone.co.zw/"
      },
      {
        "label": "Online shop",
        "url": "https://shop.telone.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "295",
    "name": "Liquid Home Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://zw.liquidhome.tech/"
      },
      {
        "label": "Promotion example",
        "url": "https://zw.liquidhome.tech/get-connected/lit-usd-bonus-bundles-promotion"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "296",
    "name": "Utande",
    "category": "telecoms",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://shop.utande.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "297",
    "name": "Powertel Communications",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.powertel.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "298",
    "name": "Telco Internet Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.telco.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "299",
    "name": "Moreplex TV Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / packages",
        "url": "https://zw.moreplextv.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "300",
    "name": "EcoCash Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.ecocash.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/EcoCashZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "301",
    "name": "OneMoney Zimbabwe",
    "category": "telecoms",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.onemoney.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/OneMoneyZw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "302",
    "name": "InnBucks",
    "category": "telecoms",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://innbucks.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/InnBucks/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "303",
    "name": "Zim Midas",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.zimmidas.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "304",
    "name": "National Tyre Services Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.ntsgroup.co.zw/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/ntslimited/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "305",
    "name": "Tiger Wheel & Tyre Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Online store / promotions",
        "url": "https://www.twt.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "306",
    "name": "Transerv Zimbabwe",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.transerv.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "307",
    "name": "Wholesale Spares",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.wspares.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "308",
    "name": "3 Way Auto Parts",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://www.3way.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "309",
    "name": "Kopje Spares",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://kopjespares.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "310",
    "name": "Real Grace Motor Spares",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://realgracemotorspares.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "311",
    "name": "TyreZim",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://tyrezim.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "312",
    "name": "CarPro Zimbabwe",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://carpro.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "313",
    "name": "Plawn Motors",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Vehicle sale listings",
        "url": "https://www.plawnmotors.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "314",
    "name": "Motor Torque Zimbabwe",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicles and products",
        "url": "https://motortorque.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "315",
    "name": "Autoworld Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicle offers",
        "url": "https://autoworld.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "316",
    "name": "Volksmaster",
    "category": "automotive",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online shop",
        "url": "https://volksmaster.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "317",
    "name": "ZIMOCO",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicle campaigns",
        "url": "https://www.zimoco.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "318",
    "name": "M.E. Parts Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook offers",
        "url": "https://www.facebook.com/p/ME-PARTS-100062977132916/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "319",
    "name": "CFAO Mobility Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicle offers",
        "url": "https://www.cfao.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "320",
    "name": "Croco Motors Zimbabwe",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicle offers",
        "url": "https://crocomotors.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "321",
    "name": "Duly’s Motors",
    "category": "automotive",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website / vehicle offers",
        "url": "https://dulys.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "322",
    "name": "Greenwood Wholesalers & Pharmacies",
    "category": "pharmacy",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.greenwoodwp.com/"
      },
      {
        "label": "Online shop",
        "url": "https://shop.greenwoodwp.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "323",
    "name": "Medicare Pharmacy Group Zimbabwe",
    "category": "pharmacy",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/MediCarePharmacyGroup/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "324",
    "name": "Bestzone Pharmacies",
    "category": "pharmacy",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://bestzonepharmacies.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "325",
    "name": "Shamrock Pharmacy Zimbabwe",
    "category": "pharmacy",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/ShamrockPharmacy/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "326",
    "name": "Corporate 24 Pharmacy / Medical Centre",
    "category": "pharmacy",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/corporate24medical/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "327",
    "name": "CAPS Zimbabwe",
    "category": "pharmacy",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://caps.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "328",
    "name": "Optinova Eyecare Zimbabwe",
    "category": "pharmacy",
    "status": [
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://optinovaeyecare.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "329",
    "name": "Diagnostic Laboratory Suppliers Zimbabwe",
    "category": "pharmacy",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / catalogue",
        "url": "https://diagnostic.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "330",
    "name": "KDB Healthcare",
    "category": "pharmacy",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / product catalogue",
        "url": "https://kdb.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "331",
    "name": "BAMM Stationers",
    "category": "books-and-gifts",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.bamm.co.zw/"
      },
      {
        "label": "Store catalogue",
        "url": "https://www.bamm.co.zw/store/catalogue/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "332",
    "name": "College Press Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "A",
      "B"
    ],
    "links": [
      {
        "label": "Catalogues and brochures",
        "url": "https://www.collegepress.co.zw/catalogues-and-brochures"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "333",
    "name": "Innov8 Bookshop",
    "category": "books-and-gifts",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/innov8bookshop/"
      }
    ],
    "automation": "social-reference"
  },
  {
    "id": "334",
    "name": "Secondary Book Press",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / books",
        "url": "https://www.secondarybookpress.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "335",
    "name": "House of Books Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online bookstore",
        "url": "https://houseofbookszim.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "336",
    "name": "Focal Point Photographic",
    "category": "books-and-gifts",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.focalpointonline.com/"
      },
      {
        "label": "Instagram specials",
        "url": "https://www.instagram.com/focal.point.photographic/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/fpzim/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "337",
    "name": "Printflow Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://printflow.co.zw/"
      },
      {
        "label": "Online shop",
        "url": "https://printflow.co.zw/shop/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "338",
    "name": "Signpro Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "A",
      "B",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://signpro.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/signprozw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "339",
    "name": "Premier Corporate Gifts",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online store",
        "url": "https://pcg.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "340",
    "name": "Sunflags Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Website / products",
        "url": "https://sunflags.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "341",
    "name": "Maruwa Florists",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online florist",
        "url": "https://maruwa.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "342",
    "name": "African Unique",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Online arts and gifts store",
        "url": "https://africanunique.com/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "343",
    "name": "Sewtex Zimbabwe",
    "category": "books-and-gifts",
    "status": [
      "B"
    ],
    "links": [
      {
        "label": "Sewing equipment and supplies",
        "url": "https://sewtex.co.zw/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "344",
    "name": "Puma Energy Zimbabwe",
    "category": "fuel-and-centres",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://pumaenergy.com/country/zimbabwe/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/PumaEnergyZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "345",
    "name": "TotalEnergies Zimbabwe",
    "category": "fuel-and-centres",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://totalenergies.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/TotalEnergiesZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "346",
    "name": "Zuva Petroleum",
    "category": "fuel-and-centres",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://zuva.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/ZuvaPetroleum/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "347",
    "name": "Trek Petroleum Zimbabwe",
    "category": "fuel-and-centres",
    "status": [
      "A",
      "C"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://trek.co.zw/"
      },
      {
        "label": "Facebook promotions",
        "url": "https://www.facebook.com/TrekZimbabwe/"
      }
    ],
    "automation": "direct"
  },
  {
    "id": "348",
    "name": "Sam Levy’s Village",
    "category": "fuel-and-centres",
    "status": [
      "C",
      "D"
    ],
    "links": [
      {
        "label": "Shopping-centre store directory",
        "url": "https://www.samlevysvillage.com/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "349",
    "name": "Arundel Village Shopping Centre",
    "category": "fuel-and-centres",
    "status": [
      "C",
      "D"
    ],
    "links": [
      {
        "label": "Shopping-centre store directory",
        "url": "https://www.arundelvillage.co.zw/"
      }
    ],
    "automation": "discovery"
  },
  {
    "id": "350",
    "name": "Fresh in a Box",
    "category": "verify-first",
    "status": [
      "V"
    ],
    "links": [
      {
        "label": "Older domain",
        "url": "https://freshinabox.co.zw/"
      },
      {
        "label": "Likely successor / current ordering route",
        "url": "https://tillpoint.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "351",
    "name": "Zimall",
    "category": "verify-first",
    "status": [
      "V"
    ],
    "links": [
      {
        "label": "Website",
        "url": "https://www.zimall.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "352",
    "name": "Pelhams Zimbabwe",
    "category": "verify-first",
    "status": [
      "V"
    ],
    "links": [
      {
        "label": "Older website",
        "url": "http://www.pelhams.co.zw/"
      }
    ],
    "automation": "verify-first"
  },
  {
    "id": "353",
    "name": "Arundel Village development shop page",
    "category": "verify-first",
    "status": [
      "V"
    ],
    "links": [
      {
        "label": "Development shop URL",
        "url": "https://dev.arundelvillage.co.zw/shop-2/"
      }
    ],
    "automation": "verify-first"
  }
] as const satisfies readonly ZimbabweSource[]

const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'wa.me',
  'whatsapp.com',
  'youtube.com',
] as const

const PROMOTION_SIGNAL =
  /\b(?:catalog(?:ue)?s?|brochures?|deals?|flyers?|leaflets?|offers?|promotions?|sale|specials?)\b/i
const SHOP_SIGNAL = /\b(?:catalog(?:ue)?|products?|shop|store)\b/i

function isSocialUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
    return SOCIAL_HOSTS.some((socialHost) =>
      host === socialHost || host.endsWith(`.${socialHost}`),
    )
  } catch {
    return true
  }
}

function linkPriority(link: ZimbabweSourceLink): number {
  const searchable = `${link.label} ${link.url}`
  if (PROMOTION_SIGNAL.test(searchable)) return 0
  if (SHOP_SIGNAL.test(searchable)) return 1
  return 2
}

function preferredAutomatedLink(
  source: ZimbabweSource,
): ZimbabweSourceLink | undefined {
  return source.links
    .filter((link) => !isSocialUrl(link.url))
    .map((link, index) => ({ index, link, priority: linkPriority(link) }))
    .sort((left, right) =>
      left.priority - right.priority || left.index - right.index,
    )[0]?.link
}

export function getZimbabweAutomatedRetailSources(): ZimbabweAutomatedRetailSource[] {
  return ZIMBABWE_SOURCE_DIRECTORY.flatMap((source) => {
    if (source.automation !== 'direct') return []

    const preferred = preferredAutomatedLink(source)
    if (!preferred) return []

    const isPromotionSource =
      source.status.some((status) => status === 'A') ||
      PROMOTION_SIGNAL.test(`${preferred.label} ${preferred.url}`)

    return [{
      kind: isPromotionSource ? 'specials' as const : 'store-finder' as const,
      label: preferred.label || (
        isPromotionSource ? 'Offers and catalogues' : 'Official Zimbabwe store'
      ),
      retailerName: source.name,
      url: preferred.url,
    }]
  })
}

export function getZimbabweCatalogueSourcePages(): ZimbabweCatalogueSourcePage[] {
  const seen = new Set<string>()

  return ZIMBABWE_SOURCE_DIRECTORY.flatMap((source) => {
    if (source.automation !== 'direct') return []

    return source.links.flatMap((link) => {
      if (
        isSocialUrl(link.url) ||
        !/\b(?:catalog(?:ue)?s?|brochures?|flyers?|leaflets?)\b/i.test(
          `${link.label} ${link.url}`,
        )
      ) {
        return []
      }

      const key = `${source.id}:${link.url}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{
        retailerName: source.name,
        sourceId: `zw-directory-${source.id}`,
        url: link.url,
      }]
    })
  })
}

export function getZimbabweDiscoverySources(): readonly ZimbabweSource[] {
  return ZIMBABWE_SOURCE_DIRECTORY.filter(
    (source) => source.automation === 'discovery',
  )
}

export function getZimbabweSocialReferenceSources(): readonly ZimbabweSource[] {
  return ZIMBABWE_SOURCE_DIRECTORY.filter(
    (source) => source.automation === 'social-reference',
  )
}
