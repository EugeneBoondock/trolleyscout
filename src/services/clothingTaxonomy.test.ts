import { describe, expect, it } from 'vitest'

import {
  audienceFor,
  canTryOn,
  garmentTypeFor,
  isApparel,
} from './clothingTaxonomy'

describe('clothing taxonomy', () => {
  it('keeps homeware and hardware out of the fitting room', () => {
    expect(isApparel('Slim fit denim jeans')).toBe(true)
    expect(isApparel('Ladies floral dress')).toBe(true)
    expect(isApparel('Full length dressing mirror')).toBe(false)
    expect(isApparel('Duvet cover set queen')).toBe(false)
    expect(isApparel('Sherpa fleece blanket')).toBe(false)
    expect(isApparel('Fitted sheet white')).toBe(false)
    expect(isApparel('Signature premium walls and ceilings per coat per litre'))
      .toBe(false)
    expect(isApparel('Wooden clothes hangers 10 pack')).toBe(false)
  })

  it('reads who a garment is for, kids winning over gendered words', () => {
    expect(audienceFor('Boys school shirt')).toBe('kids')
    expect(audienceFor('Girls summer dress')).toBe('kids')
    expect(audienceFor('Ladies blouse')).toBe('women')
    expect(audienceFor('Mens chino pants')).toBe('men')
    expect(audienceFor('Cotton t-shirt')).toBe('any')
  })

  it('spots children\'s clothing that never says child', () => {
    // Character licences and age markings are how kidswear is actually
    // titled; a plain word list read these as adult clothes and put nappy-age
    // outfits in front of grown shoppers.
    expect(audienceFor('Paw Patrol Marshall Striped T-Shirt')).toBe('kids')
    expect(audienceFor('Pink Kuromi Bubble Dress')).toBe('kids')
    expect(audienceFor('Bluey Fleece Hoodie')).toBe('kids')
    expect(audienceFor('Cotton Tee 5-6y')).toBe('kids')
    expect(audienceFor('Vest 3-6 months')).toBe('kids')
    expect(audienceFor('Denim Shorts Age 8')).toBe('kids')
    // Adult clothing keeps its own audience.
    expect(audienceFor('Ladies Floral Blouse')).toBe('women')
    expect(audienceFor('Mens Slim Chino')).toBe('men')
    // A size range that is not an age must not read as kids.
    expect(audienceFor('Ladies Socks Size 4-7')).toBe('women')
  })

  it('keeps the sewing word out of the Disney list', () => {
    // "Stitch" is a seam far more often than it is a cartoon, and reading it
    // as one put men's tees and sandals in front of parents shopping for kids.
    expect(audienceFor('RVCA Mens Contrast Stitch Dad Hat')).toBe('men')
    expect(audienceFor('Stitch Detail Single Band Sandal')).toBe('any')
    expect(audienceFor('Lilo & Stitch Pyjama Set')).toBe('kids')
  })

  it('names the shoes and garments shops actually list', () => {
    // These titles carried no word the taxonomy knew, so they fell through to
    // whatever the shop was assumed to sell and the type filter missed them.
    expect(garmentTypeFor('Girls Blossom Strip Clog - Cream')).toBe('footwear')
    expect(garmentTypeFor('Croc Patent Full Court High Heel')).toBe('footwear')
    expect(garmentTypeFor('Pointy Studded Mary Jane Push In Pump')).toBe('footwear')
    expect(garmentTypeFor('Christelle 8 B2 Bootie - Black')).toBe('footwear')
    expect(garmentTypeFor('Boxy Cord Shacket With Gold Shanks')).toBe('outerwear')
    expect(garmentTypeFor('Sleeveless Knitwear Waistcoat')).toBe('outerwear')
    expect(garmentTypeFor('Pull On Jeggings Dark Blue')).toBe('bottoms')
    expect(garmentTypeFor('Green Wideleg Jogger Trackpants')).toBe('bottoms')
    expect(garmentTypeFor('Hi-Rise Turnup Cigarette Denim')).toBe('bottoms')
    expect(garmentTypeFor('3 Pack Lace G-String - Black')).toBe('underwear')
    expect(garmentTypeFor('Straight Leg Rib Sleep Pant')).toBe('underwear')
    expect(garmentTypeFor('Elle Woven Tote - Black')).toBe('accessories')
    expect(garmentTypeFor('Half Daisy Statement Earring')).toBe('accessories')
    // A short sleeve is not a bottom.
    expect(garmentTypeFor('Short Sleeve Cotton Shirt')).toBe('tops')
  })

  it('turns away the phones and lunchboxes general shops stock', () => {
    // PEP and Ackermans sell clothing beside electronics, and an assumed shop
    // type carried the rest of the aisle onto the rail.
    expect(isApparel('Galaxy A06 Black Smartphone')).toBe(false)
    expect(isApparel('Salmon Pink Wireless Earbuds')).toBe(false)
    expect(isApparel('Seasons soft water flask')).toBe(false)
    expect(isApparel('Hot Wheels Lunch Bag')).toBe(false)
    expect(isApparel('Bathu Gift Card')).toBe(false)
    expect(isApparel('Legit Beauty Hair Wax Stick')).toBe(false)
    // Real clothing with an unlucky word stays.
    expect(isApparel("Women's Maasai Maxi Pencil Skirt")).toBe(true)
    expect(isApparel('Luella Embossed Shopper with Laptop Bag')).toBe(true)
  })

  it('sorts garments into the shape a shopper filters by', () => {
    expect(garmentTypeFor('Denim jacket')).toBe('outerwear')
    expect(garmentTypeFor('Slim fit jeans')).toBe('bottoms')
    expect(garmentTypeFor('Canvas sneakers')).toBe('footwear')
    expect(garmentTypeFor('Floral maxi dress')).toBe('dresses')
    expect(garmentTypeFor('Cotton t-shirt')).toBe('tops')
    expect(garmentTypeFor('Leather belt')).toBe('accessories')
  })

  it('reads a sneaker cut as footwear, never as a shirt', () => {
    // "High Top" is a shoe. Tagged as a top it would offer a torso try-on
    // for something worn on the feet.
    expect(garmentTypeFor('Journey 2.0 High Top - Black & White')).toBe('footwear')
    expect(garmentTypeFor('Low Top Canvas')).toBe('footwear')
    expect(canTryOn(garmentTypeFor('Journey 2.0 High Top'))).toBe(false)
    // A genuine top still reads as one.
    expect(garmentTypeFor('Ribbed crop top')).toBe('tops')
  })

  it('offers try-on only for garments a model can dress a body in', () => {
    expect(canTryOn(garmentTypeFor('Cotton t-shirt'))).toBe(true)
    expect(canTryOn(garmentTypeFor('Denim jacket'))).toBe(true)
    expect(canTryOn(garmentTypeFor('Canvas sneakers'))).toBe(false)
    expect(canTryOn(garmentTypeFor('Leather belt'))).toBe(false)
  })

  it('agrees with the app on the same titles', () => {
    // These mirror mobile/test/clothing_filters_test.dart so the two sides of
    // the wire can never drift into different answers.
    expect(garmentTypeFor('Ladies floral dress')).toBe('dresses')
    expect(audienceFor('Ladies floral dress')).toBe('women')
    expect(isApparel('Full cream milk 2L')).toBe(false)
  })
})

