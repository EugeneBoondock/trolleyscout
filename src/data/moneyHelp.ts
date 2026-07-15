// Fact-checked money help content for South African households.
// Every entry carries the official source URL and the date it was checked,
// following the same source-first policy as verified offers.

export interface SocialGrant {
  id: string
  name: string
  monthlyAmountCents: number
  amountNote?: string
  whoQualifies: string
  howToApply: string
  officialUrl: string
}

export interface MoneyGuideStep {
  text: string
}

export interface MoneyGuide {
  id: string
  title: string
  summary: string
  steps: string[]
  officialLinks: Array<{ label: string; url: string }>
}

export interface FoodBasketBenchmark {
  label: string
  month: string
  totalCents: number
  sourceName: string
  sourceUrl: string
  note: string
}

// Amounts effective 1 April 2026, confirmed by the Department of Social
// Development. Checked 2026-07-15.
export const GRANTS_EFFECTIVE_FROM = '2026-04-01'
export const GRANTS_CHECKED_ON = '2026-07-15'

export const socialGrants: SocialGrant[] = [
  {
    id: 'child-support',
    name: 'Child Support Grant',
    monthlyAmountCents: 58000,
    whoQualifies:
      'The main caregiver of a child under 18. You do not have to be the biological parent. Income limits apply.',
    howToApply:
      'Apply free at any SASSA office with your ID and the child’s birth certificate. If you do not have documents, you may still apply with an affidavit.',
    officialUrl: 'https://sassa.gov.za/social-grants/child-support-grant',
  },
  {
    id: 'older-persons',
    name: 'Older Persons Grant (pension)',
    monthlyAmountCents: 240000,
    amountNote: 'People older than 75 receive a small top-up. Confirm the exact amount with SASSA.',
    whoQualifies: 'South Africans 60 and older who pass the means test.',
    howToApply: 'Apply free at any SASSA office with your ID. A family member can apply for you with a doctor’s note if you cannot travel.',
    officialUrl: 'https://sassa.gov.za/social-grants/older-person-grants',
  },
  {
    id: 'disability',
    name: 'Disability Grant',
    monthlyAmountCents: 240000,
    whoQualifies:
      'Adults 18–59 with a physical or mental disability confirmed by a medical assessment, who pass the means test.',
    howToApply: 'Apply free at a SASSA office. SASSA arranges the medical assessment at no cost to you.',
    officialUrl: 'https://sassa.gov.za/social-grants/disability-grant',
  },
  {
    id: 'foster-child',
    name: 'Foster Child Grant',
    monthlyAmountCents: 129000,
    whoQualifies: 'Foster parents with a court order placing the child in their care.',
    howToApply: 'Apply free at a SASSA office with the court order and both IDs.',
    officialUrl: 'https://sassa.gov.za/social-grants/foster-child-grant',
  },
  {
    id: 'care-dependency',
    name: 'Care Dependency Grant',
    monthlyAmountCents: 240000,
    whoQualifies:
      'Caregivers of a child with a severe disability who needs full-time care, confirmed by a medical assessment.',
    howToApply: 'Apply free at a SASSA office. This can be paid on top of other income within the means test.',
    officialUrl: 'https://sassa.gov.za/social-grants/care-dependancy-grant',
  },
  {
    id: 'grant-in-aid',
    name: 'Grant-in-Aid',
    monthlyAmountCents: 58000,
    whoQualifies:
      'People already receiving an Older Persons, Disability, or War Veterans grant who need full-time care from someone else.',
    howToApply: 'Ask for it at SASSA when you apply for, or already receive, one of the qualifying grants. Many people never claim this extra amount.',
    officialUrl: 'https://sassa.gov.za/social-grants/grant-in-aid',
  },
  {
    id: 'srd',
    name: 'SRD Grant (R370)',
    monthlyAmountCents: 37000,
    whoQualifies:
      'Adults 18–59 with no income and no other grant (Child Support Grant caregivers can still apply for themselves).',
    howToApply:
      'Apply online free at srd.sassa.gov.za or on WhatsApp (082 046 8553). You never need to pay anyone to apply or to check a status.',
    officialUrl: 'https://srd.sassa.gov.za/',
  },
]

