import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Density spacing belongs to the same conflict groups as ordinary spacing.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "density-1",
        "density-1-5",
        "density-2",
        "density-2-5",
        "density-3",
        "density-3-5",
        "density-4",
        "density-5",
        "density-6",
        "density-8",
      ],
    },
  },
})

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
