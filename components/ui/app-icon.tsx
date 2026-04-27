import { cn } from "@/lib/utils"

export function AppIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8 text-black dark:text-white", className)}
    >
      <path
        d="M49.439 44.9771L49.439 81.1699"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M49.439 44.9771L28.1079 44.977"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M70.77 44.9771L49.439 44.977"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M28.1079 60.3817L28.1079 60.8725C28.1079 68.8397 34.5666 75.2983 42.5337 75.2983"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M70.7695 60.3817L70.7695 60.8725C70.7695 68.8397 64.3109 75.2983 56.3437 75.2983"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M49.439 14.5161C49.439 28.0968 38.4297 39.1061 24.849 39.1061L17.6553 39.1061"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M49.439 14.5161C49.439 28.0968 60.4483 39.1061 74.029 39.1061L81.2227 39.1061"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M50 55.5101L21.1318 55.5101"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M78.3071 55.5101L49.439 55.5101"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M81.2227 75.0499C81.2227 78.4299 78.4826 81.1699 75.1027 81.1699H23.7753C20.3953 81.1699 17.6553 78.4299 17.6553 75.0499"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="8.98193"
        y="8.98193"
        width="82.0361"
        height="82.0361"
        rx="6.5"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  )
}
