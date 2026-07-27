import type { Retailer, RetailerGroup, SourceKind } from '../types'

interface CataloguePlatformRetailerDefinition {
  accentColor?: string
  group: RetailerGroup
  id: string
  kind?: SourceKind
  name: string
  shortName?: string
  url: string
}

const verifiedOn = '2026-07-26'

const groupAccent: Record<RetailerGroup, string> = {
  Fashion: '#2f3136',
  'Fresh market': '#247a45',
  'General retailer': '#325f8f',
  Homeware: '#9a5a35',
  Marketplace: '#b54a38',
  Pharmacy: '#32736b',
  'Sports and outdoors': '#2f6d58',
  Supermarket: '#c23b31',
  Wholesale: '#8b5f32',
  'Value grocer': '#b54437',
}

const source = (
  id: string,
  name: string,
  group: RetailerGroup,
  url: string,
  options: Omit<CataloguePlatformRetailerDefinition, 'group' | 'id' | 'name' | 'url'> = {},
): CataloguePlatformRetailerDefinition => ({
  id,
  name,
  group,
  url,
  ...options,
})

// Kimbino and Catalogue Specials are used only to identify retailer coverage
// gaps. Every link below points to the retailer or its appointed storefront.
const cataloguePlatformRetailerDefinitions: CataloguePlatformRetailerDefinition[] = [
  source('one-up-cash-and-carry', '1UP Cash & Carry', 'Wholesale', 'https://www.1uponline.co.za/'),
  source('africa-cash-and-carry', 'Africa Cash & Carry', 'Wholesale', 'https://www.africacashandcarry.co.za/'),
  source('big-save', 'Big Save', 'Wholesale', 'https://www.bigsave.co.za/'),
  source('bluff-meat-supply', 'Bluff Meat Supply', 'Fresh market', 'https://bluffmeatsupply.co.za/'),
  source('check-save', 'Check Save', 'Value grocer', 'https://checksave.co.za/'),
  source('checkstar', 'Checkstar', 'Value grocer', 'https://checkstar.co.za/'),
  source('devland', 'Devland', 'Value grocer', 'https://devland.co.za/'),
  source('diamond-discount-liquors', 'Diamond Discount Liquors', 'General retailer', 'https://diamondliquors.co.za/'),
  source('jumbo-cash-and-carry', 'Jumbo Cash & Carry', 'Wholesale', 'https://www.jumbo.co.za/'),
  source('kit-kat-cash-and-carry', 'KIT KAT Cash & Carry', 'Wholesale', 'https://kitkatgroup.com/specials/'),
  source('oxford-freshmarket', 'Oxford Freshmarket', 'Fresh market', 'https://oxfordfreshmarket.co.za/'),
  source('president-hyper', 'President Hyper', 'Value grocer', 'https://presidenthyper.co.za/'),
  source('save', 'Save', 'Value grocer', 'https://save.co.za/'),
  source('saverite', 'Saverite', 'Value grocer', 'https://www.saverite.co.za/'),
  source('super-save', 'Super Save', 'Value grocer', 'https://supersave.co.za/'),
  source('take-n-pay', 'Take n Pay', 'Value grocer', 'https://takenpay.co.za/'),
  source('the-total-store', 'The Total Store', 'General retailer', 'https://thetotalstore.co.za/'),
  source('ultra-liquors', 'Ultra Liquors', 'General retailer', 'https://www.ultraliquors.co.za/'),

  source('cash-crusaders', 'Cash Crusaders', 'General retailer', 'https://www.cashcrusaders.co.za/'),
  source('cell-c', 'Cell C', 'General retailer', 'https://www.cellc.co.za/cell-c-deals'),
  source('cellucity', 'Cellucity', 'General retailer', 'https://cellucity.co.za/'),
  source('hifi-corp', 'HiFi Corp', 'General retailer', 'https://www.hificorp.co.za/'),
  source('hirschs', 'Hirsch’s', 'General retailer', 'https://www.hirschs.co.za/'),
  source('mtn', 'MTN', 'General retailer', 'https://www.mtn.co.za/shop/deals/'),
  source('rain', 'rain', 'General retailer', 'https://www.rain.co.za/'),
  source('telkom', 'Telkom', 'General retailer', 'https://www.telkom.co.za/deals'),
  source('vodacom', 'Vodacom', 'General retailer', 'https://www.vodacom.co.za/shopping/deals'),
  source('computer-mania', 'Computer Mania', 'General retailer', 'https://computermania.co.za/'),
  source('matrix-warehouse', 'Matrix Warehouse', 'General retailer', 'https://matrixwarehouse.co.za/'),
  source('incredible-connection', 'Incredible Connection', 'General retailer', 'https://www.incredible.co.za/'),
  source('bt-games', 'BT Games', 'General retailer', 'https://btgames.co.za/'),
  source('teljoy', 'Teljoy', 'General retailer', 'https://www.teljoy.co.za/'),

  source('adendorff', 'Adendorff', 'Homeware', 'https://www.adendorff.co.za/'),
  source('agrimark', 'Agrimark', 'Homeware', 'https://www.agrimark.co.za/'),
  source('beares', 'Beares', 'Homeware', 'https://www.beares.co.za/'),
  source('bradlows', 'Bradlows', 'Homeware', 'https://www.bradlows.co.za/'),
  source('brights-hardware', 'Brights Hardware', 'Homeware', 'https://www.brights.co.za/'),
  source('buco', 'BUCO', 'Homeware', 'https://www.buco.co.za/'),
  source('build-it', 'Build It', 'Homeware', 'https://www.buildit.co.za/'),
  source('cashbuild', 'Cashbuild', 'Homeware', 'https://www.cashbuild.co.za/'),
  source('chamberlains', 'Chamberlains', 'Homeware', 'https://www.chamberlains.co.za/'),
  source('coricraft', 'Coricraft', 'Homeware', 'https://coricraft.co.za/'),
  source('crazy-plastics', 'Crazy Plastics', 'Homeware', 'https://crazyplastics.co.za/'),
  source('ctm', 'CTM', 'Homeware', 'https://www.ctm.co.za/'),
  source('decofurn', 'Decofurn', 'Homeware', 'https://decofurnsa.co.za/'),
  source('furnmart', 'Furnmart', 'Homeware', 'https://www.furnmart.co.za/'),
  source('gelmar', 'Gelmar', 'Homeware', 'https://www.gelmar.co.za/'),
  source('house-and-home', 'House & Home', 'Homeware', 'https://www.houseandhome.co.za/'),
  source('k-carrim', 'K. Carrim', 'Homeware', 'https://www.kcarrim.co.za/'),
  source('laduma-hardware', 'Laduma Hardware', 'Homeware', 'https://ladumahardware.co.za/'),
  source('leroy-merlin', 'Leroy Merlin', 'Homeware', 'https://leroymerlin.co.za/'),
  source('lewis-stores', 'Lewis Stores', 'Homeware', 'https://www.lewisstores.co.za/'),
  source('mica', 'Mica', 'Homeware', 'https://www.mica.co.za/'),
  source('mrp-home', 'MRP Home', 'Homeware', 'https://www.mrphome.com/'),
  source('ok-furniture', 'OK Furniture', 'Homeware', 'https://www.okfurniture.co.za/'),
  source('russells', 'Russells', 'Homeware', 'https://www.russells.co.za/'),
  source('schulmans-home', 'Schulman’s Home', 'Homeware', 'https://www.schulmanshome.co.za/'),
  source('sheet-street', 'Sheet Street', 'Homeware', 'https://www.sheetstreet.com/'),
  source('sleepmasters', 'Sleepmasters', 'Homeware', 'https://www.sleepmasters.co.za/'),
  source('tafelberg-furnishers', 'Tafelberg Furnishers', 'Homeware', 'https://www.tafelberg.co.za/'),
  source('volpes', 'Volpes', 'Homeware', 'https://www.volpes.co.za/'),
  source('dial-a-bed', 'Dial-a-Bed', 'Homeware', 'https://www.dialabed.co.za/'),
  source('discount-decor', 'Discount Decor', 'Homeware', 'https://discountdecor.co.za/'),
  source('home-corp', 'Home Corp', 'Homeware', 'https://www.homecorp.co.za/'),
  source('homechoice', 'HomeChoice', 'Homeware', 'https://www.homechoice.co.za/'),

  source('ackermans', 'Ackermans', 'Fashion', 'https://www.ackermans.co.za/'),
  source('foschini', 'Foschini', 'Fashion', 'https://bash.com/foschini'),
  source('jet', 'Jet', 'Fashion', 'https://bash.com/jet/sale', { accentColor: '#ed1b2f' }),
  source('markham', 'Markham', 'Fashion', 'https://bash.com/markham'),
  source('mrp-sport', 'MRP Sport', 'Sports and outdoors', 'https://www.mrpsport.com/'),
  source('spitz', 'Spitz', 'Fashion', 'https://bash.com/spitz'),
  source('sterns', 'Sterns', 'Fashion', 'https://bash.com/sterns'),

  source('avon', 'Avon', 'Pharmacy', 'https://my.avon.co.za/'),
  source('justine', 'Justine', 'Pharmacy', 'https://www.justine.co.za/'),
  source('autozone', 'AutoZone', 'General retailer', 'https://www.autozone.co.za/'),
  source('babies-r-us', 'Babies R Us', 'General retailer', 'https://www.babiesrus.co.za/'),
  source('baby-city', 'Baby City', 'General retailer', 'https://www.babycity.co.za/'),
  source('crazy-store', 'The Crazy Store', 'General retailer', 'https://www.crazystore.co.za/'),
  source('temu', 'Temu', 'Marketplace', 'https://www.temu.com/za'),
  source('toys-r-us', 'Toys R Us', 'General retailer', 'https://www.toysrus.co.za/'),
  source('tupperware', 'Tupperware', 'Homeware', 'https://www.tupperware.co.za/'),
  source('aliexpress', 'AliExpress', 'Marketplace', 'https://www.aliexpress.com/'),

  source('j-and-e-cash-and-carry', 'J&E Cash and Carry', 'Wholesale', 'https://jecashandcarry.co.za/'),
  source('three-star-cash-and-carry', 'Three Star Cash and Carry', 'Wholesale', 'https://threestarcashandcarry.co.za/'),
  source('ok-urban', 'OK Urban', 'Value grocer', 'https://www.okurban.co.za/'),
]

export const cataloguePlatformRetailers: Retailer[] =
  cataloguePlatformRetailerDefinitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    shortName: definition.shortName ?? definition.name,
    group: definition.group,
    program: `${definition.name} offers`,
    sourceNote: `Official ${definition.name} store, deals, or catalogue source.`,
    verifiedOn,
    accentColor: definition.accentColor ?? groupAccent[definition.group],
    sources: [
      {
        label: definition.kind === 'store-finder' ? 'Official store' : 'Official deals',
        url: definition.url,
        kind: definition.kind ?? 'specials',
      },
    ],
  }))