export const foodBasketBenchmark: FoodBasketBenchmark = {
  label: 'Average household food basket',
  month: 'June 2026',
  totalCents: 550242,
  sourceName: 'PMBEJD Household Affordability Index',
  sourceUrl: 'https://pmbejd.org.za/index.php/household-affordability-index/',
  note: 'Tracked monthly across 44 basic foods at supermarkets and butcheries that serve low-income households in Johannesburg, Durban, Cape Town, Pietermaritzburg, Mtubatuba, and Springbok.',
}

// Zero-rated foods carry no VAT by law. If VAT appears on these items on a
// till slip, the store is charging incorrectly.
export const zeroRatedFoods: string[] = [
  'Brown bread',
  'Maize meal',
  'Samp',
  'Mealie rice',
  'Dried mealies',
  'Dried beans',
  'Lentils',
  'Tinned pilchards',
  'Milk powder',
  'Dairy powder blend',
  'Rice',
  'Fresh vegetables',
  'Fresh fruit',
  'Vegetable oil',
  'Milk',
  'Cultured milk (amasi)',
  'Brown wheaten meal',
  'Eggs',
  'Edible legumes',
  'Cake flour',
  'Bread flour',
  'Sanitary pads',
]

export const moneyGuides: MoneyGuide[] = [
  {
    id: 'school-fees',
    title: 'School fees: you may not have to pay',
    summary:
      'Public school fees are not always compulsory. Many families qualify for a full or partial exemption and never claim it.',
    steps: [
      'If your child’s school is a no-fee school (quintile 1–3), there are no compulsory fees at all.',
      'If you receive a social grant for your child, the child is automatically exempt from fees at a public school. Give the principal or governing body proof (a sworn affidavit or grant confirmation).',
      'Orphans, children in foster care, and children in child-headed households are also automatically exempt.',
      'If fees are more than 10% of your total household income, you qualify for a full exemption. Between 3.5% and 10%, you qualify for a partial exemption.',
      'Apply in writing to the School Governing Body (SGB) and ask for the exemption form. The school may not refuse to give it to you, and may not exclude your child or withhold a report while you apply.',
      'If refused, you can appeal to the provincial Head of Department within 30 days.',
    ],
    officialLinks: [
      {
        label: 'Department of Basic Education — school fees and exemption',
        url: 'https://www.education.gov.za/Informationfor/ParentsandGuardians/SchoolFees.aspx',
      },
      { label: 'Legal Aid SA — school fees help', url: 'https://legal-aid.co.za/school-fees/' },
    ],
  },
  {
    id: 'free-basic-services',
    title: 'Free basic electricity and water',
    summary:
      'Most municipalities give registered low-income (indigent) households free basic services every month — typically 50 kWh of electricity and 6 kilolitres of water. Many eligible households have never registered.',
    steps: [
      'Go to your municipal offices and ask to register on the indigent register. It is free to register.',
      'Take your ID, proof of address, and proof of income (or an affidavit if you have no income).',
      'Once registered, free basic electricity is loaded monthly against your prepaid meter number, and rates or water charges may be reduced or written off.',
      'Registration usually needs to be renewed — ask your municipality how often.',
    ],
    officialLinks: [
      {
        label: 'GOV.ZA — free basic services',
        url: 'https://www.gov.za/faq/government-services/how-do-i-access-free-basic-municipal-services',
      },
    ],
  },
  {
    id: 'loyalty-free',
    title: 'Loyalty cards are free — and they are real discounts',
    summary:
      'Checkers/Shoprite Xtra Savings, Pick n Pay Smart Shopper, Woolworths WRewards, Clicks ClubCard, Dis-Chem Benefit, and SPAR Rewards all cost nothing to join. The member price on the shelf is only yours if you have the (free) card.',
    steps: [
      'Sign up in-store or on the retailer’s official site or app — never through a link someone sends you.',
      'You do not need a bank account or a smartphone for most programmes; a till-point card works.',
      'Check the shelf for two prices: the ordinary price and the member price. The difference is often 10–30% on promoted lines.',
      'Use the Stores tab in this app for the official sign-up pages of every major retailer.',
    ],
    officialLinks: [
      { label: 'Official retailer pages — Stores tab', url: '#stores' },
    ],
  },
  {
    id: 'vat-free',
    title: 'These foods are VAT-free by law',
    summary:
      '22 basic foods carry no VAT. Building meals around them stretches a budget further, and stores may never add VAT to them.',
    steps: [
      'Staples like maize meal, rice, brown bread, dried beans, lentils, tinned pilchards, eggs, milk, amasi, vegetables, fruit, and vegetable oil are all zero-rated.',
      'Sanitary pads are also zero-rated — no VAT may be charged.',
      'Check your till slip: zero-rated items are usually marked with a * or 0%. If VAT was charged on them, query it with the store.',
    ],
    officialLinks: [
      {
        label: 'SARS — VAT zero-rated foodstuffs',
        url: 'https://www.sars.gov.za/types-of-tax/value-added-tax/',
      },
    ],
  },
  {
    id: 'uif',
    title: 'Lost your job? Claim UIF — it is your money',
    summary:
      'If your employer deducted UIF from your pay, you can claim when you lose work, and also for maternity, illness, or reduced working hours. Claiming is free.',
    steps: [
      'Claim online at ufiling.labour.gov.za or at a Department of Employment and Labour office.',
      'Apply as soon as possible after your last working day — there are time limits.',
      'You need your ID, a UI-19 form from your employer, and your banking details.',
      'Domestic workers are covered too: employers of domestic workers must register and contribute.',
      'Nobody may charge you a fee to process a UIF claim.',
    ],
    officialLinks: [
      { label: 'uFiling — claim online', url: 'https://ufiling.labour.gov.za/' },
      {
        label: 'Department of Employment and Labour — UIF',
        url: 'https://www.labour.gov.za/DocumentCenter/Pages/UIF.aspx',
      },
    ],
  },
  {
    id: 'fair-price',
    title: 'Know what a fair basket costs',
    summary:
      'The Household Affordability Index publishes what 44 basic foods actually cost each month in the shops where most South Africans buy. Use it to spot when your store is expensive.',
    steps: [
      'In June 2026 the average household food basket cost R5,502.42 (PMBEJD).',
      'The index is measured in Johannesburg, Durban, Cape Town, Pietermaritzburg, Mtubatuba, and Springbok — in supermarkets serving low-income households.',
      'Compare your own till slips month to month. If a staple jumps in price, check a value grocer (Boxer, Usave, Shoprite) before restocking.',
      'Use the unit price checker in the Tools tab to compare pack sizes — the biggest pack is not always the cheapest per kilogram.',
    ],
    officialLinks: [
      {
        label: 'PMBEJD Household Affordability Index',
        url: 'https://pmbejd.org.za/index.php/household-affordability-index/',
      },
    ],
  },
  {
    id: 'grant-safety',
    title: 'Never pay anyone for a grant',
    summary:
      'Applying for any SASSA grant is free. Checking your status is free. Appeals are free. Anyone asking for a fee, your card, or your PIN is committing fraud.',
    steps: [
      'SASSA never asks for money to process, unblock, or speed up a grant.',
      'Never share your SASSA card PIN or your ID number with people who phone or message you.',
      'Only use sassa.gov.za and srd.sassa.gov.za — not links from social media or SMS.',
      'Report grant fraud free on 0800 601 011.',
    ],
    officialLinks: [
      { label: 'SASSA official site', url: 'https://www.sassa.gov.za/' },
      { label: 'SRD applications and status', url: 'https://srd.sassa.gov.za/' },
    ],
  },
]
