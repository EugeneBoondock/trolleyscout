/// Fact-checked money-help content, mirrored from the web app's moneyHelp.ts.
/// Amounts effective 2026-04-01. Every entry links to its official source.
class Grant {
  const Grant(this.name, this.amount, this.whoQualifies, this.howToApply, this.url);
  final String name;
  final String amount;
  final String whoQualifies;
  final String howToApply;
  final String url;
}

const grantsEffectiveFrom = '2026-04-01';

const socialGrants = <Grant>[
  Grant(
    'Child Support Grant',
    'R580/m',
    'The main caregiver of a child under 18. You do not have to be the biological parent. Income limits apply.',
    'Apply free at any SASSA office with your ID and the child’s birth certificate. An affidavit works if you have no documents.',
    'https://sassa.gov.za/social-grants/child-support-grant',
  ),
  Grant(
    'Older Persons Grant (pension)',
    'R2 400/m',
    'South Africans 60 and older who pass the means test.',
    'Apply free at any SASSA office with your ID. A family member can apply for you with a doctor’s note if you cannot travel.',
    'https://sassa.gov.za/social-grants/older-person-grants',
  ),
  Grant(
    'Disability Grant',
    'R2 400/m',
    'Adults 18–59 with a disability confirmed by a medical assessment, who pass the means test.',
    'Apply free at a SASSA office. SASSA arranges the medical assessment at no cost to you.',
    'https://sassa.gov.za/social-grants/disability-grant',
  ),
  Grant(
    'Foster Child Grant',
    'R1 290/m',
    'Foster parents with a court order placing the child in their care.',
    'Apply free at a SASSA office with the court order and both IDs.',
    'https://sassa.gov.za/social-grants/foster-child-grant',
  ),
  Grant(
    'Care Dependency Grant',
    'R2 400/m',
    'Caregivers of a child with a severe disability who needs full-time care, confirmed by a medical assessment.',
    'Apply free at a SASSA office. Can be paid on top of other income within the means test.',
    'https://sassa.gov.za/social-grants/care-dependancy-grant',
  ),
  Grant(
    'Grant-in-Aid',
    'R580/m',
    'People already on an Older Persons, Disability or War Veterans grant who need full-time care from someone else.',
    'Ask for it at SASSA when you apply for, or already receive, a qualifying grant. Many never claim this extra amount.',
    'https://sassa.gov.za/social-grants/grant-in-aid',
  ),
  Grant(
    'SRD Grant (R370)',
    'R370/m',
    'Adults 18–59 with no income and no other grant.',
    'Apply online free at srd.sassa.gov.za or on WhatsApp (082 046 8553). Never pay anyone to apply or check status.',
    'https://srd.sassa.gov.za/',
  ),
];

/// The till-slip "money on the table" lines shown on the home screen.
const tillLines = <List<String>>[
  ['Child grant, per child', 'R580/m'],
  ['Pension (60+)', 'R2 400/m'],
  ['SRD grant (18–59)', 'R370/m'],
  ['Grant-in-Aid top-up', 'R580/m'],
  ['School fee exemption', 'up to 100%'],
  ['Basic electricity', '50 kWh free'],
  ['Loyalty cards, all majors', 'R0 to join'],
];
