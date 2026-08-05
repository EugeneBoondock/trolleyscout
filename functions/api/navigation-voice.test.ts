import { describe, expect, it, vi } from 'vitest'
import {
  handleNavigationVoice,
  type NavigationVoiceDependencies,
} from './navigation-voice'

const env = {
  DB: {} as D1Database,
  FISH_AUDIO_API_KEY: 'fish-test-key',
}

function deps(
  overrides: Partial<NavigationVoiceDependencies> = {},
): NavigationVoiceDependencies {
  return {
    fetchFish: vi.fn(async () => new Response(new Uint8Array([73, 68, 51]))),
    getSession: vi.fn(async () => ({
      account: { id: 'admin-1' },
      isAuthenticated: true,
    })),
    incrementUsage: vi.fn(async () => 1),
    ...overrides,
  }
}

function request(instruction: string) {
  return new Request('https://example.test/api/navigation-voice', {
    body: JSON.stringify({ instruction }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('navigation voice', () => {
  it('uses Fish Audio for a signed-in route instruction', async () => {
    const dependencies = deps()
    const response = await handleNavigationVoice({
      env,
      request: request('Turn right onto Main Road'),
    }, dependencies)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        answer: 'Turn right onto Main Road',
        audioBase64: 'SUQz',
        model: 's2.1-pro-free',
      },
    })
    const fishRequest = vi.mocked(dependencies.fetchFish).mock.calls[0][0]
    expect(fishRequest.headers.get('model')).toBe('s2.1-pro-free')
    expect(fishRequest.headers.get('authorization')).toBe('Bearer fish-test-key')
  })

  it('does not call Fish Audio for a signed-out request', async () => {
    const dependencies = deps({
      getSession: vi.fn(async () => ({ isAuthenticated: false })),
    })
    const response = await handleNavigationVoice({
      env,
      request: request('Continue straight'),
    }, dependencies)
    expect(response.status).toBe(401)
    expect(dependencies.fetchFish).not.toHaveBeenCalled()
  })
})
