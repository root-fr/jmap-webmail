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
- Full-text search

### User Interface
- Clean, minimalist three-pane layout
- Dark and light theme support
- Responsive design for mobile and desktop
- Keyboard shortcuts for power users
- Drag-and-drop email organization
- Right-click context menus
- Smooth animations and transitions
- Infinite scroll pagination

### Real-time Updates
- Push notifications via JMAP EventSource
- Real-time unread counts
- Live email arrival notifications
- Connection status indicator

### Security & Privacy
- External content blocked by default
- HTML sanitization with DOMPurify
- SPF/DKIM/DMARC status indicators
- No password storage (session-based auth)
- Shared folder support with proper permissions

### Internationalization
- English and French language support
- Automatic browser language detection
- Persistent language preference

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

- Node.js 18+
- A JMAP-compatible mail server (we recommend [Stalwart](https://stalw.art/))

### Installation

```bash
# Clone the repository
git clone https://github.com/root-fr/jmap-webmail.git
cd jmap-webmail

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env.local
```

### Configuration

Edit `.env.local` with your settings:

```env
# App name displayed in the UI
NEXT_PUBLIC_APP_NAME=My Webmail

# Your JMAP server URL
NEXT_PUBLIC_JMAP_SERVER_URL=https://mail.example.com
```

### Development

```bash
# Start development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
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
| `?` | Show shortcuts help |

## Screenshots

*Coming soon*

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
