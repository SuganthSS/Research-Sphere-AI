import React from 'react'

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`py-12 px-4 text-center flex flex-col items-center justify-center max-w-md mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-100/90 text-slate-500 border border-slate-200/60 flex items-center justify-center mb-3.5 shadow-2xs">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
