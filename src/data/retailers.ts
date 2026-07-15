import type { Retailer } from '../types'

export const sourceVerifiedOn = '2026-07-01'

export const retailers: Retailer[] = [
  {
    id: 'pick-n-pay',
    name: 'Pick n Pay',
    shortName: 'PnP',
    group: 'Supermarket',
    program: 'Smart Shopper',
    sourceNote: 'Official Smart Shopper, catalogue, and online-specials pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#d71920',
    sources: [
      {
        label: 'Smart Shopper',
        url: 'https://www.pnp.co.za/smart-shopper',
        kind: 'loyalty',
      },
      {
        label: 'Catalogues',
        url: 'https://www.pnp.co.za/catalogues',
        kind: 'specials',
      },
      {
        label: 'Online specials',
        url: 'https://www.pnp.co.za/online-specials',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'checkers',
    name: 'Checkers',
    shortName: 'Checkers',
    group: 'Supermarket',
    program: 'Xtra Savings',
    sourceNote: 'Official promotion and Xtra Savings pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#009fe3',
    sources: [
      {
        label: 'On promotion',
        url: 'https://www.checkers.co.za/merchandised-page/on-promotion.html',
        kind: 'specials',
      },
      {
        label: 'Xtra Savings card',
        url: 'https://www.checkers.co.za/product/xtra-savings-rewards-card-10686038EA',
        kind: 'loyalty',
      },
    ],
  },
  {
    id: 'shoprite',
    name: 'Shoprite',
    shortName: 'Shoprite',
    group: 'Supermarket',
    program: 'Xtra Savings',
    sourceNote: 'Official rewards, store leaflet, and product offer pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#e31b23',
    sources: [
      {
        label: 'Store leaflets',
        url: 'https://www.shoprite.co.za/store-directory-and-leaflets',
        kind: 'specials',
      },
      {
        label: 'Xtra Savings card',
        url: 'https://www.shoprite.co.za/product/xtra-savings-rewards-card-10686038EA',
        kind: 'loyalty',
      },
      {
        label: 'Xtra Savings help',
        url: 'https://www.shoprite.co.za/help-me/help-and-support/xtra-savings-what-is-xtra-savings',
        kind: 'loyalty',
      },
    ],
  },
  {
    id: 'woolworths',
    name: 'Woolworths',
    shortName: 'Woolies',
    group: 'Supermarket',
    program: 'WRewards',
    sourceNote: 'Official WRewards instant savings and voucher pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#1f2933',
    sources: [
      {
        label: 'WRewards savings',
        url: 'https://www.woolworths.co.za/content/article/wrewards-inspirational-videos/wrewards-instant-savings/_/A-cmp210372',
        kind: 'loyalty',
      },
      {
        label: 'WRewards vouchers',
        url: 'https://www.woolworths.co.za/content/article/wrewards/vouchers/_/A-cmp204081',
        kind: 'app',
      },
    ],
  },
  {
    id: 'spar',
    name: 'SPAR',
    shortName: 'SPAR',
    group: 'Supermarket',
    program: 'SPAR Rewards',
    sourceNote: 'Official rewards, specials, and rewards app pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#00843d',
    sources: [
      {
        label: 'SPAR Rewards',
        url: 'https://www.spar.co.za/SPAR-Rewards',
        kind: 'loyalty',
      },
      {
        label: 'SPAR specials',
        url: 'https://www.spar.co.za/specials',
        kind: 'specials',
      },
      {
        label: 'SPAR app',
        url: 'https://www.spar.co.za/rewards-app',
        kind: 'app',
      },
    ],
  },
  {
    id: 'boxer',
    name: 'Boxer',
    shortName: 'Boxer',
    group: 'Value grocer',
    program: 'Boxer Rewards Club',
    sourceNote: 'Official promotions, Rewards Club, and eCoupons pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#f15a24',
    sources: [
      {
        label: 'Promotions',
        url: 'https://www.boxer.co.za/promotions',
        kind: 'specials',
      },
      {
        label: 'Rewards Club',
        url: 'https://www.boxer.co.za/news/the-boxer-rewards-club-is-here',
        kind: 'loyalty',
      },
      {
        label: 'eCoupons',
        url: 'https://www.boxer.co.za/money-kiosk/boxer-ecoupons',
        kind: 'app',
      },
    ],
  },
  {
    id: 'food-lovers',
    name: 'Food Lovers Market',
    shortName: 'Food Lovers',
    group: 'Fresh market',
    program: 'Market specials',
    sourceNote: 'Official Food Lovers Market specials entry point.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#78a22f',
    sources: [
      {
        label: 'Specials',
        url: 'https://foodloversmarket.co.za/',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'makro',
    name: 'Makro',
    shortName: 'Makro',
    group: 'Wholesale',
    program: 'mRewards',
    sourceNote: 'Official mRewards and customer-service pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#102a83',
    sources: [
      {
        label: 'mRewards deals',
        url: 'https://business.makro.co.za/mRewardsdeals',
        kind: 'loyalty',
      },
      {
        label: 'Payment and rewards',
        url: 'https://business.makro.co.za/customer-service/payment-types',
        kind: 'loyalty',
      },
    ],
  },
  {
    id: 'dis-chem',
    name: 'Dis-Chem',
    shortName: 'Dis-Chem',
    group: 'Pharmacy',
    program: 'Better Rewards',
    sourceNote: 'Official Better Rewards and on-promotion pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#135c2c',
    sources: [
      {
        label: 'Better Rewards',
        url: 'https://www.dischem.co.za/better-reward',
        kind: 'loyalty',
      },
      {
        label: 'On promotion',
        url: 'https://www.dischem.co.za/on-promotion',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'clicks',
    name: 'Clicks',
    shortName: 'Clicks',
    group: 'Pharmacy',
    program: 'ClubCard',
    sourceNote: 'Official ClubCard and My ClubCard Deals pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#00a3e0',
    sources: [
      {
        label: 'ClubCard',
        url: 'https://clicks.co.za/clubcard',
        kind: 'loyalty',
      },
      {
        label: 'My ClubCard Deals',
        url: 'https://clicks.co.za/Myclubcard-deals',
        kind: 'app',
      },
      {
        label: 'Promotions',
        url: 'https://clicks.co.za/promotions',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'usave',
    name: 'Usave',
    shortName: 'Usave',
    group: 'Value grocer',
    program: 'Usave specials',
    sourceNote: 'Official Usave specials and store locator pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#f7c600',
    sources: [
      {
        label: 'Specials',
        url: 'https://www.usave.co.za/specials.html',
        kind: 'specials',
      },
      {
        label: 'Store locator',
        url: 'https://www.usave.co.za/store-locator.html',
        kind: 'store-finder',
      },
    ],
  },
  {
    id: 'ok-foods',
    name: 'OK Foods',
    shortName: 'OK',
    group: 'Supermarket',
    program: 'OK specials',
    sourceNote: 'Official OK Foods specials and store finder pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#005baa',
    sources: [
      {
        label: 'Specials',
        url: 'https://www.okfoods.co.za/specials.html',
        kind: 'specials',
      },
      {
        label: 'Store finder',
        url: 'https://www.okfoods.co.za/find-a-store.html',
        kind: 'store-finder',
      },
    ],
  },
  {
    id: 'takealot',
    name: 'Takealot',
    shortName: 'Takealot',
    group: 'Marketplace',
    program: 'Deals and TakealotMORE',
    sourceNote: 'Official Takealot deals and TakealotMORE savings pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#0b79bf',
    sources: [
      {
        label: 'Deals',
        url: 'https://www.takealot.com/deals',
        kind: 'specials',
      },
      {
        label: 'Household deals',
        url: 'https://www.takealot.com/deals?filter=Type:34',
        kind: 'specials',
      },
      {
        label: 'Deals and promotions',
        url: 'https://www.takealot.com/deals--promotions',
        kind: 'specials',
      },
      {
        label: 'TakealotMORE',
        url: 'https://www.takealot.com/takealotmore',
        kind: 'loyalty',
      },
    ],
  },
  {
    id: 'amazon-za',
    name: 'Amazon South Africa',
    shortName: 'Amazon ZA',
    group: 'Marketplace',
    program: 'Deals, vouchers, and Prime',
    sourceNote: 'Official Amazon South Africa deals, vouchers, and Prime pages.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#ff9900',
    sources: [
      {
        label: 'Deals',
        url: 'https://www.amazon.co.za/deals',
        kind: 'specials',
      },
      {
        label: 'Vouchers',
        url: 'https://www.amazon.co.za/coupons',
        kind: 'app',
      },
      {
        label: 'Prime',
        url: 'https://www.amazon.co.za/amazonprime',
        kind: 'loyalty',
      },
    ],
  },
  {
    id: 'game',
    name: 'Game',
    shortName: 'Game',
    group: 'General retailer',
    program: 'Promotions',
    sourceNote: 'Official Game promotion page.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#d71920',
    sources: [
      {
        label: 'On promotion',
        url: 'https://www.game.co.za/on-promotion',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'builders',
    name: 'Builders',
    shortName: 'Builders',
    group: 'General retailer',
    program: 'Promotions',
    sourceNote: 'Official Builders promotion page.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#f68b1f',
    sources: [
      {
        label: 'Promotions',
        url: 'https://www.builders.co.za/promotions',
        kind: 'specials',
      },
    ],
  },
  {
    id: 'yuppiechef',
    name: 'Yuppiechef',
    shortName: 'Yuppiechef',
    group: 'Homeware',
    program: 'On promotion',
    sourceNote: 'Official Yuppiechef promotion page with static product cards.',
    verifiedOn: sourceVerifiedOn,
    accentColor: '#2f3337',
    sources: [
      {
        label: 'Specials',
        url: 'https://www.yuppiechef.com/specials.htm',
        kind: 'specials',
      },
    ],
  },
]

export const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]))
