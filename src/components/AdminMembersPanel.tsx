import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { loadMemberStats, saveMemberLimits } from '../services/apiClient'
import {
  countryFlag,
  describeLastSeen,
  formatDuration,
} from '../services/adminMemberFormat'
import type {
  AdminOverview,
  MemberAccount,
  MemberDetailStats,
  MemberLimitOverrides,
} from '../types'

/**
 * The member list in the admin console.
 *
 * It used to show one country's most recent hundred accounts as a table, with
 * no way to look anywhere else — an admin could not see who had signed up
 * outside their own country at all. Every country is the default now, each
 * card carries its flag, and the list narrows by country, plan, join date or
 * how much someone actually uses the app.
 */

export interface AdminMembersPanelProps {
  onChangePlan: (accountId: string, planId: string) => void
  onFiltersChange: (filters: MemberFilters) => void
  onToggleAccess: (member: MemberAccount) => void
  onToggleBan: (member: MemberAccount) => void | Promise<void>
  overview: AdminOverview
  pendingId?: string
}

export interface MemberFilters {
  memberCountry: string
  plan: string
  query: string
  sort: 'joined-newest' | 'joined-oldest' | 'most-active' | 'name'
}

const SORT_LABELS: Array<[MemberFilters['sort'], string]> = [
  ['joined-newest', 'Recently joined'],
  ['joined-oldest', 'Oldest members'],
  ['most-active', 'Most active'],
  ['name', 'Name (A–Z)'],
]

const PLANS = [
  ['all', 'All memberships'],
  ['free', 'Free'],
  ['scout', 'Scout'],
  ['household', 'Household'],
  ['organization', 'Organisation'],
  ['developers', 'Developers'],
]

export function AdminMembersPanel({
  onChangePlan,
  onFiltersChange,
  onToggleAccess,
  onToggleBan,
  overview,
  pendingId,
}: AdminMembersPanelProps) {
  const [filters, setFilters] = useState<MemberFilters>({
    memberCountry: 'ALL',
    plan: 'all',
    query: '',
    sort: 'joined-newest',
  })
  const [openMember, setOpenMember] = useState<MemberAccount>()

  function update(change: Partial<MemberFilters>) {
    const next = { ...filters, ...change }
    setFilters(next)
    onFiltersChange(next)
  }

  const countries = useMemo(
    () => overview.memberCountries ?? [],
    [overview.memberCountries],
  )
  const totalMembers = countries.reduce((total, entry) => total + entry.memberCount, 0)

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Members</p>
          <h2>Accounts</h2>
          <p className="section-lede">
            Every country by default. Open a card for what a member actually uses and to
            set their ceilings.
          </p>
        </div>
      </div>

      <div className="admin-member-filters" role="group" aria-label="Member filters">
        <label>
          Country
          <select
            onChange={(event) => update({ memberCountry: event.target.value })}
            value={filters.memberCountry}
          >
            <option value="ALL">
              All countries{totalMembers > 0 ? ` (${totalMembers})` : ''}
            </option>
            {countries.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {countryFlag(entry.code)} {entry.name} ({entry.memberCount})
              </option>
            ))}
          </select>
        </label>
        <label>
          Membership
          <select
            onChange={(event) => update({ plan: event.target.value })}
            value={filters.plan}
          >
            {PLANS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select
            onChange={(event) =>
              update({ sort: event.target.value as MemberFilters['sort'] })}
            value={filters.sort}
          >
            {SORT_LABELS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Name or country"
            type="search"
            value={filters.query}
          />
        </label>
      </div>

      {overview.accounts.length === 0 ? (
        <p className="section-lede">No members match these filters.</p>
      ) : (
        <div className="admin-member-grid">
          {overview.accounts.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onOpen={() => setOpenMember(member)}
            />
          ))}
        </div>
      )}

      {openMember && (
        <MemberDetailModal
          member={openMember}
          onChangePlan={onChangePlan}
          onClose={() => setOpenMember(undefined)}
          onToggleAccess={onToggleAccess}
          onToggleBan={onToggleBan}
          pendingId={pendingId}
        />
      )}
    </>
  )
}

function MemberCard({ member, onOpen }: { member: MemberAccount; onOpen: () => void }) {
  const isBanned = member.status === 'banned'

  return (
    <button
      className={clsx('admin-member-card', isBanned && 'is-banned')}
      onClick={onOpen}
      type="button"
    >
      <span className="admin-member-flag" aria-hidden="true">
        {countryFlag(member.countryCode)}
      </span>
      <span className="admin-member-identity">
        <strong>{member.displayName}</strong>
        <small>{member.email}</small>
        <small>
          {countryFlag(member.countryCode)} {member.countryName}
        </small>
      </span>
      <span className="admin-member-badges">
        <em>{member.planName}</em>
        {member.role === 'admin' && <mark>admin</mark>}
        {isBanned && <mark className="is-danger">banned</mark>}
      </span>
      <span className="admin-member-counts">
        <span><b>{member.dealViewCount ?? 0}</b> deals</span>
        <span><b>{member.propertyViewCount ?? 0}</b> properties</span>
        <span><b>{member.voucherViewCount ?? 0}</b> vouchers</span>
      </span>
      <span className="admin-member-joined">
        Joined {member.createdAt.slice(0, 10)} · seen {describeLastSeen(member.lastSeenAt)}
      </span>
    </button>
  )
}

