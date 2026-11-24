import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'success'
    | 'processing'
    | 'failed'
    | 'info'
    | 'teal'
    | 'purple'
    | 'neutral'
  size?: 'sm' | 'md'
  dot?: boolean
  shape?: 'pill' | 'rounded'
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  shape = 'pill',
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    processing: 'bg-amber-50 text-amber-800 border-amber-200/80',
    failed: 'bg-rose-50 text-rose-700 border-rose-200/80',
    info: 'bg-blue-50 text-blue-700 border-blue-200/80',
    teal: 'bg-teal-50 text-teal-700 border-teal-200/80',
    purple: 'bg-violet-50 text-violet-700 border-violet-200/80',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200/80',
  }

  const dotColors = {
    success: 'bg-emerald-500',
    processing: 'bg-amber-500',
    failed: 'bg-rose-500',
    info: 'bg-blue-500',
    teal: 'bg-teal-500',
    purple: 'bg-violet-500',
    neutral: 'bg-slate-400',
  }

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-0.5 gap-1.5 font-medium',
  }

  const shapeStyles = {
    pill: 'rounded-full',
    rounded: 'rounded-md',
  }

  return (
    <span
      className={`inline-flex items-center border leading-none tracking-tight ${variantStyles[variant]} ${sizeStyles[size]} ${shapeStyles[shape]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} shrink-0`} />}
      {children}
    </span>
  )
}
