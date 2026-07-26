import { WarningCircle } from '@phosphor-icons/react'

export function IssueList({ issues }: { issues: string[] }) {
  return (
    <div className="biz-issue-list" role="alert">
      <WarningCircle size={20} weight="fill" />
      <ul>
        {issues.map((issue) => <li key={issue}>{issue}</li>)}
      </ul>
    </div>
  )
}
