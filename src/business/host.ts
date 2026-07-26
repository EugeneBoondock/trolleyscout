export function isBusinessHost(hostname: string, search: string) {
  if (hostname === 'org.trolleyscout.co.za' || hostname === 'org.localhost') {
    return true
  }

  return new URLSearchParams(search).get('business') === '1'
}
