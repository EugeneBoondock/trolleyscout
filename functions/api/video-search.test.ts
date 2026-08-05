import { describe, expect, it } from 'vitest'

import { searchTopVideos } from './video-search'

function videoRenderer(
  videoId: string,
  title: string,
  views: string,
  channel = 'Review Channel',
) {
  return {
    videoRenderer: {
      ownerText: { runs: [{ text: channel }] },
      thumbnail: {
        thumbnails: [
          { url: `https://i.ytimg.com/vi/${videoId}/default.jpg` },
          { url: `https://i.ytimg.com/vi/${videoId}/hq720.jpg` },
        ],
      },
      title: { runs: [{ text: title }] },
      videoId,
      viewCountText: { simpleText: views },
    },
  }
}

function innertubeResponse(items: unknown[]) {
  return new Response(JSON.stringify({
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [{ itemSectionRenderer: { contents: items } }],
          },
        },
      },
    },
  }))
}

describe('searchTopVideos', () => {
  it('returns the three most-viewed videos in view order', async () => {
    const videos = await searchTopVideos('sunlight liquid review', async () =>
      innertubeResponse([
        videoRenderer('mid', 'Decent review', '90,000 views'),
        { adSlotRenderer: { anything: true } },
        videoRenderer('top', 'Best review', '1,200,000 views'),
        videoRenderer('low', 'Small review', '4,100 views'),
        videoRenderer('fourth', 'Tiny review', '900 views'),
      ]))

    expect(videos.map((video) => video.videoId)).toEqual(['top', 'mid', 'low'])
    expect(videos[0]).toMatchObject({
      channel: 'Review Channel',
      thumbnailUrl: 'https://i.ytimg.com/vi/top/hq720.jpg',
      title: 'Best review',
      viewCount: 1_200_000,
    })
  })

  it('reads shortened view counts when the exact text is missing', async () => {
    const videos = await searchTopVideos('review', async () =>
      innertubeResponse([{
        videoRenderer: {
          shortViewCountText: { simpleText: '1.2M views' },
          title: { runs: [{ text: 'Short-count review' }] },
          videoId: 'short',
        },
      }]))

    expect(videos).toHaveLength(1)
    expect(videos[0]).toMatchObject({
      videoId: 'short',
      viewCount: 1_200_000,
    })
  })

  it('sends the query to the open InnerTube endpoint', async () => {
    let requestedBody = ''
    await searchTopVideos('huggies nappies review', async (input, init) => {
      expect(input).toContain('youtubei/v1/search')
      requestedBody = String(init.body)
      return innertubeResponse([])
    })

    const body = JSON.parse(requestedBody) as {
      context: { client: { clientName: string } }
      query: string
    }
    expect(body.query).toBe('huggies nappies review')
    expect(body.context.client.clientName).toBe('WEB')
  })

  it('returns an empty list when YouTube errors or the shape is foreign', async () => {
    expect(await searchTopVideos('review', async () =>
      new Response('nope', { status: 429 }))).toEqual([])
    expect(await searchTopVideos('review', async () =>
      new Response(JSON.stringify({ unexpected: true })))).toEqual([])
    expect(await searchTopVideos('review', async () => {
      throw new Error('network down')
    })).toEqual([])
  })
})
