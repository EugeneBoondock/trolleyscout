import type { BasketItemDraft, BasketQuantityDraft } from '../../src/types'
import {
  addBasketItem,
  deleteBasketItem,
  getMemberBasket,
  getMemberSession,
  updateBasketItemQuantity,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const accountId = session.account?.id

  if (request.method === 'GET') {
    return json(
      {
        basket: await getMemberBasket(env, accountId),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'POST') {
    let draft: BasketItemDraft

    try {
      draft = (await request.json()) as BasketItemDraft
    } catch {
      return json(
        {
          basket: await getMemberBasket(env, accountId),
          issues: ['Request body must be valid JSON.'],
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await addBasketItem(env, accountId, draft)

    if (!result.basket) {
      return json(
        {
          basket: await getMemberBasket(env, accountId),
          issues: result.issues ?? ['Basket item could not be saved.'],
        },
        {
          headers: privateHeaders,
          status: 422,
        },
      )
    }

    return json(
      {
        basket: result.basket,
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'PATCH') {
    let draft: BasketQuantityDraft

    try {
      draft = (await request.json()) as BasketQuantityDraft
    } catch {
      return json(
        {
          basket: await getMemberBasket(env, accountId),
          issues: ['Request body must be valid JSON.'],
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await updateBasketItemQuantity(env, accountId, draft)

    if (!result.basket) {
      return json(
        {
          basket: await getMemberBasket(env, accountId),
          issues: result.issues ?? ['Basket item could not be updated.'],
        },
        {
          headers: privateHeaders,
          status: 422,
        },
      )
    }

    return json(
      {
        basket: result.basket,
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id')?.trim()

    if (!id) {
      return json(
        {
          basket: await getMemberBasket(env, accountId),
          deleted: false,
          id: '',
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await deleteBasketItem(env, accountId, id)

    return json(
      {
        basket: result.basket,
        deleted: result.deleted,
        id,
      },
      {
        headers: privateHeaders,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, PATCH, DELETE')
}
