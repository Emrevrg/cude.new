// Cude.new - Button.tsx (Cude product surface, 2026)
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '~/utils/classNames';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-borderColor disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-cude-background-depth-1 border border-cude-borderColor text-cude-textPrimary hover:bg-cude-background-depth-2 shadow-sm',
        destructive: 'bg-cude-item-contentDanger text-white hover:bg-red-600 shadow-sm',
        outline:
          'border border-cude-borderColor bg-cude-background-depth-1 hover:bg-cude-background-depth-2 hover:text-cude-textPrimary text-cude-textPrimary shadow-sm',
        secondary:
          'bg-cude-background-depth-2 border border-cude-borderColor text-cude-textPrimary hover:bg-cude-background-depth-1 shadow-sm',
        ghost: 'hover:bg-cude-background-depth-2 hover:text-cude-textPrimary',
        link: 'text-cude-textPrimary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, ...props }, ref) => {
    return <button className={classNames(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
