// First-party legal copy for Trolley Scout, kept as structured data so the same
// renderer can present every document and so the wording is easy to review in
// one place. These are the operator's own policies for its own product — they
// describe what the app actually does (accounts, PayFast subscriptions, typed
// or shared location for Near-me, opt-in deal alerts, AI deal ranking) rather
// than boilerplate for features Trolley Scout does not have.
//
// South African law frames this: Boondock Labs (Pty) Ltd is the responsible
// party under POPIA, and paid plans fall under the Consumer Protection Act. We
// deliberately skip enterprise-only documents (DPA, sub-processor lists) and
// EU-only ones (GDPR-specific pages) that do not apply to a consumer app.

export type LegalDocId = 'privacy' | 'terms' | 'cookies'

export interface LegalSection {
  heading: string
  body: string[]
}

export interface LegalDoc {
  id: LegalDocId
  title: string
  path: string
  // Shown as "Last updated" so readers can tell how current the policy is.
  updated: string
  lede: string
  sections: LegalSection[]
}

const UPDATED = '20 July 2026'
const OPERATOR = 'Boondock Labs (Pty) Ltd'

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    path: '/privacy',
    updated: UPDATED,
    lede: `How Trolley Scout, operated by ${OPERATOR}, collects and looks after your personal information under South Africa's Protection of Personal Information Act (POPIA).`,
    sections: [
      {
        heading: 'Who is responsible',
        body: [
          `Trolley Scout is a product of ${OPERATOR}, a company registered in South Africa. Under POPIA we are the "responsible party" for the personal information described here.`,
          'This policy covers the Trolley Scout website and mobile app. If you only browse the free deals, money-help and tools without signing in, we do not need an account from you at all.',
        ],
      },
      {
        heading: 'What we collect',
        body: [
          'Account details: your email address, display name and a securely hashed version of your password (we never store your password in plain text).',
          'Things you save: saved deals, baskets, saved sources and your notification and address preferences, so the app can remember them for you.',
          'Location for "Near me": the suburb or address you type, or the GPS location you choose to share, which we convert to map coordinates to find nearby stores. You control whether to share this and can use the rest of the app without it.',
          'Payment records: when you subscribe, PayFast processes the payment. We receive a confirmation and a subscription reference — we never see or store your card or banking details.',
          'Technical information: basic logs such as your device type and app version, used to keep the service working and secure.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          'To run the service: sign you in, remember your saved items, show deals near you and process your subscription.',
          'To send you deal alerts only if you opt in, and to stop as soon as you opt out.',
          'To answer support requests you send us through the Support page.',
          'To keep Trolley Scout secure, prevent abuse and understand which features are useful so we can improve them.',
        ],
      },
      {
        heading: 'How we rank deals (automated processing)',
        body: [
          'Trolley Scout uses automated systems, including AI, to sort and rank grocery specials so the most useful deals appear first. This ranking works on deal and shopping signals, not on sensitive personal information, and it never makes a decision that has a legal or similarly significant effect on you.',
        ],
      },
      {
        heading: 'When we share information',
        body: [
          'We do not sell your personal information. We share it only with the service providers that make the app work: PayFast for payments, a geocoding provider to turn a typed address into map coordinates, and our hosting and infrastructure providers (such as Cloudflare).',
          'We may disclose information if the law requires it, or to protect the rights, safety and property of our users and of Trolley Scout.',
        ],
      },
      {
        heading: 'Keeping it safe and how long we keep it',
        body: [
          'We protect your information with encryption in transit and by hashing passwords. No system is perfectly secure, but we take reasonable steps expected under POPIA.',
          'We keep your account information while your account is active. When you ask us to delete your account, we remove your personal information except where we must keep limited records (for example, proof of a payment) to meet a legal obligation.',
        ],
      },
      {
        heading: 'Your rights under POPIA',
        body: [
          'You may ask us to show, correct or delete the personal information we hold about you, and you may object to certain processing. Contact us through the Support page to make a request.',
          "If you believe we have not handled your information properly, you may complain to South Africa's Information Regulator.",
        ],
      },
      {
        heading: 'Children',
        body: [
          'Trolley Scout is intended for adults managing a household budget. We do not knowingly collect personal information from children without the consent of a parent or guardian.',
        ],
      },
      {
        heading: 'Changes and contact',
        body: [
          'We may update this policy as the app changes. The "Last updated" date above shows the current version.',
          'For any privacy question or request, use the Support page and we will respond.',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    path: '/terms',
    updated: UPDATED,
    lede: `The agreement between you and ${OPERATOR} when you use Trolley Scout.`,
    sections: [
      {
        heading: 'Agreeing to these terms',
        body: [
          `By using Trolley Scout you agree to these Terms of Use. If you do not agree, please do not use the app. Trolley Scout is operated by ${OPERATOR}.`,
        ],
      },
      {
        heading: 'What Trolley Scout is',
        body: [
          'Trolley Scout is an information tool. It gathers grocery specials that retailers publish on their own official pages, together with public money-help information such as SASSA grant amounts and school-fee exemptions, and presents them in one place with the date each item was last checked.',
          'Prices, specials and catalogue dates belong to the retailers and can change or sell out at any time. We show the source link and checked date so you can confirm — we do not guarantee that a price is still current, and the deal is always subject to the retailer’s own terms.',
          'Money-help information is provided for guidance only and is not financial, legal or tax advice. Always confirm on the official government or retailer page before you act.',
        ],
      },
      {
        heading: 'Not affiliated with the retailers',
        body: [
          'Trolley Scout is an independent tool. Retailer and brand names are shown only to identify their public specials. Trolley Scout is not affiliated with, endorsed by or sponsored by any of the retailers or brands it lists.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'Some features need a free account. Keep your login details private, give accurate information, and let us know if you think your account has been used without your permission. You are responsible for activity under your account.',
        ],
      },
      {
        heading: 'Paid plans and billing',
        body: [
          'Trolley Scout is free to use. Optional Scout and Household plans add larger saved-deal and basket lists and extra tools, and are billed through PayFast on a monthly or annual cycle.',
          'A paid plan renews automatically at the end of each cycle until you cancel. You can cancel at any time; your plan then stays active until the end of the period you have already paid for.',
          'If you change plan or switch between monthly and annual billing, this starts a new subscription for the plan you chose and cancels the previous one from your next payment, so you are not billed twice.',
          'Except where the Consumer Protection Act or other law gives you a right to a refund, payments for a billing period already started are not refundable.',
        ],
      },
      {
        heading: 'Using the app fairly',
        body: [
          'Please use Trolley Scout only for its intended purpose. Do not scrape, overload, copy wholesale, resell or misuse the service, and do not use it for any unlawful purpose or in a way that harms other users or the retailers listed.',
        ],
      },
      {
        heading: 'Our content',
        body: [
          `The Trolley Scout name, brand, design and original content are owned by ${OPERATOR} and may not be copied or reused without permission. Retailer specials and government information remain the property of their respective owners.`,
        ],
      },
      {
        heading: 'Availability and liability',
        body: [
          'Trolley Scout is provided "as is". We work to keep it accurate and available but cannot promise it will always be uninterrupted or error-free.',
          `To the fullest extent allowed by South African law, ${OPERATOR} is not liable for any loss arising from a price that changed, a special that ended, reliance on money-help information, or the app being unavailable. Nothing in these terms limits any right you have under the Consumer Protection Act.`,
        ],
      },
      {
        heading: 'Changes and governing law',
        body: [
          'We may update these terms as the app changes; the "Last updated" date above shows the current version. These terms are governed by the laws of the Republic of South Africa.',
          'Questions about these terms can be sent through the Support page.',
        ],
      },
    ],
  },
  cookies: {
    id: 'cookies',
    title: 'Cookie Policy',
    path: '/cookies',
    updated: UPDATED,
    lede: 'The small amount of storage Trolley Scout keeps on your device, and why.',
    sections: [
      {
        heading: 'How we use cookies and local storage',
        body: [
          'Trolley Scout keeps things simple. We use only what the app needs to work — we do not use advertising or cross-site tracking cookies, and we do not sell your browsing behaviour.',
        ],
      },
      {
        heading: 'What we store',
        body: [
          'Essential sign-in: when you log in, we keep a secure session cookie so the app knows it is you as you move between pages. Without it you cannot stay signed in.',
          'Preferences: we save small settings on your device, such as your light or dark theme choice and your notification preferences, so the app remembers them next time.',
          'Offline convenience: we cache recent deals and tools on your device so the app still works when your connection drops.',
          'Payments: during checkout, PayFast may set its own cookies to process the payment securely. These are governed by PayFast’s own policy.',
        ],
      },
      {
        heading: 'Managing cookies',
        body: [
          'You can clear or block cookies and local storage in your browser or device settings at any time. If you block the essential sign-in cookie, you will not be able to log in or use member features, but the free public parts of the app will still work.',
        ],
      },
      {
        heading: 'Questions',
        body: [
          'If you have a question about how Trolley Scout uses cookies, reach us through the Support page.',
        ],
      },
    ],
  },
}

export const LEGAL_DOC_LIST: LegalDoc[] = [
  LEGAL_DOCS.privacy,
  LEGAL_DOCS.terms,
  LEGAL_DOCS.cookies,
]
