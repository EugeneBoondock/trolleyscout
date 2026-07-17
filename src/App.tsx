import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowClockwise,
  Bell,
  BellRinging,
  BookmarkSimple,
  Calculator,
  CheckCircle,
  ClipboardText,
  CreditCard,
  HandCoins,
  HouseLine,
  Info,
  LinkSimple,
  List,
  MagnifyingGlass,
  Minus,
  MoonStars,
  NavigationArrow,
  Plus,
  ReceiptX,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  SignOut,
  Storefront,
  Sun,
  Tag,
  Ticket,
  Trash,
  UserCircle,
  Wallet,
  X,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { ScoutMark } from './components/ScoutMark'
import { LeafletViewer } from './components/LeafletViewer'
import {
  addBasketItemForMember,
  getInitialOfferState,
  getInitialRetailerState,
  loadOffers,
  loadRetailers,
  loadDiscoveredStores,
  type ResourceState,
  type OfferResource,
  type RetailerResource,
  type DiscoveredStoresResource,
  type NearbyStoreResult,
  createVerifiedOffer,
  deleteVerifiedOffer,
  deleteBasketItemForMember,
  deleteSavedDeal,
  deleteSavedSource,
  endMemberSession,
  getInitialBasketState,
  getInitialMemberState,
  getInitialDiscoveryState,
  getInitialSavedDealState,
  getInitialSavedSourceState,
  getInitialSubscriptionState,
  loadMemberSession,
  changeAccountPassword,
  loadAdminOverview,
  loadDiscovery,
  loadBasket,
  loadSavedDeals,
  validateOfferDraft,
  loadSavedSources,
  loadSubscription,
  saveSourceForMember,
  saveDealForMember,
  startMemberSession,
  startSubscriptionCheckout,
  updateAccountProfile,
  updateBasketItemForMember,
  createDealWatch,
  deleteDealWatch,
  loadDealWatches,
  markDealWatchSeen,
} from './services/apiClient'
import { openPayFastOnsite } from './services/payfastOnsite'
import {
  clearDealLearningHistory,
  deleteDealLearningActivity,
  loadDealLearning,
  recordDealLearningActivity,
  setDealLearningEnabled,
} from './services/dealLearningClient'
import type {
  BasketItem,
  BillingCycle,
  DealActivity,
  DealLearningState,
  DealWatch,
  MemberSession,
  MemberPlanId,
  MemberSessionDraft,
  OfferDraft,
  OfferValidationResult,
  Retailer,
  SourceKind,
  DiscoveredDeal,
  AdminOverview,
  StoreLeaflet,
  VerifiedOffer,
} from './types'
import type {
  BasketResource,
  DiscoveryResource,
  MemberResource,
  SavedSourceResource,
  SavedDealResource,
  SubscriptionResource,
} from './services/apiClient'
import { getMemberPlan } from './data/memberPlans'
import { pickStapleDeals } from './services/stapleDeals'
import { filterDiscoveryDeals } from './services/dealFilters'
import { groupDiscoveredStores, type DiscoveredStoreGroup } from './services/storeGroups'
import { AboutView, type AboutDestination } from './views/AboutView'
import { HomeView, type HomeDestination } from './views/HomeView'
import { MoneyHelpView } from './views/MoneyHelpView'
import { ToolkitView } from './views/ToolkitView'
import { NearMeView } from './views/NearMeView'
import { VouchersView } from './views/VouchersView'
import {
  claimVoucher,
  loadVouchers,
  removeVoucherClaim,
} from './services/vouchers/voucherApi'
import type { Voucher } from './services/vouchers/types'

type ThemeMode = 'light' | 'dark'
type ActiveView =
  | 'home'
  | 'near'
  | 'help'
  | 'tools'
  | 'sources'
  | 'discovery'
  | 'vouchers'
  | 'about'
  | 'offers'
  | 'scanner'
  | 'rules'
type MemberView =
  | 'dashboard'
  | 'near'
  | 'help'
  | 'tools'
  | 'sources'
  | 'discovery'
  | 'vouchers'
  | 'savedDeals'
  | 'basket'
  | 'saved'
  | 'about'
  | 'offers'
  | 'scanner'
  | 'subscription'
  | 'profile'
  | 'admin'
  | 'rules'

const viewOptions: Array<{ label: string; value: ActiveView }> = [
  { label: 'Home', value: 'home' },
  { label: 'Deals', value: 'discovery' },
  { label: 'Near me', value: 'near' },
  { label: 'Money help', value: 'help' },
  { label: 'Tools', value: 'tools' },
  { label: 'Stores', value: 'sources' },
  { label: 'Vouchers', value: 'vouchers' },
  { label: 'Help', value: 'about' },
]

const dataDeskOptions: Array<{ label: string; value: ActiveView }> = [
  { label: 'Verified offers', value: 'offers' },
  { label: 'Scanner', value: 'scanner' },
  { label: 'Data rules', value: 'rules' },
]

const memberViewOptions: Array<{ icon: ReactNode; label: string; value: MemberView }> = [
  { icon: <HouseLine size={20} />, label: 'Dashboard', value: 'dashboard' },
  { icon: <HandCoins size={20} />, label: 'Money help', value: 'help' },
  { icon: <Calculator size={20} />, label: 'Tools', value: 'tools' },
  { icon: <Storefront size={20} />, label: 'Stores', value: 'sources' },
  { icon: <Tag size={20} />, label: 'Find deals', value: 'discovery' },
  { icon: <Ticket size={20} />, label: 'Vouchers', value: 'vouchers' },
  { icon: <NavigationArrow size={20} />, label: 'Near me', value: 'near' },
  { icon: <Wallet size={20} />, label: 'Saved deals', value: 'savedDeals' },
  { icon: <ShoppingCart size={20} />, label: 'Basket', value: 'basket' },
  { icon: <BookmarkSimple size={20} />, label: 'Saved sources', value: 'saved' },
  { icon: <ReceiptX size={20} />, label: 'Offers', value: 'offers' },
  { icon: <ShieldCheck size={20} />, label: 'Scanner', value: 'scanner' },
  { icon: <CreditCard size={20} />, label: 'Subscription', value: 'subscription' },
  { icon: <UserCircle size={20} />, label: 'Profile', value: 'profile' },
  { icon: <Info size={20} />, label: 'About & help', value: 'about' },
  { icon: <ClipboardText size={20} />, label: 'Rules', value: 'rules' },
]

// Only rendered for accounts with the admin role.
const adminViewOption: { icon: ReactNode; label: string; value: MemberView } = {
  icon: <ShieldCheck size={20} />,
  label: 'Admin console',
  value: 'admin',
}

const sourceLabels: Record<SourceKind | 'all', string> = {
  all: 'All',
  app: 'App',
  loyalty: 'Loyalty',
  specials: 'Specials',
  'store-finder': 'Store finder',
}