function MemberDetailModal({
  member,
  onChangePlan,
  onClose,
  onToggleAccess,
  onToggleBan,
  pendingId,
}: {
  member: MemberAccount
  onChangePlan: (accountId: string, planId: string) => void
  onClose: () => void
  onToggleAccess: (member: MemberAccount) => void
  onToggleBan: (member: MemberAccount) => void | Promise<void>
  pendingId?: string
}) {
  const [stats, setStats] = useState<MemberDetailStats>()
  const [limits, setLimits] = useState<MemberLimitOverrides>()
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setStats(undefined)
    loadMemberStats(member.id, controller.signal).then((loaded) => {
      if (controller.signal.aborted || !loaded) return
      setStats(loaded)
      setLimits(loaded.limits)
    })
    return () => controller.abort()
  }, [member.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function persistLimits() {
    if (!limits) return
    setIsSaving(true)
    const saved = await saveMemberLimits(member.id, limits)
    setIsSaving(false)
    setNotice(saved ? 'Limits saved.' : 'Could not save those limits.')
    if (saved) setLimits(saved)
  }

  const planBased = member.planId === 'household' || member.role === 'admin'

  return (
    <div className="admin-modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={`${member.displayName} details`}
        className="admin-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <h3>
              {countryFlag(member.countryCode)} {member.displayName}
            </h3>
            <p>{member.email} · {member.countryName} · {member.planName}</p>
          </div>
          <button aria-label="Close member details" onClick={onClose} type="button">
            Close
          </button>
        </header>

        {!stats ? (
          <p className="section-lede">Loading this member's activity…</p>
        ) : (
          <div className="admin-modal-stats">
            <Stat label="Deals viewed" value={stats.dealViewCount} />
            <Stat label="Properties viewed" value={stats.propertyViewCount} />
            <Stat label="Vouchers viewed" value={stats.voucherViewCount} />
            <Stat label="Vouchers saved" value={stats.voucherClaimedCount} />
            <Stat label="Mr Scout messages" value={stats.scoutMessageCount} />
            <Stat label="Saved deals" value={stats.savedDealCount} />
            <Stat label="Basket items" value={stats.basketItemCount} />
            <Stat label="Saved properties" value={stats.savedPropertyCount} />
            <Stat label="Window shopping saves" value={stats.windowShoppingSaveCount} />
            <Stat
              label="Time window shopping"
              text={formatDuration(stats.windowShoppingSeconds)}
            />
          </div>
        )}

        <div className="admin-modal-controls">
          <h4>Access</h4>
          <label>
            Membership
            <select
              disabled={pendingId === member.id}
              onChange={(event) => onChangePlan(member.id, event.target.value)}
              value={member.planId}
            >
              {PLANS.filter(([value]) => value !== 'all').map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <div className="admin-modal-toggles">
            {planBased ? (
              <span className="admin-access-note">Properties: via plan</span>
            ) : (
              <button
                className={clsx('admin-access-toggle', member.propertiesAccess && 'is-on')}
                disabled={pendingId === member.id}
                onClick={() => onToggleAccess(member)}
                type="button"
              >
                {member.propertiesAccess ? 'Properties granted' : 'Grant properties'}
              </button>
            )}
            {member.role !== 'admin' && (
              <button
                className={clsx(
                  'admin-access-toggle',
                  member.status === 'banned' && 'is-danger',
                )}
                disabled={pendingId === member.id}
                onClick={() => void onToggleBan(member)}
                type="button"
              >
                {member.status === 'banned' ? 'Unban' : 'Ban'}
              </button>
            )}
          </div>
        </div>

        {limits && (
          <div className="admin-modal-controls">
            <h4>Limits</h4>
            <p className="section-lede">
              Leave a field empty to use whatever the plan allows.
            </p>
            <LimitField
              label="Deals visible"
              onChange={(value) => setLimits({ ...limits, visibleDeals: value })}
              value={limits.visibleDeals}
            />
            <LimitField
              label="Catalogues visible"
              onChange={(value) => setLimits({ ...limits, visibleCatalogues: value })}
              value={limits.visibleCatalogues}
            />
            <LimitField
              label="Mr Scout messages a day"
              onChange={(value) => setLimits({ ...limits, scoutMessagesPerDay: value })}
              value={limits.scoutMessagesPerDay}
            />
            <label className="admin-limit-check">
              <input
                checked={limits.scoutChatBlocked}
                onChange={(event) =>
                  setLimits({ ...limits, scoutChatBlocked: event.target.checked })}
                type="checkbox"
              />
              Block Mr Scout
            </label>
            <label className="admin-limit-check">
              <input
                checked={limits.compareBlocked}
                onChange={(event) =>
                  setLimits({ ...limits, compareBlocked: event.target.checked })}
                type="checkbox"
              />
              Block Compare
            </label>
            <label>
              Note
              <input
                onChange={(event) => setLimits({ ...limits, note: event.target.value })}
                placeholder="Why these limits are set"
                value={limits.note ?? ''}
              />
            </label>
            <button
              className="primary-button"
              disabled={isSaving}
              onClick={() => void persistLimits()}
              type="button"
            >
              {isSaving ? 'Saving…' : 'Save limits'}
            </button>
            {notice && <p aria-live="polite" className="section-lede">{notice}</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, text, value }: { label: string; text?: string; value?: number }) {
  return (
    <div className="admin-stat">
      <b>{text ?? (value ?? 0).toLocaleString()}</b>
      <small>{label}</small>
    </div>
  )
}

function LimitField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: number | undefined) => void
  value?: number
}) {
  return (
    <label>
      {label}
      <input
        inputMode="numeric"
        min={1}
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(event.target.value === '' || !Number.isFinite(next) || next <= 0
            ? undefined
            : Math.trunc(next))
        }}
        placeholder="Plan default"
        type="number"
        value={value ?? ''}
      />
    </label>
  )
}
