export interface NetworkProviderSource {
  name: string
  retailerId: string
  url: string
}

const provider = (
  retailerId: string,
  name: string,
  url: string,
): NetworkProviderSource => ({ name, retailerId, url })

// Official public offer pages, grouped by the country whose plans and currency
// they use. The store scout reads each page with the same source-backed parser,
// so adding a market does not require a provider-specific adapter.
export const NETWORK_PROVIDER_SOURCES: Readonly<
  Record<string, readonly NetworkProviderSource[]>
> = {
  AR: [
    provider('claro-ar', 'Claro Argentina', 'https://www.claro.com.ar/personas/movil'),
    provider('movistar-ar', 'Movistar Argentina', 'https://www.movistar.com.ar/productos-y-servicios'),
    provider('personal-ar', 'Personal', 'https://www.personal.com.ar/'),
  ],
  AU: [
    provider('optus-au', 'Optus', 'https://www.optus.com.au/mobile/phones'),
    provider('telstra-au', 'Telstra', 'https://www.telstra.com.au/deals'),
    provider('vodafone-au', 'Vodafone Australia', 'https://www.vodafone.com.au/deals'),
  ],
  AE: [
    provider('du-ae', 'du', 'https://www.du.ae/personal/mobile'),
    provider('e-and-ae', 'e& UAE', 'https://www.etisalat.ae/b2c/eshop/mobile'),
    provider('virgin-mobile-ae', 'Virgin Mobile UAE', 'https://www.virginmobile.ae/'),
  ],
  BR: [
    provider('claro-br', 'Claro Brasil', 'https://www.claro.com.br/celular'),
    provider('oi-br', 'Oi', 'https://www.oi.com.br/celular/'),
    provider('tim-br', 'TIM Brasil', 'https://www.tim.com.br/para-voce/planos'),
    provider('vivo-br', 'Vivo', 'https://vivo.com.br/para-voce/produtos-e-servicos/para-o-celular'),
  ],
  BW: [
    provider('btc-bw', 'BTC Mobile', 'https://www.btc.bw/mobile'),
    provider('mascom-bw', 'Mascom', 'https://mascom.bw/'),
    provider('orange-bw', 'Orange Botswana', 'https://www.orange.co.bw/en/offers.html'),
  ],
  CA: [
    provider('bell-ca', 'Bell Mobility', 'https://www.bell.ca/Mobility/Cell_phone_plans'),
    provider('freedom-mobile-ca', 'Freedom Mobile', 'https://www.freedommobile.ca/en-CA/plans'),
    provider('rogers-ca', 'Rogers', 'https://www.rogers.com/mobility'),
    provider('telus-ca', 'TELUS', 'https://www.telus.com/en/mobility/plans'),
  ],
  CL: [
    provider('claro-cl', 'Claro Chile', 'https://www.clarochile.cl/personas/servicios/servicios-moviles/'),
    provider('entel-cl', 'Entel Chile', 'https://www.entel.cl/planes-movil'),
    provider('movistar-cl', 'Movistar Chile', 'https://ww2.movistar.cl/movil/'),
  ],
  CO: [
    provider('claro-co', 'Claro Colombia', 'https://www.claro.com.co/personas/servicios/servicios-moviles/'),
    provider('movistar-co', 'Movistar Colombia', 'https://www.movistar.co/pospago'),
    provider('tigo-co', 'Tigo Colombia', 'https://www.tigo.com.co/movil'),
  ],
  DE: [
    provider('o2-de', 'O2 Germany', 'https://www.o2online.de/tarife/'),
    provider('telekom-de', 'Telekom Deutschland', 'https://www.telekom.de/unterwegs'),
    provider('vodafone-de', 'Vodafone Germany', 'https://www.vodafone.de/privat/handys-tablets-tarife.html'),
  ],
  ES: [
    provider('movistar-es', 'Movistar España', 'https://www.movistar.es/movil/'),
    provider('orange-es', 'Orange España', 'https://www.orange.es/tarifas/movil'),
    provider('vodafone-es', 'Vodafone España', 'https://www.vodafone.es/c/particulares/es/productos-y-servicios/movil/'),
  ],
  FR: [
    provider('bouygues-fr', 'Bouygues Telecom', 'https://www.bouyguestelecom.fr/forfaits-mobiles'),
    provider('orange-fr', 'Orange France', 'https://boutique.orange.fr/mobile/offres'),
    provider('sfr-fr', 'SFR', 'https://www.sfr.fr/offre-mobile'),
  ],
  GB: [
    provider('ee-gb', 'EE', 'https://ee.co.uk/mobile-phone-deals'),
    provider('o2-gb', 'O2', 'https://www.o2.co.uk/shop/offers'),
    provider('three-gb', 'Three', 'https://www.three.co.uk/phone-deals'),
    provider('vodafone-gb', 'Vodafone', 'https://www.vodafone.co.uk/mobile/phones/pay-monthly-contracts'),
  ],
  GH: [
    provider('airteltigo-gh', 'AT Ghana', 'https://www.at.com.gh/'),
    provider('mtn-gh', 'MTN Ghana', 'https://mtn.com.gh/personal/'),
    provider('telecel-gh', 'Telecel Ghana', 'https://telecel.com.gh/personal/'),
  ],
  ID: [
    provider('indosat-id', 'Indosat Ooredoo Hutchison', 'https://ioh.co.id/portal/id/iohindex'),
    provider('telkomsel-id', 'Telkomsel', 'https://www.telkomsel.com/en/packages'),
    provider('xl-id', 'XL Axiata', 'https://www.xl.co.id/id/produk'),
  ],
  IE: [
    provider('eir-ie', 'eir', 'https://www.eir.ie/mobile/'),
    provider('three-ie', 'Three Ireland', 'https://www.three.ie/shop/phones.html'),
    provider('vodafone-ie', 'Vodafone Ireland', 'https://n.vodafone.ie/shop/pay-monthly-phones.html'),
  ],
  IN: [
    provider('airtel-in', 'Airtel', 'https://www.airtel.in/recharge-online'),
    provider('jio-in', 'Jio', 'https://www.jio.com/selfcare/plans/mobility/prepaid-plans-home/'),
    provider('vi-in', 'Vi', 'https://www.myvi.in/prepaid/vi-prepaid-recharge-plans'),
  ],
  IT: [
    provider('tim-it', 'TIM Italia', 'https://www.tim.it/fisso-e-mobile/mobile'),
    provider('vodafone-it', 'Vodafone Italia', 'https://www.vodafone.it/eshop/mobile/offerte-telefonia-mobile.html'),
    provider('windtre-it', 'WINDTRE', 'https://www.windtre.it/offerte-mobile'),
  ],
  JP: [
    provider('au-jp', 'au by KDDI', 'https://www.au.com/mobile/charge/'),
    provider('docomo-jp', 'NTT DOCOMO', 'https://www.docomo.ne.jp/english/charge/'),
    provider('softbank-jp', 'SoftBank', 'https://www.softbank.jp/en/mobile/price_plan/'),
  ],
  KE: [
    provider('airtel-ke', 'Airtel Kenya', 'https://www.airtelkenya.com/'),
    provider('safaricom-ke', 'Safaricom', 'https://www.safaricom.co.ke/personal/data'),
  ],
  MW: [
    provider('access-mw', 'Access Communications', 'https://www.access.mw/'),
    provider('airtel-mw', 'Airtel Malawi', 'https://www.airtel.mw/'),
    provider('tnm-mw', 'TNM', 'https://www.tnm.co.mw/'),
  ],
  MX: [
    provider('att-mx', 'AT&T México', 'https://www.att.com.mx/planes.html'),
    provider('movistar-mx', 'Movistar México', 'https://www.movistar.com.mx/'),
    provider('telcel-mx', 'Telcel', 'https://www.telcel.com/personas/telefonia/planes-de-renta'),
  ],
  MY: [
    provider('celcomdigi-my', 'CelcomDigi', 'https://www.celcomdigi.com/postpaid'),
    provider('maxis-my', 'Maxis', 'https://www.maxis.com.my/en/mobile-plans/'),
    provider('u-mobile-my', 'U Mobile', 'https://www.u.com.my/en/personal/mobile-plans'),
    provider('yes-my', 'Yes 5G', 'https://www.yes.my/yes5gplans/'),
  ],
  MZ: [
    provider('movitel-mz', 'Movitel', 'https://movitel.co.mz/'),
    provider('tmcel-mz', 'Tmcel', 'https://www.tmcel.mz/'),
    provider('vodacom-mz', 'Vodacom Mozambique', 'https://www.vm.co.mz/'),
  ],
  NA: [
    provider('mtc-na', 'MTC Namibia', 'https://www.mtc.com.na/prepaid'),
    provider('paratus-na', 'Paratus Namibia', 'https://paratus.africa/namibia/'),
    provider('telecom-na', 'Telecom Namibia', 'https://www.telecom.na/mobile'),
  ],
  NG: [
    provider('9mobile-ng', '9mobile', 'https://9mobile.com.ng/'),
    provider('airtel-ng', 'Airtel Nigeria', 'https://www.airtel.com.ng/'),
    provider('glo-ng', 'Glo', 'https://www.gloworld.com/ng/personal/'),
    provider('mtn-ng', 'MTN Nigeria', 'https://www.mtn.ng/personal/'),
  ],
  NL: [
    provider('kpn-nl', 'KPN', 'https://www.kpn.com/mobiel-abonnement'),
    provider('odido-nl', 'Odido', 'https://www.odido.nl/mobiel'),
    provider('vodafone-nl', 'Vodafone Nederland', 'https://www.vodafone.nl/abonnement/mobiel'),
  ],
  NZ: [
    provider('2degrees-nz', '2degrees', 'https://www.2degrees.nz/mobile-plans'),
    provider('one-nz', 'One NZ', 'https://one.nz/mobile-plans/'),
    provider('spark-nz', 'Spark', 'https://www.spark.co.nz/online/mobile-plans'),
  ],
  PE: [
    provider('claro-pe', 'Claro Perú', 'https://www.claro.com.pe/personas/movil/postpago/'),
    provider('entel-pe', 'Entel Perú', 'https://www.entel.pe/planes-postpago/'),
    provider('movistar-pe', 'Movistar Perú', 'https://www.movistar.com.pe/movil/postpago'),
  ],
  PH: [
    provider('dito-ph', 'DITO', 'https://dito.ph/mobile'),
    provider('globe-ph', 'Globe', 'https://www.globe.com.ph/postpaid'),
    provider('smart-ph', 'Smart', 'https://smart.com.ph/Postpaid'),
  ],
  PT: [
    provider('meo-pt', 'MEO', 'https://www.meo.pt/servicos/movel/telemoveis'),
    provider('nos-pt', 'NOS', 'https://www.nos.pt/movel'),
    provider('vodafone-pt', 'Vodafone Portugal', 'https://www.vodafone.pt/telemoveis.html'),
  ],
  SA: [
    provider('mobily-sa', 'Mobily', 'https://www.mobily.com.sa/wps/portal/web/personal/mobile'),
    provider('stc-sa', 'stc Saudi Arabia', 'https://www.stc.com.sa/content/stc/sa/en/personal/mobile/packages.html'),
    provider('zain-sa', 'Zain Saudi Arabia', 'https://sa.zain.com/en/personal/mobile'),
  ],
  SG: [
    provider('m1-sg', 'M1', 'https://www.m1.com.sg/mobile'),
    provider('singtel-sg', 'Singtel', 'https://www.singtel.com/personal/products-services/mobile'),
    provider('starhub-sg', 'StarHub', 'https://www.starhub.com/personal/mobile.html'),
  ],
  TZ: [
    provider('airtel-tz', 'Airtel Tanzania', 'https://www.airtel.co.tz/'),
    provider('vodacom-tz', 'Vodacom Tanzania', 'https://vodacom.co.tz/'),
    provider('yas-tz', 'Yas Tanzania', 'https://www.yas.co.tz/'),
  ],
  UG: [
    provider('airtel-ug', 'Airtel Uganda', 'https://www.airtel.co.ug/'),
    provider('lyca-ug', 'Lyca Mobile Uganda', 'https://www.lycamobile.ug/'),
    provider('mtn-ug', 'MTN Uganda', 'https://www.mtn.co.ug/'),
  ],
  US: [
    provider('att-us', 'AT&T', 'https://www.att.com/deals/'),
    provider('google-fi-us', 'Google Fi Wireless', 'https://fi.google.com/about/offers/'),
    provider('t-mobile-us', 'T-Mobile', 'https://www.t-mobile.com/offers'),
    provider('verizon-us', 'Verizon', 'https://www.verizon.com/deals/'),
  ],
  ZA: [
    provider('cell-c', 'Cell C', 'https://www.cellc.co.za/cell-c-deals'),
    provider('mtn', 'MTN', 'https://www.mtn.co.za/shop/deals/'),
    provider('rain', 'rain', 'https://www.rain.co.za/'),
    provider('telkom', 'Telkom', 'https://www.telkom.co.za/deals'),
    provider('vodacom', 'Vodacom', 'https://www.vodacom.co.za/shopping/deals'),
  ],
  ZM: [
    provider('airtel-zm', 'Airtel Zambia', 'https://www.airtel.co.zm/'),
    provider('mtn-zm', 'MTN Zambia', 'https://www.mtn.zm/'),
    provider('zamtel-zm', 'Zamtel', 'https://www.zamtel.zm/'),
  ],
  ZW: [
    provider('econet-zw', 'Econet Wireless', 'https://www.econet.co.zw/'),
    provider('netone-zw', 'NetOne', 'https://www.netone.co.zw/'),
    provider('telecel-zw', 'Telecel Zimbabwe', 'https://www.telecel.co.zw/'),
  ],
}

export function getNetworkProviderCountryCodes(): string[] {
  return Object.keys(NETWORK_PROVIDER_SOURCES)
}

export function getNetworkProviderSources(
  countryCode: string,
): readonly NetworkProviderSource[] {
  return NETWORK_PROVIDER_SOURCES[countryCode.trim().toUpperCase()] ?? []
}
