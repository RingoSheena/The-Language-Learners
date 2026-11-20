// Small line icons (24x24, drawn with currentColor) for icon buttons. They're
// decorative: the button they sit in carries the accessible name.
function Icon({ children, filled = false, ...props }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

// Points right: back buttons sit at the right end of the top bar
export const BackIcon = () => (
  <Icon>
    <path d="m12 5 7 7-7 7" />
    <path d="M5 12h14" />
  </Icon>
)

export const UploadIcon = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </Icon>
)

export const CardsIcon = () => (
  <Icon>
    <rect x="3" y="7" width="13" height="15" rx="2" />
    <path d="M8 3h10a3 3 0 0 1 3 3v12" />
  </Icon>
)

export const SettingsIcon = () => (
  <Icon>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const LogOutIcon = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Icon>
)

export const FullscreenIcon = () => (
  <Icon>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </Icon>
)

export const SlidersIcon = () => (
  <Icon>
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
    <path d="M14 2v4M8 10v4M16 18v4" />
  </Icon>
)

export const BookmarkPlusIcon = () => (
  <Icon>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    <path d="M12 7v6M9 10h6" />
  </Icon>
)

export const BookmarksIcon = () => (
  <Icon>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    <path d="M10 2v8l3-3 3 3V2" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
)

export const EditIcon = () => (
  <Icon>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
)

export const PlayIcon = () => (
  <Icon filled>
    <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12.2-7.5a1 1 0 0 0 0-1.7L8.52 3.65A1 1 0 0 0 7 4.5z" />
  </Icon>
)

export const TableIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </Icon>
)

export const FlameIcon = () => (
  <Icon>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m22 4-10 10.01-3-3" />
  </Icon>
)

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
)

export const TrendIcon = () => (
  <Icon>
    <path d="m22 7-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </Icon>
)

export const TargetIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
)

export const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
)

export const PaletteIcon = () => (
  <Icon>
    <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4.5 4H16a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 13.3 22z" />
    <circle cx="7.5" cy="10.5" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="10.5" r="1.25" fill="currentColor" stroke="none" />
  </Icon>
)

export const TickIcon = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)
