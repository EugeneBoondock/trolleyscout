// Markdown content negotiation for the homepage: agents that send
// Accept: text/markdown get the site overview in markdown instead of the SPA
// shell (one of Cloudflare's Agent Readiness checks). Everyone else gets the
// static asset untouched.
interface AssetsEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export const onRequestGet: PagesFunction<AssetsEnv> = async ({ request, env }) => {
  const accept = request.headers.get('accept') ?? ''
  const wantsMarkdown =
    accept.includes('text/markdown') && !accept.includes('text/html')

  if (!wantsMarkdown) {
    return env.ASSETS.fetch(request)
  }

  const markdown = await env.ASSETS.fetch(
    new Request(new URL('/index.md', request.url), { method: 'GET' }),
  )

  if (!markdown.ok) {
    return env.ASSETS.fetch(request)
  }

  return new Response(markdown.body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/markdown; charset=utf-8',
      vary: 'accept',
    },
  })
}