const initialRetailers = getInitialRetailerState().data.retailers
const defaultRetailerId = initialRetailers[0]?.id ?? 'pick-n-pay'

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme())
  const [activeView, setActiveView] = useState<ActiveView>('home')
  const [query, setQuery] = useState('')
  const [sourceKind, setSourceKind] = useState<SourceKind | 'all'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [retailerState, setRetailerState] = useState<ResourceState<RetailerResource>>(
    getInitialRetailerState,
  )
  const [offerState, setOfferState] = useState<ResourceState<OfferResource>>(getInitialOfferState)
  const [discoveryState, setDiscoveryState] = useState<ResourceState<DiscoveryResource>>(
    getInitialDiscoveryState,
  )
  const [discoveryKey, setDiscoveryKey] = useState(0)
  const forceLiveDiscoveryRef = useRef(false)
  const [scannerDraft, setScannerDraft] = useState<OfferDraft>(() => createBlankDraft())
  const [scannerResult, setScannerResult] = useState<ResourceState<OfferValidationResult> | undefined>()
  const [isScanning, setIsScanning] = useState(false)
  const [isSavingOffer, setIsSavingOffer] = useState(false)
  const [deletingOfferId, setDeletingOfferId] = useState<string | undefined>()
  const [writeNotice, setWriteNotice] = useState<string | undefined>()
  const [memberMode, setMemberMode] = useState(false)
  const [memberView, setMemberView] = useState<MemberView>('dashboard')
  const [memberReturnView, setMemberReturnView] = useState<MemberView>()
  const [isMemberSidebarOpen, setIsMemberSidebarOpen] = useState(false)
  const [memberState, setMemberState] = useState<ResourceState<MemberResource>>(getInitialMemberState)
  const [savedSourceState, setSavedSourceState] = useState<ResourceState<SavedSourceResource>>(
    getInitialSavedSourceState,
  )
  const [savedDealState, setSavedDealState] = useState<ResourceState<SavedDealResource>>(
    getInitialSavedDealState,
  )
  const [basketState, setBasketState] = useState<ResourceState<BasketResource>>(getInitialBasketState)
  const [subscriptionState, setSubscriptionState] = useState<ResourceState<SubscriptionResource>>(
    getInitialSubscriptionState,
  )
  const [memberDraft, setMemberDraft] = useState<MemberSessionDraft>({
    displayName: '',
    email: '',
    intent: 'signup',
    password: '',
  })
  const [memberNotice, setMemberNotice] = useState<string | undefined>()
  const [isStartingMemberSession, setIsStartingMemberSession] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [savingSourceUrl, setSavingSourceUrl] = useState<string | undefined>()
  const [savingDealUrl, setSavingDealUrl] = useState<string | undefined>()
  const [addingBasketDealId, setAddingBasketDealId] = useState<string | undefined>()
  const [deletingSourceId, setDeletingSourceId] = useState<string | undefined>()
  const [deletingDealId, setDeletingDealId] = useState<string | undefined>()
  const [deletingBasketItemId, setDeletingBasketItemId] = useState<string | undefined>()
  const [updatingBasketItemId, setUpdatingBasketItemId] = useState<string | undefined>()
  const [checkoutPlanId, setCheckoutPlanId] = useState<MemberPlanId | undefined>()
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [vouchersLoading, setVouchersLoading] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('trolley-scout-theme', theme)
  }, [theme])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRetailerState((current) => ({
        ...current,
        message: 'Checking source directory.',
        status: 'loading',
      }))

      loadRetailers({
        query,
        sourceKind,
        signal: controller.signal,
      })
        .then(setRetailerState)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
        })
        .finally(() => setIsRefreshing(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, refreshKey, sourceKind])

  useEffect(() => {
    if (!memberState.data.session.isAuthenticated || query.trim().length < 3) {
      return
    }

    const timer = window.setTimeout(() => {
      void recordDealLearningActivity({
        eventType: 'search_submitted',
        term: query,
      }).catch(() => undefined)
    }, 800)

    return () => window.clearTimeout(timer)
  }, [memberState.data.session.isAuthenticated, query])

  useEffect(() => {
    const controller = new AbortController()

    setOfferState((current) => ({
      ...current,
      message: 'Checking offer board.',
      status: 'loading',
    }))

    loadOffers(controller.signal)
      .then(setOfferState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
      .finally(() => setIsRefreshing(false))

    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const controller = new AbortController()

    loadMemberSession(controller.signal)
      .then((state) => {
        setMemberState(state)

        if (state.data.session.isAuthenticated) {
          setMemberMode(true)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setVouchersLoading(true)
    loadVouchers({ signal: controller.signal })
      .then((rows) => {
        if (active) {
          setVouchers(rows)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        if (active) {
          setVouchers([])
        }
      })
      .finally(() => {
        if (active) {
          setVouchersLoading(false)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [memberState.data.session.isAuthenticated])

  useEffect(() => {
    const controller = new AbortController()

    if (!memberState.data.session.isAuthenticated) {
      setSavedSourceState(getInitialSavedSourceState())
      setSavedDealState(getInitialSavedDealState())
      setBasketState(getInitialBasketState())
      setSubscriptionState(getInitialSubscriptionState())
      return () => controller.abort()
    }

    setSavedSourceState((current) => ({
      ...current,
      message: 'Checking saved sources.',
      status: 'loading',
    }))
    setSubscriptionState((current) => ({
      ...current,
      message: 'Checking subscription.',
      status: 'loading',
    }))
    setSavedDealState((current) => ({
      ...current,
      message: 'Checking saved deals.',
      status: 'loading',
    }))
    setBasketState((current) => ({
      ...current,
      message: 'Checking basket.',
      status: 'loading',
    }))

    loadSavedSources(controller.signal)
      .then(setSavedSourceState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
    loadSubscription(controller.signal)
      .then(setSubscriptionState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
    loadSavedDeals(controller.signal)
      .then(setSavedDealState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
    loadBasket(controller.signal)
      .then(setBasketState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => controller.abort()
  }, [memberState.data.session.isAuthenticated])

  const sourceKinds = retailerState.data.summary.sourceKinds
  const filteredRetailers = retailerState.data.retailers
  const officialSourceCount = retailerState.data.summary.sourceCount
  const retailerCount = retailerState.data.summary.retailerCount
  const apiMode = retailerState.meta.source === 'cloudflare-pages' ? 'API live' : 'Local list'
  const memberSession = memberState.data.session
  const discoveryVisible =
    activeView === 'home' ||
    activeView === 'discovery' ||
    (memberSession.isAuthenticated && (memberView === 'discovery' || memberView === 'dashboard'))
  const savedSourceUrls = new Set(savedSourceState.data.savedSources.map((source) => source.sourceUrl))
  const savedSourceCount = savedSourceState.data.savedSources.length
  const savedDealUrls = new Set(savedDealState.data.savedDeals.map((deal) => deal.productUrl))
  const savedDealCount = savedDealState.data.savedDeals.length
  const basketSavedDealIds = new Set(basketState.data.basket.items.map((item) => item.savedDealId))
  const basketItemCount = basketState.data.basket.summary.itemCount

  useEffect(() => {
    const controller = new AbortController()

    if (!discoveryVisible) {
      return () => controller.abort()
    }

    const forceLive = forceLiveDiscoveryRef.current
    forceLiveDiscoveryRef.current = false

    setIsDiscovering(true)
    setDiscoveryState((current) => ({
      ...current,
      message: forceLive ? 'Checking every source now.' : 'Loading latest deals.',
      status: 'loading',
    }))

    loadDiscovery(controller.signal, { forceLive })
      .then(setDiscoveryState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
      .finally(() => setIsDiscovering(false))

    return () => controller.abort()
  }, [discoveryKey, discoveryVisible])

  function refreshSources() {
    setIsRefreshing(true)
    setRefreshKey((current) => current + 1)
  }

  function runDiscovery() {
    forceLiveDiscoveryRef.current = true
    setDiscoveryKey((current) => current + 1)
  }

  function updateMemberDraft(field: keyof MemberSessionDraft, value: string) {
    setMemberNotice(undefined)
    setMemberDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function startMemberModeSession() {
    setIsStartingMemberSession(true)
    setMemberNotice(undefined)

    try {
      const result = await startMemberSession(memberDraft)
      setMemberState(result)
      setMemberNotice(result.message)

      if (result.data.session.isAuthenticated) {
        setMemberMode(true)
        setMemberView(memberReturnView ?? 'dashboard')
        setMemberReturnView(undefined)
      }
    } finally {
      setIsStartingMemberSession(false)
    }
  }

  async function saveVoucher(voucherId: string) {
    try {
      const claimed = await claimVoucher(voucherId)
      if (claimed) {
        setVouchers((current) => current.map((voucher) =>
          voucher.id === voucherId ? { ...voucher, claimed: true } : voucher,
        ))
        return
      }
      throw new Error('This voucher could not be saved.')
    } catch (error) {
      setMemberNotice(error instanceof Error ? error.message : 'Could not save this voucher.')
      throw error
    }
  }

  async function removeSavedVoucher(voucherId: string) {
    try {
      const removed = await removeVoucherClaim(voucherId)
      if (removed) {
        setVouchers((current) => current.map((voucher) =>
          voucher.id === voucherId ? { ...voucher, claimed: false } : voucher,
        ))
        return
      }
      throw new Error('This saved voucher could not be removed.')
    } catch (error) {
      setMemberNotice(error instanceof Error ? error.message : 'Could not remove this voucher.')
      throw error
    }
  }

  function requireVoucherAuthentication() {
    setMemberReturnView('vouchers')
    setMemberMode(true)
  }

  async function signOutMemberMode() {
    const result = await endMemberSession()
    setMemberState(result)
    setSavedSourceState(getInitialSavedSourceState())
    setSavedDealState(getInitialSavedDealState())
    setBasketState(getInitialBasketState())
    setSubscriptionState(getInitialSubscriptionState())
    setMemberMode(false)
    setMemberView('dashboard')
    setMemberNotice(undefined)
  }

  async function saveSource(retailerId: Retailer['id'], sourceUrl: string) {
    if (!memberSession.isAuthenticated) {
      setMemberMode(true)
      setMemberNotice('Start a member session before saving sources.')
      return
    }

    setSavingSourceUrl(sourceUrl)
    setMemberNotice(undefined)

    try {
      const result = await saveSourceForMember({ retailerId, sourceUrl })

      if ('savedSources' in result.data) {
        setSavedSourceState({
          data: {
            savedSources: result.data.savedSources,
          },
          message: result.message,
          meta: result.meta,
          status: result.status,
        })
        setMemberNotice(result.message)
      }
    } finally {
      setSavingSourceUrl(undefined)
    }
  }

  async function removeSavedSource(id: string) {
    setDeletingSourceId(id)
    setMemberNotice(undefined)

    try {
      const result = await deleteSavedSource(id)
      setSavedSourceState({
        data: {
          savedSources: result.data.savedSources,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)
    } finally {
      setDeletingSourceId(undefined)
    }
  }

  async function saveDiscoveredDeal(deal: DiscoveredDeal) {
    if (!memberSession.isAuthenticated) {
      setMemberMode(true)
      setMemberNotice('Start a member session before saving deals.')
      return
    }

    setSavingDealUrl(deal.productUrl)
    setMemberNotice(undefined)

    try {
      const result = await saveDealForMember(deal)

      if ('savedDeals' in result.data) {
        setSavedDealState({
          data: {
            savedDeals: result.data.savedDeals,
          },
          message: result.message,
          meta: result.meta,
          status: result.status,
        })
        setMemberNotice(result.message)

        if (result.status === 'ready') {
          void recordDealLearningActivity({
            eventType: 'deal_saved',
            retailerId: deal.retailerId,
            title: deal.title,
          }).catch(() => undefined)
        }
      }
    } finally {
      setSavingDealUrl(undefined)
    }
  }

  async function addSavedDealToBasket(savedDealId: string) {
    setAddingBasketDealId(savedDealId)
    setMemberNotice(undefined)

    try {
      const result = await addBasketItemForMember({ savedDealId })
      setBasketState({
        data: {
          basket: result.data.basket,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)

      if (result.status === 'ready') {
        const deal = savedDealState.data.savedDeals.find((candidate) => candidate.id === savedDealId)
        if (deal) {
          void recordDealLearningActivity({
            eventType: 'basket_added',
            retailerId: deal.retailerId,
            title: deal.title,
          }).catch(() => undefined)
        }
        setMemberView('basket')
      }
    } finally {
      setAddingBasketDealId(undefined)
    }
  }

  async function removeSavedDeal(id: string) {
    setDeletingDealId(id)
    setMemberNotice(undefined)

    try {
      const result = await deleteSavedDeal(id)
      setSavedDealState({
        data: {
          savedDeals: result.data.savedDeals,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)

      const basket = await loadBasket()
      setBasketState(basket)
    } finally {
      setDeletingDealId(undefined)
    }
  }

  async function updateBasketQuantity(item: BasketItem, quantity: number) {
    setUpdatingBasketItemId(item.id)
    setMemberNotice(undefined)

    try {
      const result = await updateBasketItemForMember({ id: item.id, quantity })
      setBasketState({
        data: {
          basket: result.data.basket,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)
    } finally {
      setUpdatingBasketItemId(undefined)
    }
  }

  async function removeBasketItem(id: string) {
    setDeletingBasketItemId(id)
    setMemberNotice(undefined)

    try {
      const result = await deleteBasketItemForMember(id)
      setBasketState({
        data: {
          basket: result.data.basket,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)
    } finally {
      setDeletingBasketItemId(undefined)
    }
  }

  async function requestCheckout(planId: MemberPlanId, billingCycle: BillingCycle) {
    setCheckoutPlanId(planId)
    setMemberNotice(undefined)

    try {
      const result = await startSubscriptionCheckout({ billingCycle, planId })
      setMemberNotice(result.message)

      const { checkout } = result.data

      // Fallback: accounts without onsite payments get PayFast's classic
      // redirect checkout — a POST form submission to PayFast.
      if (checkout.redirectUrl && checkout.redirectFields) {
        submitPayFastRedirect(checkout.redirectUrl, checkout.redirectFields)
        return
      }

      // PayFast onsite: open the secure payment modal in place rather than
      // redirecting away, so the member never leaves Trolley Scout.
      if (checkout.onsiteUuid && checkout.engineUrl) {
        const outcome = await openPayFastOnsite({
          engineUrl: checkout.engineUrl,
          onsiteUuid: checkout.onsiteUuid,
        })

        if (outcome === 'closed') {
          setMemberNotice('PayFast was closed. Your plan is unchanged.')
          return
        }

        setMemberNotice('Payment submitted. Waiting for PayFast confirmation.')

        for (let attempt = 0; attempt < 5; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 800 : 1_500))
          const subscription = await loadSubscription()
          setSubscriptionState(subscription)

          if (subscription.data.account) {
            setMemberState((current) => ({
              ...current,
              data: {
                session: {
                  account: subscription.data.account,
                  isAuthenticated: true,
                },
              },
            }))
          }

          if (
            subscription.data.account?.planId === planId &&
            subscription.data.account.planStatus === 'active'
          ) {
            setMemberNotice(`PayFast confirmed your ${subscription.data.account.planName} plan.`)
            return
          }
        }

        setMemberNotice('Payment submitted. Your plan will update after PayFast confirms it.')
        return
      }

      const subscription = await loadSubscription()
      setSubscriptionState(subscription)
    } finally {
      setCheckoutPlanId(undefined)
    }
  }

  function updateScannerDraft(field: keyof OfferDraft, value: string) {
    setWriteNotice(undefined)
    setScannerDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function resetScannerDraft() {
    setScannerDraft(createBlankDraft())
    setScannerResult(undefined)
    setWriteNotice(undefined)
  }

  function reviewDiscoveredDeal(deal: DiscoveredDeal) {
    const directoryRetailer = initialRetailers.find((retailer) => retailer.id === deal.retailerId)
    if (!directoryRetailer) {
      setWriteNotice('This discovered supermarket is not in the scanner directory yet.')
      return
    }

    setScannerDraft({
      capturedAt: deal.capturedAt.slice(0, 10),
      priceText: deal.priceText ?? '',
      retailerId: directoryRetailer.id,
      savingText: deal.savingText ?? '',
      sourceUrl: deal.productUrl || deal.sourceUrl,
      termsText: deal.evidenceText,
      title: deal.title,
      validFrom: '',
      validTo: '',
    })
    setScannerResult(undefined)
    setWriteNotice('Discovery row copied to scanner. Add valid dates and source terms before saving.')

    if (memberSession.isAuthenticated) {
      setMemberView('scanner')
      return
    }

    setActiveView('scanner')
  }

  async function scanOfferDraft() {
    setIsScanning(true)
    setWriteNotice(undefined)

    try {
      const result = await validateOfferDraft(scannerDraft)
      setScannerResult(result)
    } finally {
      setIsScanning(false)
    }
  }

  async function saveScannerDraft() {
    setIsSavingOffer(true)
    setWriteNotice(undefined)

    try {
      const result = await createVerifiedOffer(scannerDraft)

      if ('offer' in result.data) {
        const savedData = result.data

        setWriteNotice('Verified offer saved.')
        setOfferState((current) => ({
          data: {
            offers: [
              savedData.offer,
              ...current.data.offers.filter((offer) => offer.id !== savedData.offer.id),
            ],
            summary: savedData.summary,
          },
          message: result.message,
          meta: result.meta,
          status: 'ready',
        }))
        setActiveView('offers')
      } else {
        setScannerResult({
          data: result.data,
          message: result.message,
          meta: result.meta,
          status: result.status,
        })
      }
    } finally {
      setIsSavingOffer(false)
    }
  }

  async function removeOffer(id: string) {
    setDeletingOfferId(id)
    setWriteNotice(undefined)

    try {
      const result = await deleteVerifiedOffer(id)
      setWriteNotice(result.message)

      if (result.data.deleted) {
        setOfferState((current) => ({
          data: {
            offers: current.data.offers.filter((offer) => offer.id !== id),
            summary: result.data.summary,
          },
          message: result.message,
          meta: result.meta,
          status: 'ready',
        }))
      }
    } finally {
      setDeletingOfferId(undefined)
    }
  }

  if (memberMode && !memberSession.isAuthenticated) {
    return (
      <MemberAuthScreen
        draft={memberDraft}
        isStarting={isStartingMemberSession}
        memberState={memberState}
        notice={memberNotice}
        onBack={() => {
          setMemberMode(false)
          setMemberNotice(undefined)
        }}
        onSubmit={startMemberModeSession}
        onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onUpdate={updateMemberDraft}
        theme={theme}
      />
    )
  }

  if (memberSession.isAuthenticated && memberSession.account) {
    return (
      <MemberShell
        activeView={memberView}
        addingBasketDealId={addingBasketDealId}
        apiMode={apiMode}
        basketItemCount={basketItemCount}
        basketSavedDealIds={basketSavedDealIds}
        basketState={basketState}
        checkoutPlanId={checkoutPlanId}
        deletingBasketItemId={deletingBasketItemId}
        deletingOfferId={deletingOfferId}
        deletingDealId={deletingDealId}
        deletingSourceId={deletingSourceId}
        discoveryState={discoveryState}
        isDiscovering={isDiscovering}
        isRefreshing={isRefreshing}
        isSavingOffer={isSavingOffer}
        isScanning={isScanning}
        memberNotice={memberNotice}
        memberState={memberState}
        offerState={offerState}
        onAddToBasket={addSavedDealToBasket}
        onCheckout={requestCheckout}
        onCloseSidebar={() => setIsMemberSidebarOpen(false)}
        onDeleteBasketItem={removeBasketItem}
        onDeleteOffer={removeOffer}
        onDeleteDeal={removeSavedDeal}
        onDeleteSource={removeSavedSource}
        onRefresh={refreshSources}
        onReviewDeal={reviewDiscoveredDeal}
        onRunDiscovery={runDiscovery}
        onResetScanner={resetScannerDraft}
        onSaveOffer={saveScannerDraft}
        onSaveDeal={saveDiscoveredDeal}
        onSaveSource={saveSource}
        onScan={scanOfferDraft}
        onSetView={setMemberView}
        onSignOut={signOutMemberMode}
        onClaimVoucher={saveVoucher}
        onRemoveVoucher={removeSavedVoucher}
        onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onToggleSidebar={() => setIsMemberSidebarOpen((current) => !current)}
        onUpdateBasketQuantity={updateBasketQuantity}
        onUpdateScanner={updateScannerDraft}
        onQueryChange={setQuery}
        onSourceKindChange={setSourceKind}
        query={query}
        retailerState={retailerState}
        savedDealCount={savedDealCount}
        savedDealState={savedDealState}
        savedDealUrls={savedDealUrls}
        savedSourceCount={savedSourceCount}
        savedSourceState={savedSourceState}
        savedSourceUrls={savedSourceUrls}
        savingSourceUrl={savingSourceUrl}
        savingDealUrl={savingDealUrl}
        scannerDraft={scannerDraft}
        scannerResult={scannerResult}
        sidebarOpen={isMemberSidebarOpen}
        sourceKind={sourceKind}
        subscriptionState={subscriptionState}
        theme={theme}
        updatingBasketItemId={updatingBasketItemId}
        vouchers={vouchers}
        vouchersLoading={vouchersLoading}
        writeNotice={writeNotice}
      />
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand-mark" href="#top" aria-label="Trolley Scout home">
          <ScoutMark motion="scout" />
          <span>Trolley Scout</span>
        </a>

        <nav className="view-switcher" aria-label="App views">
          {viewOptions.map((view) => (
            <button
              className={clsx('switcher-button', activeView === view.value && 'is-active')}
              key={view.value}
              onClick={() => setActiveView(view.value)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            className="member-button"
            onClick={() => {
              setMemberReturnView(undefined)
              setMemberMode(true)
            }}
            type="button"
          >
            <UserCircle size={18} />
            Sign in
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            type="button"
            aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
          >
            {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      <nav className="data-desk-nav" aria-label="Data desk views">
        <span>Data desk</span>
        {dataDeskOptions.map((view) => (
          <button
            className={clsx('data-desk-link', activeView === view.value && 'is-active')}
            key={view.value}
            onClick={() => setActiveView(view.value)}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </nav>

      <main id="top">
        {activeView === 'home' && (
          <HomeView
            isCheckingStaples={isDiscovering}
            onOpen={(destination: HomeDestination) => setActiveView(destination)}
            stapleDeals={pickStapleDeals(discoveryState.data.discovery.deals)}
          />
        )}

        {activeView === 'near' && <NearMeView />}

        {activeView === 'help' && <MoneyHelpView onOpenSources={() => setActiveView('sources')} />}

        {activeView === 'tools' && <ToolkitView />}

        {activeView === 'vouchers' && (
          <VouchersView
            isAuthenticated={memberSession.isAuthenticated}
            isLoading={vouchersLoading}
            onClaim={saveVoucher}
            onRemove={removeSavedVoucher}
            onRequireAuth={requireVoucherAuthentication}
            vouchers={vouchers}
          />
        )}

        {activeView === 'about' && (
          <AboutView onOpen={(destination: AboutDestination) => setActiveView(destination)} />
        )}

        {(activeView === 'sources' || activeView === 'discovery' || activeView === 'offers' || activeView === 'scanner') && (
          <RuntimeBanner retailerState={retailerState} offerState={offerState} />
        )}

        {activeView === 'sources' && (
          <>
            <section className="member-section-head">
              <div>
                <p className="eyebrow">Official pages only</p>
                <h1>Stores</h1>
                <p className="section-lede">
                  Specials pages, catalogues, and free loyalty sign-ups for {retailerCount}{' '}
                  retailers with {officialSourceCount} official links, so you never have to trust
                  a forwarded screenshot.
                </p>
              </div>
              <button className="primary-button" type="button" onClick={refreshSources}>
                <ArrowClockwise size={18} className={clsx(isRefreshing && 'is-spinning')} />
                Check sources
              </button>
            </section>
            <section className="filter-panel" aria-label="Source filters">
              <div className="search-field">
                <MagnifyingGlass size={20} />
                <input
                  aria-label="Search sources"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search store, program, or source type"
                  value={query}
                />
                {query && (
                  <button aria-label="Clear search" onClick={() => setQuery('')} type="button">
                    Clear
                  </button>
                )}
              </div>

              <div className="filter-row">
                <span className="filter-label">
                  <SlidersHorizontal size={18} />
                  Type
                </span>
                <button
                  className={clsx('chip', sourceKind === 'all' && 'is-active')}
                  onClick={() => setSourceKind('all')}
                  type="button"
                >
                  {sourceLabels.all}
                </button>
                {sourceKinds.map((kind) => (
                  <button
                    className={clsx('chip', sourceKind === kind && 'is-active')}
                    key={kind}
                    onClick={() => setSourceKind(kind)}
                    type="button"
                  >
                    {sourceLabels[kind]}
                  </button>
                ))}
              </div>
            </section>

            <SourcePanel retailers={filteredRetailers} isLoading={retailerState.status === 'loading'} />
          </>
        )}

        {activeView === 'discovery' && (
          <DiscoveryPanel
            isDiscovering={isDiscovering}
            onReviewDeal={reviewDiscoveredDeal}
            onRunDiscovery={runDiscovery}
            state={discoveryState}
          />
        )}

        {activeView === 'offers' && (
          <OffersPanel
            deletingOfferId={deletingOfferId}
            onDelete={removeOffer}
            state={offerState}
            writeNotice={writeNotice}
          />
        )}
        {activeView === 'scanner' && (
          <ScannerPanel
            draft={scannerDraft}
            isSaving={isSavingOffer}
            isScanning={isScanning}
            onReset={resetScannerDraft}
            onSave={saveScannerDraft}
            onScan={scanOfferDraft}
            onUpdate={updateScannerDraft}
            result={scannerResult}
            writeNotice={writeNotice}
          />
        )}
        {activeView === 'rules' && <RulesPanel />}
      </main>
    </div>
  )
}

function MemberAuthScreen({
  draft,
  isStarting,
  memberState,
  notice,
  onBack,
  onSubmit,
  onThemeToggle,
  onUpdate,
  theme,
}: {
  draft: MemberSessionDraft
  isStarting: boolean
  memberState: ResourceState<MemberResource>
  notice?: string
  onBack: () => void
  onSubmit: () => void
  onThemeToggle: () => void
  onUpdate: (field: keyof MemberSessionDraft, value: string) => void
  theme: ThemeMode
}) {
  const isSignup = draft.intent !== 'login'

  return (
    <div className="app-shell auth-shell">
      <header className="topbar">
        <button className="brand-mark brand-button" onClick={onBack} type="button">
          <ScoutMark motion="scout" />
          <span>Trolley Scout</span>
        </button>
        <div />
        <button
          className="icon-button"
          onClick={onThemeToggle}
          type="button"
          aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        >
          {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
        </button>
      </header>

      <main>
        <section className="auth-panel" aria-label="Member sign in">
          <div className="auth-copy">
            <p className="eyebrow">Member workspace</p>
            <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p>
              {isSignup
                ? 'Sign up free to save deals and sources, plan a basket, and keep your lists across devices. No card needed.'
                : 'Log in to your saved deals, sources, and basket.'}
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            <div className="auth-toggle" role="tablist" aria-label="Sign up or log in">
              <button
                aria-selected={isSignup}
                className={clsx('auth-toggle-button', isSignup && 'is-active')}
                onClick={() => onUpdate('intent', 'signup')}
                role="tab"
                type="button"
              >
                Sign up
              </button>
              <button
                aria-selected={!isSignup}
                className={clsx('auth-toggle-button', !isSignup && 'is-active')}
                onClick={() => onUpdate('intent', 'login')}
                role="tab"
                type="button"
              >
                Log in
              </button>
            </div>

            {isSignup && (
              <label className="field">
                Display name
                <input
                  autoComplete="name"
                  onChange={(event) => onUpdate('displayName', event.target.value)}
                  placeholder="Your name"
                  required
                  value={draft.displayName}
                />
              </label>
            )}
            <label className="field">
              Email
              <input
                autoComplete="email"
                onChange={(event) => onUpdate('email', event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={draft.email}
              />
            </label>
            <label className="field">
              Password
              <input
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={8}
                onChange={(event) => onUpdate('password', event.target.value)}
                placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
                required
                type="password"
                value={draft.password ?? ''}
              />
            </label>
            {(notice || memberState.status === 'error') && (
              <div className="write-notice" role="status">{notice ?? memberState.message}</div>
            )}
            <div className="scanner-actions">
              <button className="primary-button" disabled={isStarting} type="submit">
                <UserCircle size={18} />
                {isStarting ? 'Please wait' : isSignup ? 'Create account' : 'Log in'}
              </button>
              <button className="ghost-button" onClick={onBack} type="button">
                Back
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

function MemberShell({
  activeView,
  addingBasketDealId,
  apiMode,
  basketItemCount,
  basketSavedDealIds,
  basketState,
  checkoutPlanId,
  deletingBasketItemId,
  deletingOfferId,
  deletingDealId,
  deletingSourceId,
  discoveryState,
  isDiscovering,
  isRefreshing,
  isSavingOffer,
  isScanning,
  memberNotice,
  memberState,
  offerState,
  onAddToBasket,
  onClaimVoucher,
  onCheckout,
  onCloseSidebar,
  onDeleteBasketItem,
  onDeleteOffer,
  onDeleteDeal,
  onDeleteSource,
  onQueryChange,
  onRefresh,
  onRemoveVoucher,
  onReviewDeal,
  onRunDiscovery,
  onResetScanner,
  onSaveOffer,
  onSaveDeal,
  onSaveSource,
  onScan,
  onSetView,
  onSignOut,
  onSourceKindChange,
  onThemeToggle,
  onToggleSidebar,
  onUpdateBasketQuantity,
  onUpdateScanner,
  query,
  retailerState,
  savedDealCount,
  savedDealState,
  savedDealUrls,
  savedSourceCount,
  savedSourceState,
  savedSourceUrls,
  savingSourceUrl,
  savingDealUrl,
  scannerDraft,
  scannerResult,
  sidebarOpen,
  sourceKind,
  subscriptionState,
  theme,
  updatingBasketItemId,
  vouchers,
  vouchersLoading,
  writeNotice,
}: {
  activeView: MemberView
  addingBasketDealId?: string
  apiMode: string
  basketItemCount: number
  basketSavedDealIds: Set<string>
  basketState: ResourceState<BasketResource>
  checkoutPlanId?: MemberPlanId
  deletingBasketItemId?: string
  deletingOfferId?: string
  deletingDealId?: string
  deletingSourceId?: string
  discoveryState: ResourceState<DiscoveryResource>
  isDiscovering: boolean
  isRefreshing: boolean
  isSavingOffer: boolean
  isScanning: boolean
  memberNotice?: string
  memberState: ResourceState<MemberResource>
  offerState: ResourceState<OfferResource>
  onAddToBasket: (savedDealId: string) => void
  onClaimVoucher: (voucherId: string) => void | Promise<void>
  onCheckout: (planId: MemberPlanId, billingCycle: BillingCycle) => void
  onCloseSidebar: () => void
  onDeleteBasketItem: (id: string) => void
  onDeleteOffer: (id: string) => void
  onDeleteDeal: (id: string) => void
  onDeleteSource: (id: string) => void
  onQueryChange: (value: string) => void
  onRefresh: () => void
  onRemoveVoucher: (voucherId: string) => void | Promise<void>
  onReviewDeal: (deal: DiscoveredDeal) => void
  onRunDiscovery: () => void
  onResetScanner: () => void
  onSaveOffer: () => void
  onSaveDeal: (deal: DiscoveredDeal) => void
  onSaveSource: (retailerId: Retailer['id'], sourceUrl: string) => void
  onScan: () => void
  onSetView: (view: MemberView) => void
  onSignOut: () => void
  onSourceKindChange: (value: SourceKind | 'all') => void
  onThemeToggle: () => void
  onToggleSidebar: () => void
  onUpdateBasketQuantity: (item: BasketItem, quantity: number) => void
  onUpdateScanner: (field: keyof OfferDraft, value: string) => void
  query: string
  retailerState: ResourceState<RetailerResource>
  savedDealCount: number
  savedDealState: ResourceState<SavedDealResource>
  savedDealUrls: Set<string>
  savedSourceCount: number
  savedSourceState: ResourceState<SavedSourceResource>
  savedSourceUrls: Set<string>
  savingSourceUrl?: string
  savingDealUrl?: string
  scannerDraft: OfferDraft
  scannerResult?: ResourceState<OfferValidationResult>
  sidebarOpen: boolean
  sourceKind: SourceKind | 'all'
  subscriptionState: ResourceState<SubscriptionResource>
  theme: ThemeMode
  updatingBasketItemId?: string
  vouchers: Voucher[]
  vouchersLoading: boolean
  writeNotice?: string
}) {
  const account = memberState.data.session.account

  if (!account) {
    return null
  }

  const sourceKinds = retailerState.data.summary.sourceKinds

  return (
    <div className="member-shell">
      <a className="skip-link" href="#member-main">
        Skip to content
      </a>
      <header className="member-topbar">
        <button
          aria-controls="member-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          className="icon-button member-menu-toggle"
          id="member-menu"
          onClick={onToggleSidebar}
          type="button"
        >
          <List size={20} />
        </button>
        <a className="brand-mark" href="#member-main" aria-label="Trolley Scout dashboard">
          <ScoutMark motion="scout" />
          <span>Trolley Scout</span>
        </a>
        <div className="member-topbar-actions">
          <span className="plan-pill">{account.planName}</span>
          <DealWatchBell />
          <button
            className="icon-button"
            onClick={onThemeToggle}
            type="button"
            aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
          >
            {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
          </button>
          <button className="icon-button" onClick={onSignOut} type="button" aria-label="Sign out">
            <SignOut size={20} />
          </button>
        </div>
      </header>

      {sidebarOpen && <button className="member-backdrop" onClick={onCloseSidebar} type="button" aria-label="Close menu" />}

      <aside className={clsx('member-sidebar', sidebarOpen && 'is-open')} id="member-sidebar">
        <button className="member-profile-button" onClick={() => onSetView('profile')} type="button">
          <span>{account.initials}</span>
          <div>
            <strong>{account.displayName}</strong>
            <small>{account.planName}</small>
          </div>
        </button>
        <nav className="member-nav" aria-label="Member navigation">
          {(account.role === 'admin'
            ? [...memberViewOptions, adminViewOption]
            : memberViewOptions
          ).map((item) => (
            <button
              className={clsx('member-nav-button', activeView === item.value && 'is-active')}
              key={item.value}
              onClick={() => {
                onSetView(item.value)
                onCloseSidebar()
              }}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="member-main" id="member-main">
        {activeView === 'dashboard' && (
          <MemberDashboard
            account={account}
            apiMode={apiMode}
            basketItemCount={basketItemCount}
            basketTotal={formatRand(basketState.data.basket.summary.totalCents)}
            discoveryCount={discoveryState.data.discovery.summary.foundDealCount}
            onRefresh={onRefresh}
            onSetView={onSetView}
            retailerState={retailerState}
            savedDealCount={savedDealCount}
            savedSourceCount={savedSourceCount}
            verifiedOfferCount={offerState.data.summary.verifiedOfferCount}
          />
        )}

        {activeView === 'near' && <NearMeView />}

        {activeView === 'help' && <MoneyHelpView onOpenSources={() => onSetView('sources')} />}

        {activeView === 'tools' && <ToolkitView />}

        {activeView === 'vouchers' && (
          <VouchersView
            isAuthenticated
            isLoading={vouchersLoading}
            onClaim={onClaimVoucher}
            onRemove={onRemoveVoucher}
            onRequireAuth={() => undefined}
            vouchers={vouchers}
          />
        )}

        {activeView === 'about' && (
          <AboutView onOpen={(destination: AboutDestination) => onSetView(destination)} />
        )}

        {activeView === 'sources' && (
          <>
            <section className="member-section-head">
              <div>
                <p className="eyebrow">Official sources</p>
                <h1>Source directory</h1>
              </div>
              <button className="primary-button" type="button" onClick={onRefresh}>
                <ArrowClockwise size={18} className={clsx(isRefreshing && 'is-spinning')} />
                Check sources
              </button>
            </section>
            <SourceFilterPanel
              onQueryChange={onQueryChange}
              onSourceKindChange={onSourceKindChange}
              query={query}
              sourceKind={sourceKind}
              sourceKinds={sourceKinds}
            />
            <SourcePanel
              isLoading={retailerState.status === 'loading'}
              memberMode
              onSaveSource={onSaveSource}
              retailers={retailerState.data.retailers}
              savedSourceUrls={savedSourceUrls}
              savingSourceUrl={savingSourceUrl}
            />
          </>
        )}

        {activeView === 'discovery' && (
          <DiscoveryPanel
            canWatchItems
            isDiscovering={isDiscovering}
            onReviewDeal={onReviewDeal}
            onRunDiscovery={onRunDiscovery}
            onSaveDeal={onSaveDeal}
            savedDealUrls={savedDealUrls}
            savingDealUrl={savingDealUrl}
            state={discoveryState}
          />
        )}

        {activeView === 'savedDeals' && (
          <SavedDealsPanel
            addingBasketDealId={addingBasketDealId}
            basketSavedDealIds={basketSavedDealIds}
            deletingDealId={deletingDealId}
            memberNotice={memberNotice}
            onAddToBasket={onAddToBasket}
            onDelete={onDeleteDeal}
            onReviewDeal={onReviewDeal}
            savedDealState={savedDealState}
          />
        )}

        {activeView === 'basket' && (
          <BasketPanel
            basketState={basketState}
            deletingBasketItemId={deletingBasketItemId}
            memberNotice={memberNotice}
            onDeleteItem={onDeleteBasketItem}
            onReviewDeal={onReviewDeal}
            onSetView={onSetView}
            onUpdateQuantity={onUpdateBasketQuantity}
            updatingBasketItemId={updatingBasketItemId}
          />
        )}

        {activeView === 'saved' && (
          <SavedSourcesPanel
            deletingSourceId={deletingSourceId}
            memberNotice={memberNotice}
            onDelete={onDeleteSource}
            savedSourceState={savedSourceState}
          />
        )}

        {activeView === 'offers' && (
          <OffersPanel
            deletingOfferId={deletingOfferId}
            onDelete={onDeleteOffer}
            state={offerState}
            writeNotice={writeNotice}
          />
        )}

        {activeView === 'scanner' && (
          <ScannerPanel
            draft={scannerDraft}
            isSaving={isSavingOffer}
            isScanning={isScanning}
            onReset={onResetScanner}
            onSave={onSaveOffer}
            onScan={onScan}
            onUpdate={onUpdateScanner}
            result={scannerResult}
            writeNotice={writeNotice}
          />
        )}

        {activeView === 'subscription' && (
          <SubscriptionPanel
            account={account}
            checkoutPlanId={checkoutPlanId}
            memberNotice={memberNotice}
            onCheckout={onCheckout}
            subscriptionState={subscriptionState}
          />
        )}

        {activeView === 'profile' && (
          <MemberProfilePanel
            account={account}
            memberNotice={memberNotice}
            onSignOut={onSignOut}
            savedSourceCount={savedSourceCount}
          />
        )}

        {activeView === 'admin' && account.role === 'admin' && <AdminConsole />}

        {activeView === 'rules' && <RulesPanel />}
      </main>
    </div>
  )
}

function SourceFilterPanel({
  onQueryChange,
  onSourceKindChange,
  query,
  sourceKind,
  sourceKinds,
}: {
  onQueryChange: (value: string) => void
  onSourceKindChange: (value: SourceKind | 'all') => void
  query: string
  sourceKind: SourceKind | 'all'
  sourceKinds: SourceKind[]
}) {
  return (
    <section className="filter-panel" aria-label="Source filters">
      <div className="search-field">
        <MagnifyingGlass size={20} />
        <input
          aria-label="Search sources"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search store, program, or source type"
          value={query}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => onQueryChange('')} type="button">
            Clear
          </button>
        )}
      </div>

      <div className="filter-row">
        <span className="filter-label">
          <SlidersHorizontal size={18} />
          Type
        </span>
        <button
          className={clsx('chip', sourceKind === 'all' && 'is-active')}
          onClick={() => onSourceKindChange('all')}
          type="button"
        >
          {sourceLabels.all}
        </button>
        {sourceKinds.map((kind) => (
          <button
            className={clsx('chip', sourceKind === kind && 'is-active')}
            key={kind}
            onClick={() => onSourceKindChange(kind)}
            type="button"
          >
            {sourceLabels[kind]}
          </button>
        ))}
      </div>
    </section>
  )
}

function PlanUsage({
  account,
  basketItemCount,
  onSetView,
  savedDealCount,
  savedSourceCount,
}: {
  account: NonNullable<MemberSession['account']>
  basketItemCount: number
  onSetView: (view: MemberView) => void
  savedDealCount: number
  savedSourceCount: number
}) {
  const plan = getMemberPlan(account.planId)
  const rows: Array<{ label: string; used: number; limit: number }> = [
    { label: 'Saved deals', limit: plan.limits.savedDeals, used: savedDealCount },
    { label: 'Saved sources', limit: plan.limits.savedSources, used: savedSourceCount },
    { label: 'Basket items', limit: plan.limits.basketItems, used: basketItemCount },
  ]
  const nearLimit = rows.some((row) => row.used / row.limit >= 0.8)

  return (
    <section className="plan-usage" aria-label="Plan usage">
      <div className="plan-usage-head">
        <div>
          <p className="eyebrow">Your {plan.name} plan</p>
          <h2>Space used</h2>
        </div>
        {plan.id !== 'household' && (
          <button className="ghost-button" onClick={() => onSetView('subscription')} type="button">
            <CreditCard size={18} />
            {plan.id === 'free' ? 'See paid plans' : 'Upgrade'}
          </button>
        )}
      </div>

      <div className="plan-usage-grid">
        {rows.map((row) => {
          const percent = Math.min(100, Math.round((row.used / row.limit) * 100))
          const isFull = row.used >= row.limit

          return (
            <div className="usage-meter" key={row.label}>
              <div className="usage-meter-label">
                <span>{row.label}</span>
                <strong>
                  {row.used} / {row.limit}
                </strong>
              </div>
              <div
                aria-valuemax={row.limit}
                aria-valuenow={row.used}
                aria-label={row.label}
                className={clsx('usage-bar', isFull && 'is-full', !isFull && percent >= 80 && 'is-near')}
                role="progressbar"
              >
                <span style={{ width: `${percent}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {nearLimit && plan.id !== 'household' && (
        <p className="plan-usage-nudge">
          Running low on space. {plan.id === 'free' ? 'Scout' : 'Household'} gives you far more
          room and keeps the free money help running for everyone.
        </p>
      )}
    </section>
  )
}

function MemberDashboard({
  account,
  apiMode,
  basketItemCount,
  basketTotal,
  discoveryCount,
  onRefresh,
  onSetView,
  retailerState,
  savedDealCount,
  savedSourceCount,
  verifiedOfferCount,
}: {
  account: NonNullable<MemberSession['account']>
  apiMode: string
  basketItemCount: number
  basketTotal: string
  discoveryCount: number
  onRefresh: () => void
  onSetView: (view: MemberView) => void
  retailerState: ResourceState<RetailerResource>
  savedDealCount: number
  savedSourceCount: number
  verifiedOfferCount: number
}) {
  return (
    <section className="member-dashboard" aria-label="Member dashboard">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Welcome, {account.displayName}</h1>
        </div>
        <button className="primary-button" onClick={onRefresh} type="button">
          <ArrowClockwise size={18} />
          Refresh
        </button>
      </div>

      <div className="member-metrics">
        <Metric icon={<Storefront size={22} />} label="Retailers" value={`${retailerState.data.summary.retailerCount}`} />
        <Metric icon={<LinkSimple size={22} />} label="Official links" value={`${retailerState.data.summary.sourceCount}`} />
        <Metric icon={<Tag size={22} />} label="Found deals" value={`${discoveryCount}`} />
        <Metric icon={<Wallet size={22} />} label="Saved deals" value={`${savedDealCount}`} />
        <Metric icon={<ShoppingCart size={22} />} label="Basket total" value={basketTotal} />
        <Metric icon={<ShoppingCart size={22} />} label="Basket items" value={`${basketItemCount}`} />
        <Metric icon={<BookmarkSimple size={22} />} label="Saved sources" value={`${savedSourceCount}`} />
        <Metric icon={<ReceiptX size={22} />} label="Verified offers" value={`${verifiedOfferCount}`} />
      </div>

      <PlanUsage
        account={account}
        basketItemCount={basketItemCount}
        onSetView={onSetView}
        savedDealCount={savedDealCount}
        savedSourceCount={savedSourceCount}
      />

      <div className="dashboard-grid">
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Plan</p>
            <h2>{account.planName}</h2>
          </div>
          <p>{planStatusText(account.planStatus)}</p>
          <button className="ghost-button" onClick={() => onSetView('subscription')} type="button">
            <CreditCard size={18} />
            Manage plan
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Backend</p>
            <h2>{apiMode}</h2>
          </div>
          <p>Member data uses Cloudflare Pages Functions and D1 when the preview is running.</p>
          <button className="ghost-button" onClick={() => onSetView('sources')} type="button">
            <Storefront size={18} />
            Open sources
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Deal finder</p>
            <h2>Source-backed rows</h2>
          </div>
          <p>Check official deal pages and send useful rows to the scanner for review.</p>
          <button className="ghost-button" onClick={() => onSetView('discovery')} type="button">
            <Tag size={18} />
            Find deals
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Saved deals</p>
            <h2>Review later</h2>
          </div>
          <p>Keep useful rows from discovery and open them in the scanner when ready.</p>
          <button className="ghost-button" onClick={() => onSetView('savedDeals')} type="button">
            <Wallet size={18} />
            Saved deals
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Basket</p>
            <h2>Plan spend</h2>
          </div>
          <p>Add saved deals to a basket and watch the rand total before checkout.</p>
          <button className="ghost-button" onClick={() => onSetView('basket')} type="button">
            <ShoppingCart size={18} />
            Basket
          </button>
        </article>
      </div>
    </section>
  )
}

function SavedDealsPanel({
  addingBasketDealId,
  basketSavedDealIds,
  deletingDealId,
  memberNotice,
  onAddToBasket,
  onDelete,
  onReviewDeal,
  savedDealState,
}: {
  addingBasketDealId?: string
  basketSavedDealIds: Set<string>
  deletingDealId?: string
  memberNotice?: string
  onAddToBasket: (savedDealId: string) => void
  onDelete: (id: string) => void
  onReviewDeal: (deal: DiscoveredDeal) => void
  savedDealState: ResourceState<SavedDealResource>
}) {
  const savedDeals = savedDealState.data.savedDeals

  return (
    <section className="empty-panel" aria-label="Saved deals">
      {savedDealState.status === 'loading' && <LoadingStrip label="Checking saved deals" />}
      {memberNotice && <div className="write-notice" role="status">{memberNotice}</div>}
      {savedDeals.length > 0 ? (
        <div className="saved-source-list">
          {savedDeals.map((deal) => {
            const isInBasket = basketSavedDealIds.has(deal.id)

            return (
              <article className="saved-source-row" key={deal.id}>
                <div>
                  <p className="eyebrow">{deal.retailerName}</p>
                  <h3>{deal.title}</h3>
                  <p>{deal.priceText ?? 'No price text'}</p>
                  <p>Saved {deal.savedAt.slice(0, 10)}</p>
                </div>
                <div className="offer-actions">
                  <a href={deal.productUrl} rel="noreferrer" target="_blank">
                    Product
                    <LinkSimple size={14} />
                  </a>
                  <button
                    className="ghost-button"
                    disabled={isInBasket || addingBasketDealId === deal.id}
                    onClick={() => onAddToBasket(deal.id)}
                    type="button"
                  >
                    {isInBasket ? 'In basket' : addingBasketDealId === deal.id ? 'Adding' : 'Add to basket'}
                  </button>
                  <button className="ghost-button" onClick={() => onReviewDeal(deal)} type="button">
                    Review
                  </button>
                  <button
                    className="ghost-button"
                    disabled={deletingDealId === deal.id}
                    onClick={() => onDelete(deal.id)}
                    type="button"
                  >
                    {deletingDealId === deal.id ? 'Removing' : 'Remove'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <>
          <Wallet size={48} />
          <p className="eyebrow">Saved deals</p>
          <h2>No saved deals yet</h2>
          <p>Save rows from the deal finder to keep a short review list.</p>
        </>
      )}
    </section>
  )
}

function BasketPanel({
  basketState,
  deletingBasketItemId,
  memberNotice,
  onDeleteItem,
  onReviewDeal,
  onSetView,
  onUpdateQuantity,
  updatingBasketItemId,
}: {
  basketState: ResourceState<BasketResource>
  deletingBasketItemId?: string
  memberNotice?: string
  onDeleteItem: (id: string) => void
  onReviewDeal: (deal: DiscoveredDeal) => void
  onSetView: (view: MemberView) => void
  onUpdateQuantity: (item: BasketItem, quantity: number) => void
  updatingBasketItemId?: string
}) {
  const basket = basketState.data.basket
  const hasItems = basket.items.length > 0

  return (
    <section className="basket-panel" aria-label="Basket">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Basket</p>
          <h1>Source-backed spend</h1>
        </div>
        <button className="ghost-button" onClick={() => onSetView('savedDeals')} type="button">
          <Wallet size={18} />
          Saved deals
        </button>
      </div>

      {basketState.status === 'loading' && <LoadingStrip label="Checking basket" />}
      {memberNotice && <div className="write-notice" role="status">{memberNotice}</div>}

      {hasItems ? (
        <>
          <div className="basket-summary" aria-label="Basket summary">
            <article className="basket-total-card">
              <span>Total from prices</span>
              <strong>{formatRand(basket.summary.totalCents)}</strong>
              <p>
                {basket.summary.knownPriceItemCount} priced of {basket.summary.itemCount}
              </p>
            </article>
            <article className="basket-total-card">
              <span>Savings found</span>
              <strong>{formatRand(basket.summary.savingsCents)}</strong>
              <p>Based on previous price text when present.</p>
            </article>
            <article className="basket-total-card">
              <span>Items</span>
              <strong>{basket.summary.itemCount}</strong>
              <p>Quantities from saved source rows.</p>
            </article>
          </div>

          <div className="basket-list">
            {basket.items.map((item) => {
              const isUpdating = updatingBasketItemId === item.id
              const isDeleting = deletingBasketItemId === item.id

              return (
                <article className="basket-row" key={item.id}>
                  {item.deal.imageUrl && (
                    <img
                      alt=""
                      className="basket-product-image"
                      loading="lazy"
                      onError={(event) => { event.currentTarget.hidden = true }}
                      src={item.deal.imageUrl}
                    />
                  )}
                  <div className="basket-row-main">
                    <p className="eyebrow">{item.deal.retailerName}</p>
                    <h3>{item.deal.title}</h3>
                    <div className="deal-price-line">
                      {item.deal.priceText && <strong>{item.deal.priceText}</strong>}
                      {item.deal.previousPriceText && <span>{item.deal.previousPriceText}</span>}
                      {item.deal.savingText && <span>{item.deal.savingText}</span>}
                    </div>
                    <p>{item.deal.sourceLabel}</p>
                  </div>

                  <div className="basket-row-side">
                    <div className="quantity-control" aria-label={`Quantity for ${item.deal.title}`}>
                      <button
                        disabled={isUpdating || item.quantity <= 1}
                        onClick={() => onUpdateQuantity(item, item.quantity - 1)}
                        type="button"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <span aria-live="polite">{item.quantity}</span>
                      <button
                        disabled={isUpdating || item.quantity >= 99}
                        onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                        type="button"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <strong className="basket-line-total">
                      {item.linePriceCents === undefined ? 'Price not found' : formatRand(item.linePriceCents)}
                    </strong>
                    <div className="offer-actions">
                      <a href={item.deal.sourceUrl} rel="noreferrer" target="_blank">
                        Source
                        <LinkSimple size={14} />
                      </a>
                      <a href={item.deal.productUrl} rel="noreferrer" target="_blank">
                        Product
                        <LinkSimple size={14} />
                      </a>
                      <button className="ghost-button" onClick={() => onReviewDeal(item.deal)} type="button">
                        Review
                      </button>
                      <button
                        className="ghost-button"
                        disabled={isDeleting}
                        onClick={() => onDeleteItem(item.id)}
                        type="button"
                      >
                        <Trash size={16} />
                        {isDeleting ? 'Removing' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <div className="basket-empty">
          <ShoppingCart size={48} />
          <p className="eyebrow">Basket</p>
          <h2>Basket is empty</h2>
          <p>Add saved deals after a source check. The total uses prices found on retailer pages.</p>
          <button className="primary-button" onClick={() => onSetView('savedDeals')} type="button">
            <Wallet size={18} />
            Open saved deals
          </button>
        </div>
      )}
    </section>
  )
}

function SavedSourcesPanel({
  deletingSourceId,
  memberNotice,
  onDelete,
  savedSourceState,
}: {
  deletingSourceId?: string
  memberNotice?: string
  onDelete: (id: string) => void
  savedSourceState: ResourceState<SavedSourceResource>
}) {
  const savedSources = savedSourceState.data.savedSources

  return (
    <section className="empty-panel" aria-label="Saved sources">
      {savedSourceState.status === 'loading' && <LoadingStrip label="Checking saved sources" />}
      {memberNotice && <div className="write-notice" role="status">{memberNotice}</div>}
      {savedSources.length > 0 ? (
        <div className="saved-source-list">
          {savedSources.map((source) => (
            <article className="saved-source-row" key={source.id}>
              <div>
                <p className="eyebrow">{source.retailerName}</p>
                <h3>{source.sourceLabel}</h3>
                <p>{source.sourceKind}</p>
              </div>
              <div className="offer-actions">
                <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                  Source
                  <LinkSimple size={14} />
                </a>
                <button
                  className="ghost-button"
                  disabled={deletingSourceId === source.id}
                  onClick={() => onDelete(source.id)}
                  type="button"
                >
                  {deletingSourceId === source.id ? 'Removing' : 'Remove'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <BookmarkSimple size={48} />
          <p className="eyebrow">Saved sources</p>
          <h2>No saved sources yet</h2>
          <p>Save official retailer links from the source directory to build your member list.</p>
        </>
      )}
    </section>
  )
}

function SubscriptionPanel({
  account,
  checkoutPlanId,
  memberNotice,
  onCheckout,
  subscriptionState,
}: {
  account: NonNullable<MemberSession['account']>
  checkoutPlanId?: MemberPlanId
  memberNotice?: string
  onCheckout: (planId: MemberPlanId, billingCycle: BillingCycle) => void
  subscriptionState: ResourceState<SubscriptionResource>
}) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual')

  return (
    <section className="subscription-panel" aria-label="Subscription">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Subscription</p>
          <h1>Plan and billing</h1>
          <p className="section-lede">
            Free covers every household essential. Paid plans add space for power savers and keep
            the money help free for everyone. Billed securely in rand via PayFast.
          </p>
        </div>
        <span className="plan-pill">{subscriptionState.data.billingReady ? 'Billing ready' : 'Billing setup needed'}</span>
      </div>
      {memberNotice && <div className="write-notice" role="status">{memberNotice}</div>}

      <div className="billing-toggle" role="group" aria-label="Billing cycle">
        <button
          aria-pressed={billingCycle === 'monthly'}
          className={clsx('billing-toggle-option', billingCycle === 'monthly' && 'is-active')}
          onClick={() => setBillingCycle('monthly')}
          type="button"
        >
          Monthly
        </button>
        <button
          aria-pressed={billingCycle === 'annual'}
          className={clsx('billing-toggle-option', billingCycle === 'annual' && 'is-active')}
          onClick={() => setBillingCycle('annual')}
          type="button"
        >
          Annual <span className="billing-save">save 2 months</span>
        </button>
      </div>

      <div className="plan-grid">
        {subscriptionState.data.plans.map((plan) => {
          const isCurrent = plan.id === account.planId
          const priceCents = plan.prices[billingCycle]
          const buttonText = isCurrent
            ? 'Current plan'
            : plan.isPaid && !subscriptionState.data.billingReady
              ? 'Billing needed'
              : plan.isPaid
                ? 'Pay with PayFast'
                : 'Use free'

          return (
            <article className={clsx('plan-card', isCurrent && 'is-current')} key={plan.id}>
              <span>{plan.badge}</span>
              <h2>{plan.name}</h2>
              <p className="plan-price">
                {plan.isPaid ? (
                  <>
                    <strong>{formatRand(priceCents)}</strong>
                    <span>/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
                  </>
                ) : (
                  <strong>Free</strong>
                )}
              </p>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={isCurrent ? 'ghost-button' : 'primary-button'}
                disabled={isCurrent || checkoutPlanId === plan.id || (plan.isPaid && !subscriptionState.data.billingReady)}
                onClick={() => onCheckout(plan.id, billingCycle)}
                type="button"
              >
                <Wallet size={18} />
                {checkoutPlanId === plan.id ? 'Checking' : buttonText}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MemberProfilePanel({
  account,
  memberNotice,
  onSignOut,
  savedSourceCount,
}: {
  account: NonNullable<MemberSession['account']>
  memberNotice?: string
  onSignOut: () => void
  savedSourceCount: number
}) {
  return (
    <section className="profile-panel" aria-label="Member profile">
      <div className="profile-head">
        <span>{account.initials}</span>
        <div>
          <p className="eyebrow">Profile</p>
          <h1>{account.displayName}</h1>
          <p>{account.email}</p>
        </div>
      </div>
      {memberNotice && <div className="write-notice" role="status">{memberNotice}</div>}
      <div className="profile-grid">
        <ProfileRow label="Plan" value={account.planName} />
        <ProfileRow label="Plan status" value={planStatusText(account.planStatus)} />
        <ProfileRow label="Saved sources" value={`${savedSourceCount}`} />
        <ProfileRow label="Member since" value={account.createdAt.slice(0, 10)} />
      </div>
      <AccountSettings account={account} />
      <DealLearningControls />
      <button className="ghost-button" onClick={onSignOut} type="button">
        <SignOut size={18} />
        Sign out
      </button>
    </section>
  )
}

// Account management: change your display name and set your own password.
// The password never leaves this form — it goes straight to /api/account,
// which hashes it server-side.
function AccountSettings({ account }: { account: NonNullable<MemberSession['account']> }) {
  const [displayName, setDisplayName] = useState(account.displayName)
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameNotice, setNameNotice] = useState<string>()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string>()

  async function saveName() {
    setIsSavingName(true)
    setNameNotice(undefined)

    try {
      const result = await updateAccountProfile(displayName)
      setNameNotice(result.message)
    } finally {
      setIsSavingName(false)
    }
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordNotice('The new passwords do not match.')
      return
    }

    setIsSavingPassword(true)
    setPasswordNotice(undefined)

    try {
      const result = await changeAccountPassword(currentPassword, newPassword)
      setPasswordNotice(result.message)

      if (result.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <div className="account-settings">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Your details</h2>
        </div>
      </div>

      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault()
          void saveName()
        }}
      >
        <label className="field">
          Display name
          <input
            autoComplete="name"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>
        <button className="ghost-button" disabled={isSavingName} type="submit">
          {isSavingName ? 'Saving' : 'Save name'}
        </button>
        {nameNotice && <p className="account-notice" role="status">{nameNotice}</p>}
      </form>

      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault()
          void savePassword()
        }}
      >
        <label className="field">
          Current password
          <input
            autoComplete="current-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            type="password"
            value={currentPassword}
          />
        </label>
        <label className="field">
          New password
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            type="password"
            value={newPassword}
          />
        </label>
        <label className="field">
          Confirm new password
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        <button className="ghost-button" disabled={isSavingPassword} type="submit">
          {isSavingPassword ? 'Saving' : 'Change password'}
        </button>
        {passwordNotice && <p className="account-notice" role="status">{passwordNotice}</p>}
      </form>
    </div>
  )
}

function DealLearningControls() {
  const [learning, setLearning] = useState<DealLearningState>({ activities: [], enabled: true })
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    loadDealLearning(controller.signal)
      .then((nextLearning) => setLearning(nextLearning))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setNotice(error instanceof Error ? error.message : 'Deal learning could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  const updateEnabled = async () => {
    setIsUpdating(true)
    setNotice(undefined)

    try {
      const nextLearning = await setDealLearningEnabled(!learning.enabled)
      setLearning(nextLearning)
      setNotice(nextLearning.enabled ? 'Deal learning is on.' : 'Deal learning is paused.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Deal learning could not be updated.')
    } finally {
      setIsUpdating(false)
    }
  }

  const clearHistory = async () => {
    if (!window.confirm('Clear all deal learning history?')) {
      return
    }

    setIsUpdating(true)
    setNotice(undefined)

    try {
      setLearning(await clearDealLearningHistory())
      setNotice('Deal learning history cleared.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Deal learning history could not be cleared.')
    } finally {
      setIsUpdating(false)
    }
  }

  const removeActivity = async (activityId: string) => {
    setIsUpdating(true)
    setNotice(undefined)

    try {
      setLearning(await deleteDealLearningActivity(activityId))
      setNotice('Learning activity removed.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Learning activity could not be removed.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <section className="deal-learning-panel" aria-labelledby="deal-learning-heading">
      <div className="deal-learning-head">
        <div>
          <p className="eyebrow">Personal deal finder</p>
          <h2 id="deal-learning-heading">Deal learning</h2>
          <p>
            Trolley Scout uses your submitted searches, saved deals, and basket additions to order deals and choose
            what to scout.
          </p>
        </div>
        <button
          aria-pressed={learning.enabled}
          className={clsx('learning-toggle', learning.enabled && 'is-enabled')}
          disabled={isLoading || isUpdating}
          onClick={updateEnabled}
          type="button"
        >
          <span aria-hidden="true" />
          {learning.enabled ? 'Learning on' : 'Learning paused'}
        </button>
      </div>

      {notice && <div className="write-notice" role="status">{notice}</div>}
      {isLoading ? (
        <LoadingStrip label="Loading deal learning" />
      ) : (
        <>
          <div className="deal-learning-actions">
            <p>{learning.activities.length} recent learning {learning.activities.length === 1 ? 'item' : 'items'}</p>
            <button
              className="ghost-button"
              disabled={isUpdating || learning.activities.length === 0}
              onClick={clearHistory}
              type="button"
            >
              <Trash size={16} />
              Clear history
            </button>
          </div>
          {learning.activities.length > 0 && (
            <ul className="learning-activity-list" aria-label="Recent deal learning activity">
              {learning.activities.slice(0, 8).map((activity) => (
                <li key={activity.id}>
                  <div>
                    <strong>{learningActivityLabel(activity)}</strong>
                    <span>{formatActivityDate(activity.createdAt)}</span>
                  </div>
                  <button
                    aria-label={`Remove ${learningActivityLabel(activity)}`}
                    disabled={isUpdating}
                    onClick={() => removeActivity(activity.id)}
                    type="button"
                  >
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function learningActivityLabel(activity: DealActivity) {
  const subject = activity.term ?? activity.title ?? activity.retailerId ?? 'deal'

  if (activity.eventType === 'search_submitted') return `Searched for ${subject}`
  if (activity.eventType === 'deal_saved') return `Saved ${subject}`
  if (activity.eventType === 'basket_added') return `Added ${subject} to basket`
  if (activity.eventType === 'retailer_opened') return `Viewed ${subject}`
  return `Opened ${subject}`
}

function formatActivityDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function planStatusText(status: NonNullable<MemberSession['account']>['planStatus']) {
  if (status === 'billing_not_configured') {
    return 'Billing setup needed'
  }

  if (status === 'checkout_required') {
    return 'Checkout required'
  }

  return 'Active'
}

// Admin-only operations view. The API enforces the role server-side; this
// component only renders what that endpoint returns.
function AdminConsole() {
  const [overview, setOverview] = useState<AdminOverview | undefined>()
  const [message, setMessage] = useState('Loading admin data.')

  useEffect(() => {
    const controller = new AbortController()

    loadAdminOverview(controller.signal)
      .then((result) => {
        setOverview(result.data)
        setMessage(result.data ? '' : result.message)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <section className="admin-console" aria-label="Admin console">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Console</h1>
          <p className="section-lede">Accounts, plans, and scout health.</p>
        </div>
      </div>

      {message === 'Loading admin data.' ? (
        <LoadingStrip label="Loading admin data" />
      ) : (
        message && <div className="write-notice" role="status">{message}</div>
      )}

      {overview && (
        <>
          <div className="member-metrics">
            <Metric
              icon={<UserCircle size={22} />}
              label="Accounts"
              value={`${overview.summary.accountCount}`}
            />
            <Metric icon={<Tag size={22} />} label="Stored deals" value={`${overview.scout.dealCount}`} />
            <Metric
              icon={<Storefront size={22} />}
              label="Leaflets"
              value={`${overview.scout.leafletCount}`}
            />
            <Metric
              icon={<ArrowClockwise size={22} />}
              label="Last scout"
              value={
                overview.scout.lastScoutedAt
                  ? new Date(overview.scout.lastScoutedAt).toLocaleString('en-ZA', {
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                    })
                  : 'Never'
              }
            />
          </div>

          <div className="admin-plans">
            {Object.entries(overview.summary.planCounts).map(([planId, total]) => (
              <span className="admin-plan-tag" key={planId}>
                {planId}: <strong>{total}</strong>
              </span>
            ))}
          </div>

          <div className="section-heading">
            <div>
              <p className="eyebrow">Members</p>
              <h2>Recent accounts</h2>
            </div>
          </div>

          <div className="admin-table" role="table" aria-label="Member accounts">
            <div className="admin-row admin-row-head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Plan</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Joined</span>
            </div>
            {overview.accounts.map((member) => (
              <div className="admin-row" key={member.id} role="row">
                <span role="cell">
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </span>
                <span role="cell">{member.planName}</span>
                <span role="cell">
                  {member.role === 'admin' ? <mark>admin</mark> : 'member'}
                </span>
                <span role="cell">{member.createdAt.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function LeafletBoard({ leaflets }: { leaflets: StoreLeaflet[] }) {
  const [openLeaflet, setOpenLeaflet] = useState<StoreLeaflet | undefined>()

  return (
    <div className="leaflet-board" aria-label="Store leaflets">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Big-store catalogues</p>
          <h3>This week’s specials leaflets</h3>
          <p className="freshness-line">
            Shoprite, Checkers, and Boxer publish catalogues, not per-item prices. Open the official
            leaflet to see every special.
          </p>
        </div>
      </div>
      <div className="leaflet-grid">
        {leaflets.map((leaflet) => (
          <article className="leaflet-card" key={leaflet.id}>
            {leaflet.imageUrl && (
              <img
                alt={`${leaflet.retailerName} catalogue cover`}
                className="leaflet-cover"
                decoding="async"
                loading="lazy"
                onError={(event) => { event.currentTarget.hidden = true }}
                referrerPolicy="no-referrer"
                src={leaflet.imageUrl}
              />
            )}
            <p className="leaflet-retailer">{leaflet.retailerName}</p>
            <h4>{leaflet.name}</h4>
            {(leaflet.validFrom || leaflet.validTo) && (
              <p className="leaflet-dates">{describeLeafletDates(leaflet.validFrom, leaflet.validTo)}</p>
            )}
            <button
              className="leaflet-open"
              onClick={() => setOpenLeaflet(leaflet)}
              type="button"
            >
              View leaflet
              <MagnifyingGlass size={14} />
            </button>
          </article>
        ))}
      </div>

      {openLeaflet && (
        <LeafletViewer leaflet={openLeaflet} onClose={() => setOpenLeaflet(undefined)} />
      )}
    </div>
  )
}

function describeLeafletDates(validFrom?: string, validTo?: string): string {
  const format = (iso?: string) => {
    if (!iso) {
      return ''
    }

    const date = new Date(`${iso}T00:00:00`)

    if (Number.isNaN(date.getTime())) {
      return iso
    }

    return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  }

  if (validFrom && validTo) {
    return `Valid ${format(validFrom)} – ${format(validTo)}`
  }

  if (validTo) {
    return `Valid until ${format(validTo)}`
  }

  return `From ${format(validFrom)}`
}

// PayFast's classic checkout is a POST form submission. Build a hidden form
// and submit it so the browser navigates to PayFast to complete payment.
function submitPayFastRedirect(actionUrl: string, fields: Record<string, string>) {
  if (!window.confirm('Continue to PayFast? Your secure payment will open in a separate tab.')) {
    return
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = actionUrl
  form.target = '_blank'

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
}

// Lists deals the way a shopper reads a catalogue: grouped by retailer, then
// in catalogue page order. Deals without a page (live API rows) keep their
// existing order and sit after the paged catalogue rows for that retailer.
function sortDealsByPage(deals: DiscoveredDeal[]): DiscoveredDeal[] {
  return [...deals].sort((left, right) => {
    if (left.retailerName !== right.retailerName) {
      return left.retailerName.localeCompare(right.retailerName)
    }

    const leftPage = left.pageNumber ?? Number.MAX_SAFE_INTEGER
    const rightPage = right.pageNumber ?? Number.MAX_SAFE_INTEGER

    return leftPage - rightPage
  })
}

function describeFreshness(refreshedAt?: string): string {
  if (!refreshedAt) {
    return 'Live from official store pages.'
  }

  const ageMs = Date.now() - Date.parse(refreshedAt)

  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 'Updated just now.'
  }

  const minutes = Math.round(ageMs / 60000)

  if (minutes < 1) {
    return 'Updated just now.'
  }

  if (minutes < 60) {
    return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago.`
  }

  const hours = Math.round(minutes / 60)
  return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago.`
}

function formatRand(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100)
}

function RuntimeBanner({
  retailerState,
  offerState,
}: {
  retailerState: ResourceState<RetailerResource>
  offerState: ResourceState<OfferResource>
}) {
  const isApiLive = retailerState.meta.source === 'cloudflare-pages'
  const isLoading = retailerState.status === 'loading' || offerState.status === 'loading'

  return (
    <section className={clsx('runtime-banner', isApiLive && 'is-live')} aria-label="Backend status">
      <span className={clsx('status-dot', isLoading && 'is-pulsing')} />
      <div>
        <strong>{isLoading ? 'Checking live data' : isApiLive ? 'Live data' : 'Offline lists'}</strong>
        <p>
          {isApiLive
            ? 'Prices and deals are being read from official store pages right now.'
            : 'Showing the built-in store directory. Deal checking needs the online service.'}
        </p>
      </div>
    </section>
  )
}

export function DiscoveredStoreDirectory({
  discovered,
}: {
  discovered: DiscoveredStoresResource
}) {
  const groups = groupDiscoveredStores(discovered.stores)
  const [openGroup, setOpenGroup] = useState<DiscoveredStoreGroup | undefined>()
  const [openLeaflet, setOpenLeaflet] = useState<StoreLeaflet | undefined>()

  useEffect(() => {
    if (!openGroup) {
      return
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      setOpenGroup(undefined)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openGroup])

  function openCatalogue(branch: NearbyStoreResult, promotion: NearbyStoreResult['promotions'][number]) {
    setOpenGroup(undefined)
    setOpenLeaflet(cataloguePromotionToLeaflet(branch, promotion))
  }

  return (
    <div className="discovered-store-directory" aria-label="Stores found near shoppers">
      <div className="section-heading">
        <div>
          <p className="eyebrow">National store directory</p>
          <h3>Stores found near shoppers</h3>
          <p>
            {discovered.summary.storeCount} permanent store records across {discovered.summary.areaCount} searched areas.
          </p>
        </div>
        <Storefront size={26} />
      </div>

      {groups.length > 0 ? (
        <div className="discovered-store-grid">
          {groups.map((group) => (
            <button
              aria-label={`${cleanUiPunctuation(group.displayName)}, ${group.branchCount} ${group.branchCount === 1 ? 'location' : 'locations'}, ${group.promotionCount} live promotions`}
              className="discovered-store-card"
              key={group.id}
              onClick={() => setOpenGroup(group)}
              type="button"
            >
              {group.logoUrl ? (
                <img alt="" className="store-logo" loading="lazy" src={group.logoUrl} />
              ) : (
                <span className="store-logo-fallback"><Storefront size={22} /></span>
              )}
              <span className="discovered-store-card-copy">
                <strong>{cleanUiPunctuation(group.displayName)}</strong>
                <span>{group.branchCount} {group.branchCount === 1 ? 'location' : 'locations'}</span>
                <span>
                  {group.promotionCount} live promotion{group.promotionCount === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="directory-empty">Use Near me to add the first stores in a searched area.</p>
      )}

      {openGroup && (
        <div
          className="store-directory-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpenGroup(undefined)
            }
          }}
          role="presentation"
        >
          <div
            aria-labelledby="store-locations-title"
            aria-modal="true"
            className="store-directory-modal"
            role="dialog"
          >
            <header className="store-directory-modal-head">
              <div>
                <p className="eyebrow">Locations and local specials</p>
                <h3 id="store-locations-title">{cleanUiPunctuation(openGroup.displayName)} locations</h3>
                <p>
                  {openGroup.branchCount} {openGroup.branchCount === 1 ? 'branch' : 'branches'}.{' '}
                  Specials stay with the location that published them.
                </p>
              </div>
              <button
                aria-label="Close store locations"
                autoFocus
                className="icon-button"
                onClick={() => setOpenGroup(undefined)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="store-location-list">
              {openGroup.branches.map((branch) => (
                <section className="store-location-section" key={branch.placeId}>
                  <div className="store-location-head">
                    <div>
                      <h4>{cleanUiPunctuation(branch.name)}</h4>
                      {branch.address && <p>{cleanUiPunctuation(branch.address)}</p>}
                      {branch.lastSeenAt && <small>Last seen {formatStoreSeenDate(branch.lastSeenAt)}</small>}
                    </div>
                    {branch.website && (
                      <a href={branch.website} rel="noreferrer" target="_blank">
                        Store website
                        <LinkSimple size={14} />
                      </a>
                    )}
                  </div>

                  {(branch.promotions ?? []).length > 0 ? (
                    <div className="store-location-promotions">
                      {branch.promotions.map((promotion) => (
                        <article className="store-location-promotion" key={promotion.id}>
                          {promotion.imageUrl && (
                            <img
                              alt=""
                              decoding="async"
                              loading="lazy"
                              onError={(event) => { event.currentTarget.hidden = true }}
                              referrerPolicy="no-referrer"
                              src={promotion.imageUrl}
                            />
                          )}
                          <div>
                            <span className="promotion-kind">
                              {promotion.kind === 'catalogue' ? 'Catalogue' : 'Deal'}
                            </span>
                            <h5>{cleanUiPunctuation(promotion.title)}</h5>
                            {(promotion.priceText || promotion.previousPriceText || promotion.savingText) && (
                              <p className="store-location-price">
                                {promotion.priceText && <strong>{cleanUiPunctuation(promotion.priceText)}</strong>}
                                {promotion.previousPriceText && <s>{cleanUiPunctuation(promotion.previousPriceText)}</s>}
                                {promotion.savingText && <span>{cleanUiPunctuation(promotion.savingText)}</span>}
                              </p>
                            )}
                            {(promotion.validFrom || promotion.validTo) && (
                              <p className="leaflet-dates">
                                {describeLeafletDates(promotion.validFrom, promotion.validTo)}
                              </p>
                            )}
                            <div className="store-promotion-actions">
                              {promotion.kind === 'catalogue' && (
                                <button onClick={() => openCatalogue(branch, promotion)} type="button">
                                  Read {cleanUiPunctuation(promotion.title)} here
                                  <MagnifyingGlass size={14} />
                                </button>
                              )}
                              <a href={promotion.sourceUrl} rel="noreferrer" target="_blank">
                                Official source
                                <LinkSimple size={14} />
                              </a>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="directory-empty">No current location-specific promotions.</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {openLeaflet && (
        <LeafletViewer leaflet={openLeaflet} onClose={() => setOpenLeaflet(undefined)} />
      )}
    </div>
  )
}

function cataloguePromotionToLeaflet(
  branch: NearbyStoreResult,
  promotion: NearbyStoreResult['promotions'][number],
): StoreLeaflet {
  return {
    capturedAt: branch.lastSeenAt ?? new Date().toISOString(),
    documentUrl: promotion.productUrl ?? promotion.sourceUrl,
    id: promotion.id,
    imageUrl: promotion.imageUrl,
    name: cleanUiPunctuation(promotion.title),
    retailerId: branch.retailerId ?? branch.placeId,
    retailerName: cleanUiPunctuation(branch.name),
    sourceLabel: 'Official catalogue',
    url: promotion.sourceUrl,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
  }
}

function formatStoreSeenDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }

  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function cleanUiPunctuation(value: string | undefined): string {
  return value?.replace(/\s*\u2014\s*/g, ': ') ?? ''
}

function SourcePanel({
  retailers: sourceRetailers,
  isLoading,
  memberMode = false,
  onSaveSource,
  savedSourceUrls = new Set<string>(),
  savingSourceUrl,
}: {
  retailers: Retailer[]
  isLoading: boolean
  memberMode?: boolean
  onSaveSource?: (retailerId: Retailer['id'], sourceUrl: string) => void
  savedSourceUrls?: Set<string>
  savingSourceUrl?: string
}) {
  const [discovered, setDiscovered] = useState<DiscoveredStoresResource>({
    stores: [],
    summary: { areaCount: 0, knownChainCount: 0, storeCount: 0, withPromotionsCount: 0 },
  })

  useEffect(() => {
    const controller = new AbortController()
    loadDiscoveredStores(controller.signal).then(setDiscovered).catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <section className="source-panel" aria-label="Official source watchlist">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Official sources</p>
          <h2>{sourceRetailers.length} retailers</h2>
        </div>
        <CheckCircle size={28} weight="duotone" />
      </div>
      {isLoading && <LoadingStrip label="Refreshing source directory" />}
      <DiscoveredStoreDirectory discovered={discovered} />
      <div className="source-grid">
        {sourceRetailers.map((retailer, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="source-card"
            initial={{ opacity: 0, y: 10 }}
            key={retailer.id}
            style={{ '--card-accent': retailer.accentColor } as CSSProperties}
            transition={{ delay: Math.min(index * 0.02, 0.18) }}
          >
            <div className="source-card-body">
              <div className="source-card-head">
                <span className="retailer-pill">{retailer.group}</span>
                <div className="retailer-title-row">
                  {retailer.logoUrl && <img alt="" className="store-logo" loading="lazy" src={retailer.logoUrl} />}
                  <h3>{retailer.name}</h3>
                </div>
                <p>{retailer.sourceNote}</p>
              </div>
              <div className="source-meta">
                <span>{retailer.program}</span>
                <span>Checked {retailer.verifiedOn}</span>
              </div>
              <div className="source-links">
                {retailer.sources.map((source) => (
                  <div className="source-link-group" key={`${retailer.id}-${source.label}`}>
                    <a href={source.url} rel="noreferrer" target="_blank">
                      {source.label}
                      <LinkSimple size={14} />
                    </a>
                    {memberMode && (
                      <button
                        disabled={savedSourceUrls.has(source.url) || savingSourceUrl === source.url}
                        onClick={() => onSaveSource?.(retailer.id, source.url)}
                        type="button"
                      >
                        {savedSourceUrls.has(source.url)
                          ? 'Saved'
                          : savingSourceUrl === source.url
                            ? 'Saving'
                            : 'Save'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

function DiscoveryPanel({
  canWatchItems = false,
  isDiscovering,
  onReviewDeal,
  onRunDiscovery,
  onSaveDeal,
  savedDealUrls = new Set<string>(),
  savingDealUrl,
  state,
}: {
  canWatchItems?: boolean
  isDiscovering: boolean
  onReviewDeal: (deal: DiscoveredDeal) => void
  onRunDiscovery: () => void
  onSaveDeal?: (deal: DiscoveredDeal) => void
  savedDealUrls?: Set<string>
  savingDealUrl?: string
  state: ResourceState<DiscoveryResource>
}) {
  const discovery = state.data.discovery
  const allDeals = sortDealsByPage(discovery.deals)
  const leaflets = discovery.leaflets ?? []
  const [dealQuery, setDealQuery] = useState('')
  const [watchNotice, setWatchNotice] = useState('')
  const [isWatching, setIsWatching] = useState(false)

  const watchCurrentQuery = async () => {
    setIsWatching(true)
    setWatchNotice('')

    try {
      const result = await createDealWatch(dealQuery)
      setWatchNotice(
        result.issue ??
          (result.matches.length > 0
            ? `${result.message} Check your alerts bell.`
            : result.message),
      )
    } catch {
      setWatchNotice('Could not save the watch. Try again.')
    } finally {
      setIsWatching(false)
    }
  }
  const [retailerId, setRetailerId] = useState('all')
  const [sourceLabel, setSourceLabel] = useState('all')
  const [imagesOnly, setImagesOnly] = useState(false)
  const [savingsOnly, setSavingsOnly] = useState(false)
  const deals = filterDiscoveryDeals(allDeals, {
    imagesOnly,
    query: dealQuery,
    retailerId,
    savingsOnly,
    sourceLabel,
  })
  const retailers = Array.from(
    new Map(allDeals.map((deal) => [deal.retailerId, deal.retailerName])).entries(),
  )
  const sourceLabels = Array.from(new Set(allDeals.map((deal) => deal.sourceLabel))).sort()

  const dealsPerPage = 24
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(deals.length / dealsPerPage))
  const safePage = Math.min(page, pageCount - 1)
  const pagedDeals = deals.slice(safePage * dealsPerPage, safePage * dealsPerPage + dealsPerPage)

  useEffect(() => setPage(0), [dealQuery, retailerId, sourceLabel, imagesOnly, savingsOnly])

  return (
    <section className="discovery-panel" aria-label="Deal finder">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deal finder</p>
          <h2>Source-backed specials</h2>
          <p className="freshness-line">{describeFreshness(discovery.refreshedAt)}</p>
        </div>
        <button className="primary-button" disabled={isDiscovering} onClick={onRunDiscovery} type="button">
          <ArrowClockwise size={18} className={clsx(isDiscovering && 'is-spinning')} />
          {isDiscovering ? 'Checking' : 'Check now'}
        </button>
      </div>

      {state.status === 'loading' && <LoadingStrip label="Checking official deal pages" />}
      {state.status === 'error' && <div className="write-notice" role="status">{state.message}</div>}

      <div className="discovery-summary">
        <Metric icon={<LinkSimple size={22} />} label="Sources checked" value={`${discovery.summary.checkedSourceCount}`} />
        <Metric icon={<Tag size={22} />} label="Found deals" value={`${discovery.summary.foundDealCount}`} />
        <Metric icon={<Storefront size={22} />} label="Store leaflets" value={`${leaflets.length}`} />
      </div>

      <div className="deal-filter-bar" aria-label="Deal filters">
        <label>
          Search deals
          <input
            onChange={(event) => setDealQuery(event.target.value)}
            placeholder="Product, retailer, or source"
            type="search"
            value={dealQuery}
          />
        </label>
        <label>
          Retailer
          <select onChange={(event) => setRetailerId(event.target.value)} value={retailerId}>
            <option value="all">All retailers</option>
            {retailers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>
          Source
          <select onChange={(event) => setSourceLabel(event.target.value)} value={sourceLabel}>
            <option value="all">All sources</option>
            {sourceLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <label className="deal-filter-check">
          <input checked={imagesOnly} onChange={(event) => setImagesOnly(event.target.checked)} type="checkbox" />
          Has image
        </label>
        <label className="deal-filter-check">
          <input checked={savingsOnly} onChange={(event) => setSavingsOnly(event.target.checked)} type="checkbox" />
          Shows savings
        </label>
      </div>

      {leaflets.length > 0 && <LeafletBoard leaflets={leaflets} />}

      {discovery.sources.length > 0 && (
        <div className="discovery-source-grid" aria-label="Checked sources">
          {discovery.sources.map((source) => (
            <article className={clsx('discovery-source-card', `is-${source.status}`)} key={`${source.retailerId}-${source.sourceLabel}`}>
              <div>
                <p className="eyebrow">{source.retailerName}</p>
                <h3>{source.sourceLabel}</h3>
                <p>{source.statusText}</p>
              </div>
              <div className="source-meta">
                <span>{source.httpStatus ? `HTTP ${source.httpStatus}` : 'No status'}</span>
                <span>{source.itemCount} rows</span>
              </div>
              <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                Source
                <LinkSimple size={14} />
              </a>
            </article>
          ))}
        </div>
      )}

      {deals.length > 0 ? (
        <div className="discovery-deal-list">
          {pagedDeals.map((deal) => (
            <article className="discovery-deal-row" key={deal.id}>
              <div className="discovery-deal-main">
                {deal.imageUrl && (
                  <img
                    alt={deal.title}
                    className="deal-product-image"
                    decoding="async"
                    loading="lazy"
                    onError={(event) => { event.currentTarget.hidden = true }}
                    referrerPolicy="no-referrer"
                    src={deal.imageUrl}
                  />
                )}
                <div>
                  <p className="eyebrow">
                    {deal.retailerName}
                    {deal.pageNumber !== undefined && (
                      <span className="deal-page-tag">Page {deal.pageNumber}</span>
                    )}
                  </p>
                  {deal.personalizationReason && (
                    <p className="personalization-reason">{deal.personalizationReason}</p>
                  )}
                  <h3>{deal.title}</h3>
                  <div className="deal-price-line">
                    {deal.priceText && <strong>{deal.priceText}</strong>}
                    {deal.previousPriceText && <span>{deal.previousPriceText}</span>}
                    {deal.savingText && <span>{deal.savingText}</span>}
                  </div>
                </div>
              </div>
              <div className="offer-actions">
                <a href={deal.productUrl} rel="noreferrer" target="_blank">
                  Product
                  <LinkSimple size={14} />
                </a>
                {onSaveDeal && (
                  <button
                    className="ghost-button"
                    disabled={savedDealUrls.has(deal.productUrl) || savingDealUrl === deal.productUrl}
                    onClick={() => onSaveDeal(deal)}
                    type="button"
                  >
                    {savedDealUrls.has(deal.productUrl)
                      ? 'Saved'
                      : savingDealUrl === deal.productUrl
                        ? 'Saving'
                        : 'Save deal'}
                  </button>
                )}
                <button className="ghost-button" onClick={() => onReviewDeal(deal)} type="button">
                  Review in scanner
                </button>
              </div>
            </article>
          ))}

          {pageCount > 1 && (
            <nav className="deal-pager" aria-label="Deal pages">
              <button
                className="ghost-button"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="deal-pager-status">
                Page {safePage + 1} of {pageCount} · {deals.length} deals
              </span>
              <button
                className="ghost-button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                type="button"
              >
                Next
              </button>
            </nav>
          )}
        </div>
      ) : (
        <div className="discovery-empty">
          <Tag size={46} />
          <p className="eyebrow">No deal rows yet</p>
          <h3>{allDeals.length > 0 ? 'No deals match those filters' : 'Run a source check'}</h3>
          <p>
            The finder only shows rows extracted from official pages. Script-rendered pages are reported as checked,
            with no product rows copied.
          </p>
          {allDeals.length > 0 && dealQuery.trim().length >= 3 ? (
            canWatchItems ? (
              <div className="watch-prompt">
                <p>
                  No deal for &ldquo;{dealQuery.trim()}&rdquo; yet. Watch it and the scouts will
                  alert you the moment one appears anywhere.
                </p>
                <button
                  className="primary-button"
                  disabled={isWatching}
                  onClick={watchCurrentQuery}
                  type="button"
                >
                  {isWatching ? 'Saving watch' : 'Watch this item'}
                </button>
                {watchNotice ? <p className="watch-prompt-notice">{watchNotice}</p> : null}
              </div>
            ) : (
              <p className="watch-prompt-notice">
                Log in and Trolley Scout can watch this item for you, then alert you the moment a
                deal appears.
              </p>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}

function OffersPanel({
  deletingOfferId,
  onDelete,
  state,
  writeNotice,
}: {
  deletingOfferId?: string
  onDelete: (id: string) => void
  state: ResourceState<OfferResource>
  writeNotice?: string
}) {
  const offers = state.data.offers

  return (
    <section className="empty-panel" aria-label="Verified offers">
      {state.status === 'loading' && <LoadingStrip label="Checking offer board" />}
      {writeNotice && <div className="write-notice" role="status">{writeNotice}</div>}
      {offers.length > 0 ? (
        <OfferList deletingOfferId={deletingOfferId} offers={offers} onDelete={onDelete} />
      ) : (
        <>
          <ReceiptX size={48} />
          <p className="eyebrow">Verified offers</p>
          <h2>No checked offers loaded</h2>
          <p>
            This board stays empty until an offer has an official source URL, capture date, valid dates,
            retailer, price text, and terms from the source page.
          </p>
          <div className="requirement-grid">
            {[
              'Official source URL',
              'Capture date',
              'Retailer and source type',
              'Price text from source',
              'Valid dates',
              'Terms and loyalty rules',
            ].map((item) => (
              <span key={item}>
                <CheckCircle size={16} />
                {item}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// The alerts bell: matched watches the member has not dismissed yet. Watches
// are created from the Find deals empty state when a searched item has no
// deal anywhere on the platform.
function DealWatchBell() {
  const [watches, setWatches] = useState<DealWatch[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const alertCount = watches.filter((watch) => watch.matchedAt && !watch.seenAt).length

  useEffect(() => {
    const controller = new AbortController()

    loadDealWatches(controller.signal)
      .then((result) => setWatches(result.watches))
      .catch(() => {})

    return () => controller.abort()
  }, [])

  const dismiss = async (watch: DealWatch) => {
    // Optimistic: the badge clears immediately, the server catches up.
    setWatches((current) =>
      current.map((candidate) =>
        candidate.id === watch.id
          ? { ...candidate, seenAt: new Date().toISOString() }
          : candidate,
      ),
    )

    try {
      setWatches(await markDealWatchSeen(watch.id))
    } catch {
      // Optimistic state stands; the next load reconciles.
    }
  }

  const remove = async (watch: DealWatch) => {
    setWatches((current) => current.filter((candidate) => candidate.id !== watch.id))

    try {
      setWatches(await deleteDealWatch(watch.id))
    } catch {
      // Optimistic state stands; the next load reconciles.
    }
  }

  return (
    <div className="watch-bell">
      <button
        aria-expanded={isOpen}
        aria-label={
          alertCount > 0 ? `${alertCount} deal alerts waiting` : 'Watched items'
        }
        className="icon-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {alertCount > 0 ? <BellRinging size={20} /> : <Bell size={20} />}
        {alertCount > 0 ? <span className="watch-bell-badge">{alertCount}</span> : null}
      </button>
      {isOpen ? (
        <div className="watch-panel" role="dialog" aria-label="Watched items">
          <div className="watch-panel-heading">
            <p className="eyebrow">Watched items</p>
            <button
              aria-label="Close watched items"
              className="icon-button"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          {watches.length === 0 ? (
            <p className="watch-panel-empty">
              Search an item under Find deals. If it has no special yet, watch it and the
              scouts will alert you here the moment one appears.
            </p>
          ) : (
            watches.map((watch) => (
              <article
                className={clsx('watch-row', watch.matchedAt && !watch.seenAt && 'is-alert')}
                key={watch.id}
              >
                <div className="watch-row-heading">
                  <h4>{watch.queryText}</h4>
                  {watch.matchedAt && !watch.seenAt ? <mark>Deal found</mark> : null}
                  <button
                    aria-label={`Stop watching ${watch.queryText}`}
                    className="icon-button"
                    onClick={() => remove(watch)}
                    type="button"
                  >
                    <Trash size={14} />
                  </button>
                </div>
                {!watch.matchedAt ? (
                  <p>Still scouting. You will see an alert here the moment a deal appears.</p>
                ) : null}
                {watch.matches.map((match) => (
                  <a
                    className="watch-match"
                    href={match.productUrl ?? '#'}
                    key={`${watch.id}-${match.title}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {match.imageUrl ? <img alt="" loading="lazy" src={match.imageUrl} /> : null}
                    <span className="watch-match-title">{match.title}</span>
                    {match.priceText ? <strong>{match.priceText}</strong> : null}
                  </a>
                ))}
                {watch.matchedAt && !watch.seenAt ? (
                  <button className="ghost-button" onClick={() => dismiss(watch)} type="button">
                    Got it
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function OfferList({
  deletingOfferId,
  offers,
  onDelete,
}: {
  deletingOfferId?: string
  offers: VerifiedOffer[]
  onDelete: (id: string) => void
}) {
  return (
    <div className="offer-list">
      {offers.map((offer) => (
        <article className="offer-row" key={offer.id}>
          {offer.imageUrl ? (
            <img alt="" className="offer-image" loading="lazy" src={offer.imageUrl} />
          ) : null}
          <div>
            <p className="eyebrow">Verified offer</p>
            <h3>{offer.title}</h3>
            <p>{offer.priceText}</p>
            <p>{offer.termsText}</p>
          </div>
          <div className="offer-actions">
            <a href={offer.sourceUrl} rel="noreferrer" target="_blank">
              Source
              <LinkSimple size={14} />
            </a>
            <button
              className="ghost-button"
              disabled={deletingOfferId === offer.id}
              onClick={() => onDelete(offer.id)}
              type="button"
            >
              {deletingOfferId === offer.id ? 'Removing' : 'Remove'}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ScannerPanel({
  draft,
  isSaving,
  isScanning,
  onReset,
  onSave,
  onScan,
  onUpdate,
  result,
  writeNotice,
}: {
  draft: OfferDraft
  isSaving: boolean
  isScanning: boolean
  onReset: () => void
  onSave: () => void
  onScan: () => void
  onUpdate: (field: keyof OfferDraft, value: string) => void
  result?: ResourceState<OfferValidationResult>
  writeNotice?: string
}) {
  return (
    <section className="scanner-panel" aria-label="Offer scanner">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Offer scanner</p>
          <h2>Validate source text</h2>
        </div>
        <ShieldCheck size={28} weight="duotone" />
      </div>

      <div className="scanner-layout">
        <form
          className="scanner-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onScan()
          }}
        >
          <div className="form-grid">
            <label className="field">
              Retailer
              <select value={draft.retailerId} onChange={(event) => onUpdate('retailerId', event.target.value)}>
                {initialRetailers.map((retailer) => (
                  <option key={retailer.id} value={retailer.id}>
                    {retailer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Capture date
              <input
                onChange={(event) => onUpdate('capturedAt', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.capturedAt}
              />
            </label>

            <label className="field">
              Valid from
              <input
                onChange={(event) => onUpdate('validFrom', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.validFrom ?? ''}
              />
            </label>

            <label className="field">
              Valid to
              <input
                onChange={(event) => onUpdate('validTo', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.validTo ?? ''}
              />
            </label>
          </div>

          <label className="field">
            Source URL
            <input
              onChange={(event) => onUpdate('sourceUrl', event.target.value)}
              placeholder="Paste official retailer URL"
              type="url"
              value={draft.sourceUrl}
            />
          </label>

          <label className="field">
            Offer title
            <input
              onChange={(event) => onUpdate('title', event.target.value)}
              placeholder="Paste title from source"
              value={draft.title}
            />
          </label>

          <div className="form-grid">
            <label className="field">
              Price text
              <input
                onChange={(event) => onUpdate('priceText', event.target.value)}
                placeholder="Paste price text from source"
                value={draft.priceText}
              />
            </label>

            <label className="field">
              Saving text
              <input
                onChange={(event) => onUpdate('savingText', event.target.value)}
                placeholder="Optional source saving text"
                value={draft.savingText ?? ''}
              />
            </label>
          </div>

          <label className="field">
            Terms text
            <textarea
              onChange={(event) => onUpdate('termsText', event.target.value)}
              placeholder="Paste terms, loyalty rules, or source notes"
              rows={5}
              value={draft.termsText}
            />
          </label>

          <div className="scanner-actions">
            <button className="primary-button" disabled={isScanning} type="submit">
              <ShieldCheck size={18} />
              {isScanning ? 'Scanning' : 'Scan draft'}
            </button>
            <button className="ghost-button" onClick={onReset} type="button">
              Reset
            </button>
          </div>
        </form>

        <ScannerResult isSaving={isSaving} onSave={onSave} result={result} writeNotice={writeNotice} />
      </div>
    </section>
  )
}

function ScannerResult({
  isSaving,
  onSave,
  result,
  writeNotice,
}: {
  isSaving: boolean
  onSave: () => void
  result?: ResourceState<OfferValidationResult>
  writeNotice?: string
}) {
  if (!result) {
    return (
      <aside className="scanner-result">
        <p className="eyebrow">Result</p>
        <h3>Waiting for a draft</h3>
        <p>Paste source-backed offer text, then scan it before any row can appear in offers.</p>
      </aside>
    )
  }

  return (
    <aside className={clsx('scanner-result', result.data.accepted ? 'is-accepted' : 'is-rejected')}>
      <p className="eyebrow">Result</p>
      <h3>{result.data.accepted ? 'Accepted by scanner' : 'Needs edits'}</h3>
      <p>{result.message}</p>

      {result.data.issues.length > 0 && (
        <div className="issue-list">
          {result.data.issues.map((issue) => (
            <div className={clsx('issue-item', `is-${issue.severity}`)} key={`${issue.field}-${issue.message}`}>
              <strong>{issue.field}</strong>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {result.data.normalizedOffer && (
        <div className="normalized-card">
          <span>Normalized row ID</span>
          <strong>{result.data.normalizedOffer.id}</strong>
          <p>Ready for storage.</p>
          <button className="primary-button" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? 'Saving' : 'Save verified offer'}
          </button>
        </div>
      )}
      {writeNotice && <div className="write-notice" role="status">{writeNotice}</div>}
    </aside>
  )
}

export function LoadingStrip({ label }: { label: string }) {
  return (
    <div className="loading-strip" role="status">
      <ScoutMark motion="spin" size={28} />
      {label}
    </div>
  )
}

function RulesPanel() {
  return (
    <section className="rules-panel" aria-label="Data rules">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Data rules</p>
          <h2>How offers earn a row</h2>
        </div>
        <ClipboardText size={28} weight="duotone" />
      </div>
      <div className="rules-grid">
        <RuleCard
          icon={<LinkSimple size={22} />}
          title="Source first"
          text="Every offer row must point to an official retailer source or a captured page from that source."
        />
        <RuleCard
          icon={<Tag size={22} />}
          title="Text from source"
          text="Price, saving, and voucher terms must match the retailer copy. No guessed amounts."
        />
        <RuleCard
          icon={<ShieldCheck size={22} />}
          title="Date stamped"
          text="Each row needs capture date and valid dates before it can appear in the offer board."
        />
      </div>
    </section>
  )
}

function RuleCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rule-card">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getPreferredTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem('trolley-scout-theme')

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createBlankDraft(): OfferDraft {
  return {
    capturedAt: new Date().toISOString().slice(0, 10),
    priceText: '',
    retailerId: defaultRetailerId,
    savingText: '',
    sourceUrl: '',
    termsText: '',
    title: '',
    validFrom: '',
    validTo: '',
  }
}

export default App
