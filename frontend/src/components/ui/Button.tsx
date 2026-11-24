import React from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'teal'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      icon,
      children,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

    const variantStyles = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs border border-transparent',
      secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs',
      outline: 'bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-200/90',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900',
      destructive: 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs border border-transparent',
      teal: 'bg-teal-600 hover:bg-teal-700 text-white shadow-2xs border border-transparent',
    }

    const sizeStyles = {
      sm: 'h-8 px-2.5 text-xs rounded-lg gap-1.5',
      md: 'h-9 px-3.5 text-xs sm:text-sm rounded-lg gap-2',
      lg: 'h-10 px-4 text-sm rounded-lg gap-2',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