describe('the deal feed is mostly groceries', () => {
  it('keeps the food out of the fitting room', () => {
    // Found on the live rail: a Winn Dixie grocery special shelved as a
    // clothing accessory, because "Bag" was an accessory word. The fitting
    // room now reads the ordinary deal feed, which is full of titles like
    // this, so the bar has to hold against them.
    expect(
      isApparel('3 lb Bag Know & Love Yellow Onions or 5 lb Bag Russet Potatoes'),
    ).toBe(false)
    expect(isApparel('Frozen Chicken Braaipack 5kg')).toBe(false)
    expect(isApparel('Onion Rings 500g')).toBe(false)
    expect(isApparel('Coca-Cola 2L Bottle')).toBe(false)
    expect(isApparel('Albany White Bread 700g')).toBe(false)
  })

  it('still keeps the bags people actually wear', () => {
    // The fix is specific: bare "bag" goes, the named ones stay.
    expect(garmentTypeFor('Luella Embossed Shopper with Laptop Bag'))
      .toBe('accessories')
    expect(garmentTypeFor('Elle Woven Tote - Black')).toBe('accessories')
    expect(garmentTypeFor('Canvas Backpack Navy')).toBe('accessories')
    expect(garmentTypeFor('Leather Handbag')).toBe('accessories')
  })
})

describe('reading a feed that is not a clothing shop', () => {
  /// The gate the deal harvest actually applies.
  const shelved = (title: string) =>
    isApparel(title) && garmentTypeFor(title, { strict: true }) !== 'any'

  it('turns away what the fitting room was actually showing', () => {
    // All four were live on the rail. Each got in on a single ordinary word:
    // a microwave is a "counter top", bottled water and hand wash both have a
    // "pump", a laptop case is a "sleeve". Safe in a clothing catalogue,
    // wrong in a feed that is mostly groceries and appliances.
    expect(shelved('Kenmore 0.7-Cu.-Ft. Counter Top Microwave Oven')).toBe(false)
    expect(shelved('BONAQUA PUMP WATER LEMON 750, ML')).toBe(false)
    expect(shelved('Dettol Skincare Hand Wash Pump + Refill')).toBe(false)
    expect(shelved('Volkano Wrap series 14-1inch Laptop Sleeve')).toBe(false)
  })

  it('still shelves the clothes in that same feed', () => {
    expect(shelved('Mens Slim Fit Denim Jeans')).toBe(true)
    expect(shelved('Ladies Floral Maxi Dress')).toBe(true)
    expect(shelved('Canvas Sneakers White')).toBe(true)
    expect(shelved('Denim Jacket Blue')).toBe(true)
  })

  it('reads a clothing shop exactly as before', () => {
    // Strict mode is only for feeds that are not clothing shops. A real shop
    // page still gets the ambiguous words, so a crop top is a top there.
    expect(garmentTypeFor('Ribbed Crop Top')).toBe('tops')
    expect(garmentTypeFor('Court Pump Black Heel')).toBe('footwear')
    // ...and the same words alone prove nothing in the deal feed.
    expect(garmentTypeFor('Ribbed Crop Top', { strict: true })).toBe('any')
  })
})
