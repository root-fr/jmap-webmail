# JMAP Webmail

A modern, privacy-focused webmail client built with Next.js and the JMAP protocol.

## Built for Stalwart

This webmail client is designed to work seamlessly with [**Stalwart Mail Server**](https://stalw.art/) - a modern, secure, and blazingly fast mail server written in Rust.

**Why Stalwart?**
- **Modern Architecture**: Built from the ground up with Rust for performance and safety
- **JMAP-Native**: First-class support for the JMAP protocol (not just IMAP/SMTP bolted on)
- **Privacy-Focused**: Self-hosted, no third-party dependencies, full control over your data
- **Feature-Rich**: Supports JMAP, IMAP, SMTP, ManageSieve, and more

[Stalwart GitHub](https://github.com/stalwartlabs/mail-server) | [Documentation](https://stalw.art/docs/)

## Features

### Core Email Operations
- Read, compose, reply, reply-all, and forward emails
- Full HTML email rendering with security sanitization
- Attachment upload and download
- Draft auto-save with discard confirmation
- Email threading with Gmail-style inline expansion
- Mark as read/unread, star/unstar
- Archive and delete with configurable behavior
- Color tags/labels for email organization
- Advanced search with JMAP filter panel, search chips, and cross-mailbox queries
- Virtual scrolling for large email lists

### User Interface
- Clean, minimalist three-pane layout
- Dark and light theme support
- Responsive design for mobile and desktop
- Navigation rail (desktop icon sidebar + mobile bottom tab bar)
- Keyboard shortcuts for power users
- Drag-and-drop email organization
- Right-click context menus
- Smooth animations and transitions (respects prefers-reduced-motion)
- Infinite scroll pagination
- Welcome banner for first-time users
- Confirmation dialogs with promise-based async flow
- Toast notifications with undo action support
- Inline form validation with shake animation feedback
- Empty state patterns with contextual actions
- Login UX polish (error shake, password visibility toggle, session expired banner)
- Safe area inset support for notched devices
- Screen reader live region announcements

### Real-time Updates
- Push notifications via JMAP EventSource
- Real-time unread counts
- Live email arrival notifications
- Connection status indicator

### Identity Management
- Multiple sender identities with per-identity signatures
- Sub-addressing support (user+tag@domain.com) with tag suggestions
- Identity badges in email viewer and list

### Address Book
- Contact management with search and filtering
- JMAP server sync (RFC 9553/9610) with local fallback
- Email autocomplete from contacts in composer
- Contact groups/lists with group expansion in composer
- vCard import/export (RFC 6350) with duplicate detection
- Bulk operations (multi-select, delete, group add, export)

### Calendar
- JMAP Calendar integration (RFC 8984) with capability detection
- Month, week, day, and agenda views
- Event create, edit, and delete with recurrence rules and reminders
- Participant scheduling with iTIP invitations (organizer/attendee roles, RSVP)
- Inline calendar invitation banner in email viewer (auto-detect .ics attachments, RSVP, import)
- Multi-day events spanning across days, column-based overlap layout
- Mini-calendar sidebar with calendar visibility toggles
- Locale-aware date formatting (respects user's language)
- Settings for first day of week, time format (12h/24h), and default view
- Drag-and-drop rescheduling (week/day time snap, month date move)
- iCalendar (.ics) file import with event preview and bulk create
- Real-time updates via JMAP push notifications
- Event notifications with client-side alert evaluation and toast display
- Configurable notification sound and enable/disable toggles
- Keyboard shortcuts: m/w/d/a (views), t (today), n (new event), arrows (navigate)

### Email Templates
- Reusable email templates with category organization (General, Business, Personal, Support, Follow-up)
- Dynamic placeholder variables (`{{recipientName}}`, `{{date}}`, etc.) with auto-fill from composer context
- Template picker in compose toolbar with search and category filter
- Custom placeholder prompt when inserting templates
- Template manager for creating, editing, duplicating, and deleting templates
- Settings tab for template management

### Email Filters
- Server-side email filtering with JMAP Sieve Scripts (RFC 9661)
- Visual rule builder with conditions (From, To, Subject, Size, Body, etc.) and actions (Move, Forward, Mark read, Star, Discard, Reject, etc.)
- Raw Sieve script editor for advanced users with syntax validation
- Auto-save on rule changes with rollback on failure
- Drag-and-drop rule reordering
- Reset opaque scripts back to visual builder
- Capability-gated (only shown when server supports Sieve)

### Vacation Responder
- JMAP VacationResponse management with date range scheduling
- Dedicated settings tab with message configuration
- Sidebar indicator when vacation auto-reply is active

### Security & Privacy
- External content blocked by default
- Trusted senders list for automatic image loading
- HTML sanitization with DOMPurify
- SPF/DKIM/DMARC status indicators
- No password storage (session-based auth)
- TOTP two-factor authentication support
- Shared folder support with proper permissions
- Newsletter unsubscribe support (RFC 2369)
- CSP headers and security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

### Internationalization
- 8 language support: English, French, Japanese, Spanish, Italian, German, Dutch, Portuguese
- Automatic browser language detection
- Persistent language preference

### Deployment
- Docker support with multi-stage build and standalone output
- Runtime environment variables (no rebuild needed for config changes)
- Health check endpoint for container orchestration
- Structured server-side logging (text/JSON format)

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **JMAP Client**: [jmap-jam](https://www.npmjs.com/package/jmap-jam)
- **i18n**: [next-intl](https://next-intl-docs.vercel.app/)
- **Icons**: [Lucide React](https://lucide.dev/)

## Getting Started

### Prerequisites

- Bun 1.0+ (or Node.js 18+)
- A JMAP-compatible mail server (we recommend [Stalwart](https://stalw.art/))

### Installation

```bash
# Clone the repository
git clone https://github.com/root-fr/jmap-webmail.git
cd jmap-webmail

# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env.local
```

### Configuration

Edit `.env.local` with your settings:

```env
# App name displayed in the UI
APP_NAME=My Webmail

# Your JMAP server URL (required)
JMAP_SERVER_URL=https://mail.example.com
```

**Note:** These are runtime environment variables, read at request time. This enables Docker deployments to be configured without rebuilding the image. Legacy `NEXT_PUBLIC_*` variables are still supported as fallbacks.

### Development

```bash
# Start development server
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint
```

### Production Build

```bash
# Build for production
bun run build

# Start production server
bun run start
```

### Docker

```bash
# Using docker-compose
cp .env.example .env.local
# Edit .env.local with your JMAP_SERVER_URL
docker compose up -d

# Or build manually
docker build -t jmap-webmail .
docker run -p 3000:3000 -e JMAP_SERVER_URL=https://mail.example.com jmap-webmail
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate between emails |
| `Enter` / `o` | Open selected email |
| `Esc` | Close viewer / deselect |
| `c` | Compose new email |
| `r` | Reply |
| `R` / `a` | Reply all |
| `f` | Forward |
| `s` | Toggle star |
| `e` | Archive |
| `#` / `Delete` | Delete |
| `u` | Mark as unread |
| `/` | Focus search |
| `x` | Expand/collapse thread |
| `Ctrl+Shift+T` | Insert template |
| `?` | Show shortcuts help |

## Screenshots

<table>
<tr>
<td width="50%">

**Login**
<img src="screenshots/01-login.png" width="100%" alt="Login">

</td>
<td width="50%">

**Inbox**
<img src="screenshots/02-inbox.png" width="100%" alt="Inbox">

</td>
</tr>
<tr>
<td width="50%">

**Email Viewer**
<img src="screenshots/03-email-viewer.png" width="100%" alt="Email Viewer">

</td>
<td width="50%">

**Compose**
<img src="screenshots/04-compose.png" width="100%" alt="Compose">

</td>
</tr>
<tr>
<td width="50%">

**Dark Mode**
<img src="screenshots/05-dark-mode.png" width="100%" alt="Dark Mode">

</td>
<td width="50%">

**Settings**
<img src="screenshots/06-settings.png" width="100%" alt="Settings">

</td>
</tr>
</table>

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and development status.

## Acknowledgments

- [Stalwart Labs](https://stalw.art/) for creating an excellent JMAP mail server
- The [JMAP](https://jmap.io/) working group for the protocol specification
- All contributors and users of this project

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
