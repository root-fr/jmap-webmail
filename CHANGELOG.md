# Changelog

## 1.7.1 (2026-08-28)

- **OIDC logout works with Keycloak again.** The end-session redirect
  now carries `id_token_hint` and `client_id`, which the spec requires
  alongside `post_logout_redirect_uri`. (#102)
- **The favicon unread badge shows up on Firefox and Chrome/Linux.**
  The badge now updates the existing icon link instead of appending a
  second one that those browsers ignore, and the Safari 15 fallback
  draws its border correctly. Thanks @jabiinfante. (#66)
- **Removed the sub-addressing "Learn More" dead end** in
  Settings > Identities; it only reopened the identity manager. (#76)

## 1.7.0 (2026-08-28)

One inbox for all your accounts. If your session exposes shared or
group accounts, the new "All Inboxes" view merges their mail with
yours, search can cover everything, and replying from a shared account
sends as that account.

### Unified inbox

- **"All Inboxes" merges every account into one view.** Your own mail
  and any shared or group accounts appear in a single list, sorted
  together, with an aggregated unread badge in the sidebar. Messages
  from other accounts carry an account chip in the list and an account
  line in the viewer, so nothing gets mixed up visually. (#53, #73)
- **You choose what gets merged.** A settings section adds a show/hide
  toggle for the view and a per-account include list.
- **One slow account never blanks the list.** If an account fails to
  load, the others still render and an inline notice names the failed
  account with a retry button.
- **New mail in shared accounts shows up without a refresh.** Push
  polling now covers every account, so list and badges stay current
  for group mailboxes too.

### Search

- **Everywhere now means every account.** The Everywhere search scope
  used to silently query only your primary account; it now spans all
  of them, with results attributed per account.

### Sending

- **Reply from a shared account, as the shared account.** Replying to
  mail addressed to a group account now sends through that account's
  own identity, keeps attachments intact, and files the copy in that
  account's Sent folder. If the server refuses, you get an explicit
  choice to resend from your own address; the sender is never swapped
  silently.

### Fixes

- **Actions always target the message you acted on.** Message ids are
  only unique within an account, so in merged views two accounts can
  hold the same id for unrelated messages. Delete, archive, spam,
  star, batch operations and drag-and-drop now carry the owning
  account of the exact row you clicked, and moving to a folder maps
  the destination to the matching folder of each account.
- **Toast notifications are visible again.** The Undo button after
  marking a message as spam and the feedback after batch moves
  rendered nowhere because the notification layer was never mounted.
- **The retry button after a failed SSO discovery** on the login page
  showed a broken label.
- Security updates: Next.js 16.3.3 and dompurify 3.4.14, plus patched
  transitive dependencies.

## 1.6.0 (2026-07-05)

Search now covers your whole account by default, big mailboxes paginate
without hiding mail, and you can sort the list by more than just date.
Polish joins as the eleventh language.

### Search

- **Search covers every folder by default.** Typing in the search box
  used to only look inside the folder you were viewing, so mail in
  Archive or Sent stayed hidden unless you switched folders first.
  Search is now account-wide, with chips to narrow it back to the
  current folder or to pull in Trash and Junk when you want them. Each
  result shows which folder it lives in. (#75)
- **Fixed large mailboxes where some mail was only reachable through
  search.** On big folders the list used offset paging that drifted
  when new mail arrived mid-scroll, so infinite scroll could loop at a
  fixed point and leave older or newer messages unreachable except by
  searching for them. Paging now anchors to the last message you have
  loaded, so it stays put. (#71)

### Sorting

- **Sort the list by date, sender, subject or size**, ascending or
  descending, from a menu in the list header. Sorting runs on the
  server, so it orders the whole mailbox rather than only the rows
  already loaded.

### Internationalization

- **Polish added** as the eleventh language, with a full translation.
  Thanks to @priard for the contribution.
- **The browser's language is respected on first visit.** A returning
  detail meant the stored preference always won even before you had
  set one, so the interface could show English when your browser asked
  for something else. It now follows the browser until you choose a
  language yourself. (#70)

### Accessibility

- **Menus are fully keyboard-operable.** The right-click menu, the
  selection dropdown and the trusted-senders dialog now support arrow
  keys, Home and End, Escape to close, and return focus to where you
  opened them. Submenus are reachable without a mouse. (#94)

### Under the hood

- Every list view (browse, search, sort, load-more, background
  refresh) now runs through one query builder, so scope, sort and
  paging can no longer disagree with each other. Large multi-select
  and whole-thread actions are split into server-sized batches, and
  deleting from Trash only permanently removes mail when you are
  actually viewing Trash.

## 1.5.3 (2026-07-05)

A stability release: fifteen bug fixes across sending, filters, shared
mailboxes and the reading pane, several of them long-standing. No new
features, but two of the fixes change behaviour you may notice, both
for the better.

### Security

- **The Content Security Policy is now enforced**. Earlier releases
  sent the policy in report-only mode, which browsers log but never
  act on, so the nonce-based script restrictions did not actually
  apply. The policy now ships under the enforcing header: only
  scripts carrying the per-request nonce can run, plugins and framing
  are blocked, and inline images from email attachments keep working
  through an explicit `blob:` allowance. If you run behind a reverse
  proxy that rewrites headers, check that it passes
  `Content-Security-Policy` through untouched.
- **Filter scripts now escape every user-supplied value**. A rule
  name, custom header name or size value containing Sieve syntax
  could break out of its quoted string or comment and add its own
  commands to the uploaded script, up to redirecting or discarding
  incoming mail. This also applied to imported filter sets. All
  fields are sanitised before the script is generated.
- **dompurify upgraded to 3.4.11** (eight advisories since 3.4.0,
  including sanitizer bypasses; this project sanitises untrusted
  email HTML, so these mattered) and **Next.js to 16.2.10** for the
  June security backports.
- **Remote images loaded through the `background` attribute are now
  blocked in the conversation view** when external content blocking
  is on, matching what the single-message view already did.

### Fixes

- **Failed sends are reported instead of pretending to succeed**: a
  wrong error check meant the composer closed normally while the
  message stayed in Drafts, unsent, with no warning. Server-side
  errors on send and on filter validation now surface properly.
- **Right-click actions target the message you clicked**: Delete,
  Archive and Mark as spam from the list context menu could act on
  the message open in the reading pane instead.
- **Archiving a conversation leaves your own copies alone**: it used
  to pull your sent replies out of Sent and draft replies out of
  Drafts along with the rest of the thread.
- **"Stop processing further rules" works after Discard and Reject**
  (#67, thanks @travier for the report and the fix).
- **Live updates survive folder changes**: creating or deleting a
  folder silently stopped background mail refresh for the rest of
  the session, while the connection indicator stayed green.
- **Bulk actions work in shared mailboxes**: multi-select mark as
  read, move and delete ran against the wrong account there, and
  changes the server refused were shown as successful, only to be
  undone by the next refresh. Failures are now reported honestly.
- **The "mark as read" setting is honoured**: opening a message
  marked it read immediately even with a delay or "never" configured.
- **Sending waits for attachments**: sending while a file was still
  uploading, or after its upload had failed, silently sent the
  message without the attachment.
- **Deleting from Trash actually deletes**: with the default
  "move to trash" setting, deleting an already-trashed message did
  nothing server-side, so it reappeared after the next refresh.
- **Search results and scroll position survive background
  refreshes**, and the new-mail sound only plays for mail that is
  genuinely newer, not when the top of the list changes for other
  reasons.
- **Large address books warn instead of truncating silently** when
  they exceed the 1000-contact query limit.
- **The unread-count favicon badge now renders on Firefox**: the
  legacy `favicon.ico` shipped alongside the SVG icon and Firefox
  picked the wrong one (thanks @jabiinfante for the diagnosis).

### Internal

- Duplicate helpers removed, one unused dependency dropped, dead
  translation keys cleaned out of all ten locales, and about two
  dozen unit tests added around the fixed code paths (the suite now
  counts 745).

## 1.5.2 (2026-05-14)

### Security

- **Next.js upgraded to 16.2.6 to patch CVE-2026-44578**
  (GHSA-c4j6-fc7j-m34r, CVSS 8.6). The framework's WebSocket upgrade
  handler did not apply the safe-rewrite checks used for normal HTTP
  requests, so a single unauthenticated HTTP upgrade could cause the
  Node server to issue an internal request to any host reachable on
  port 80 and return the response to the attacker. Self-hosted
  deployments (the only mode this project supports) were exposed to
  cloud metadata endpoints, internal APIs, and admin panels. The bump
  to 16.2.6 also pulls in eleven other May 2026 advisories covering
  middleware/proxy bypass, denial of service, and a React patch.
- **`next-intl` upgraded to patch GHSA-4c35-wcg5-mm9h**, a prototype
  pollution issue in the experimental precompile path. This project
  doesn't enable that path, but the dependency is patched anyway.
- **Hardening note for self-hosters**: a public PoC for CVE-2026-44578
  exists. Redeploy on `rootfr/jmap-webmail:1.5.2` (or `latest`) and,
  where you can, keep the container off untrusted networks and block
  egress to cloud metadata endpoints (AWS IMDS, GCP metadata).

### Fixes

- **Bulk delete now honours the "delete to trash" setting**: emptying
  a selection from the toolbar always performed a hard delete, even
  when the user had configured deletes to move to Trash first. The
  store path used by the toolbar now routes through the same trash
  helper as the single-message delete action, so the behaviour matches
  Settings.
- **Favicon clears the unread badge as soon as the inbox empties**:
  on `unreadCount === 0` the favicon kept the last-painted badge until
  the next refresh because the redraw skipped the zero case. The hook
  now repaints the base icon on the zero transition so the badge
  disappears immediately.

## 1.5.1 (2026-04-17)

### Fixes

- **Attachments from Gmail-origin mail now render**: Gmail stamps a
  `Content-ID` on every attachment it sends, even when the HTML body
  never references it inline. The viewer treated any cid-bearing part
  as an inline image and hid it from the attachment panel, so the
  paperclip indicator showed but no downloadable block did. The viewer
  now marks an attachment as inline only when its cid is actually
  cited as `cid:...` in the HTML body — everything else renders as a
  regular attachment. Applied to both the single-email viewer and the
  threaded conversation view. Closes #58. Thanks @melges-morgen for
  the repro.
- **Email-to-self no longer discarded as duplicate**: the sending
  account's own MTA was dropping inbound delivery for self-send
  because the client created the outgoing copy in Sent before
  submission, so the Message-ID was already known locally when SMTP
  tried to deliver the same message back. The send flow now keeps the
  message in Drafts during submission and uses
  `EmailSubmission.onSuccessUpdateEmail` to move it to Sent only
  after SMTP has accepted the outbound copy. Closes #60. Thanks
  @tamisoft for the report.

## 1.5.0 (2026-04-17)

### Features

- **Archive applies to the whole thread**: archiving from a threaded
  conversation now moves every message in the thread to Archive in a
  single `Email/set`, matching Gmail / Apple Mail behaviour. Closes #49.
  Thanks @capitanroy for the issue and the implementation suggestion.
- **Russian and Ukrainian locales**: `ru` and `uk` are now available in
  the language switcher, each with a full translation set (1210 keys)
  and proper Slavic plural forms. Thanks @VsevolodSauta (#59).
- **Custom favicon with unread badge**: the tab icon is now a mail SVG,
  and a red badge with the inbox unread count is painted on top (a `+`
  when there are more than nine unread). Also fixes a latent bug where
  the sidebar unread counter could go stale after a JMAP push. Thanks
  @jabiinfante (#63).
- **Optional domain-favicon avatars**: when a contact has no photo,
  Settings → Email → "Domain avatars" replaces the initials avatar with
  the favicon of the sender's domain. The lookup goes through a local
  `/api/favicon` proxy and only the domain name is ever sent out — no
  email address, no hashing. Freemail providers (gmail, outlook, yahoo,
  icloud, proton, gmx and others) keep initials so the same logo isn't
  shown for every sender on a shared host. Off by default. Closes #22.

### Fixes

- **Plain-text email printing**: the Print action (button, Ctrl+P, menu)
  now prints only the email content on a clean white page — reply /
  archive / delete buttons, quick reply and sidebar are all hidden.
  Dark-mode themes are neutralised so text stays black on white even
  when the browser's "Print background graphics" toggle is off.
- **HTML email printing**: messages rendered in the sandboxed iframe
  now print correctly. The print pipeline inlines the iframe body into
  the print overlay so the browser doesn't see an empty frame. Wide
  newsletters shrink to the page width instead of being clipped on the
  right edge.
- **Contacts load past 500 entries**: `ContactCard/get` is now batched
  to respect the server's `maxObjectsInGet` (Stalwart default is 500),
  so address books with more than 500 contacts no longer silently load
  as empty. Closes #45. Thanks @capitanroy (#46).
- **Sieve filter destinations preserve the folder hierarchy**:
  selecting a nested folder as a filter destination now writes the full
  `Parent/Child` path to the generated script instead of just the leaf
  name, so the server can resolve it. Closes #62. Thanks @travier for
  the report.
- **OIDC error over plain HTTP is readable**: Sign in with SSO now
  surfaces a clear "requires a secure connection" banner instead of
  throwing `crypto.subtle is undefined`. Closes #23. Thanks @jothoma1
  for the report.
- **Print layout excludes the sidebar and email list**: the printed
  page shows only the email viewer, not the full application chrome.
  Thanks @prastowoagungwidodo (#55).
- **Contact empty-state buttons**: the "New Contact" / "Import vCard"
  action row no longer overflows in the contact panel's empty state.
  Thanks @prastowoagungwidodo (#56).
- **Contact delete dialog renders in every locale**: added the missing
  `delete_confirm_title` and `form.delete` keys across all nine non-
  Dutch locales. Previously hitting Delete in English threw a
  `MISSING_MESSAGE` error.
- **Favicon badge hook no longer crashes React**: the hook now owns a
  single `data-dynamic-favicon` link and leaves Next.js's icon link
  alone, fixing a `parentNode is null` crash on route changes.
- **Avatar fallback when a domain has no favicon**: the `/api/favicon`
  proxy returns a real `404` for domains DuckDuckGo can't resolve, so
  the `<img>` error event fires and the avatar falls back to the
  initials rather than showing a generic placeholder icon.

### Documentation

- **README**: added an example for `OAUTH_ONLY=true` to disable Basic
  Auth when running in SSO-only mode. Thanks @travier (#61).

### Infrastructure

- **Docker major version tag**: container images are now also published
  under `jmap-webmail:1`, so deployments can pin to the current major
  and receive non-breaking minor / patch updates automatically. Thanks
  @joelpurra (#57, closes #54).

## 1.4.1 (2026-04-16)

### Security

- **XSS in plain-text email renderer**: Plain-text bodies escaped `<`, `>`, `&` but
  not `"` or `'` before the URL linkifier built the anchor tag. A crafted URL
  containing a double or single quote broke out of the `href` attribute and could
  inject event handlers (e.g. `onmouseover`). Both the single-email viewer and the
  threaded conversation view are affected. Fixed by a shared `plainTextToSafeHtml`
  helper that escapes all five HTML-significant characters before linkification,
  with regression tests. Reported privately by Linus Rath (@rathlinus) — thank you.
- **Apache JAMES compose compatibility**: Email submission now includes an explicit
  `type: "text/plain"` on the `textBody` part per RFC 8621 §4.1.4. Stalwart accepts
  either form; JAMES 3.9 rejects the request without it (#48). Thanks @jbfreymann-sara
  for the report.

### Dependencies

- Next.js 16.1.5 → 16.2.4 (DoS in Server Components, GHSA-q4gf-8mx6-v5v3)
- next-intl 4.5.8 → 4.9.1 (open redirect, GHSA-8f24-v5vv-gm5j)
- DOMPurify 3.3.1 → 3.4.0 (`FORBID_TAGS` bypass, GHSA-39q2-94rc-95cp)
- Transitive fixes for vite, picomatch, brace-expansion

## 1.4.0 (2026-03-23)

### Features

- **Folder management**: Create, rename, move, and delete mailbox folders from the sidebar
  context menu, with drag-and-drop reparenting and inline editing (#44)
- **Mail multi-selection**: Select multiple emails with checkboxes or shift-click, then
  batch move or delete from the toolbar. Includes a "Move to" popover with search and
  keyboard navigation (#43)

### Fixes

- **Health endpoint**: Container restarts caused by false-positive memory alerts. The check
  was using V8's current heap allocation as the max instead of the real heap limit (#41).
  Thanks @wrenix and @ClemaX for reporting and diagnosing.
- **Identity deletion**: Fix "delete identity always failed" by adding the required
  `urn:ietf:params:jmap:submission` capability to all Identity and EmailSubmission
  operations (#42). Thanks @freddij for reporting.
- **Inline images**: CID-referenced images now render inline instead of showing as
  attachments
- **Email list**: Eliminate flicker during loading and after-action refreshes
- **Copy to clipboard**: Visual feedback on copy, fix dark mode background tint
- **Console cleanup**: Remove production console statements

### Dependencies

- Next.js 16.2.0 -> 16.2.1
- Tailwind CSS 4.2.1 -> 4.2.2
- Zustand 5.0.11 -> 5.0.12
- typescript-eslint 8.56.1 -> 8.57.1
- Fix flatted prototype pollution (GHSA-rf6f-7fwh-wjgh)

## 1.3.3 (2026-03-20)

### Fixes

- **Security**: Update Next.js 16.1.6 -> 16.2.0 (CSRF bypass, HTTP request smuggling, image disk cache DoS, resume buffering DoS, dev HMR CSRF)
- **Calendar**: Participant/invitation handling aligned with Stalwart JMAP, deduplicate self-attendees (#36)
- **Calendar**: Double-click to create event from month view with smart time suggestion (#37)
- **Calendar**: Week numbers column in month view, respects firstDayOfWeek setting (#38)
- **Calendar**: Replace inline delete confirms with centered modal dialog (#34)
- **Calendar**: Sticky week headers aligned with calendar grid (#33)
- **Contacts**: Simplified bulk selection actions into compact dropdown menu (#39)
- **Navigation**: Hide vertical nav rail on tablet to avoid duplicate navigation (#40)

## 1.3.2 (2026-03-17)

### Fixes

- **Navigation**: Bottom navigation bar now consistent across all pages (Mail, Calendar, Contacts) on tablet/landscape breakpoint (#30)
- **Navigation**: Fixed nav bar layering (content no longer bleeds through) and removed redundant active indicator bar

## 1.3.1 (2026-03-16)

### Fixes

- **Navigation**: Bottom navigation bar now shows on tablet/landscape breakpoint (768-1023px) where neither mobile nor desktop nav was rendering (#30)

## 1.3.0 (2026-03-16)

### Features

- **Sandboxed email rendering**: Rich HTML emails (newsletters, tables) now render in a sandboxed iframe for CSS isolation — prevents email styles from bleeding into the app UI
- **API retry with backoff**: JMAP requests now automatically retry on transient failures (503, 429, network errors) with exponential backoff
- **Mobile action bar**: Bottom toolbar with Reply, Reply All, Archive, Delete, and More actions when viewing emails on mobile
- **Long-press context menu**: Long-press on email list items triggers the context menu on touch devices, with haptic feedback
- **Tag counts in sidebar**: Collapsible Tags section shows color-coded tags with email counts
- **Empty folder**: One-click empty for Junk and Trash folders with confirmation and batch deletion progress
- **Extra-compact density**: New density option that hides avatars and previews for maximum information density (44px touch targets on mobile)
- **Security tooltips**: SPF, DKIM, and DMARC indicators now show plain-language explanations on hover
- **Resizable sidebars**: Drag the sidebar edge to resize (180-400px), with keyboard and touch support, persisted in settings
- **Sender info panel**: Click a sender's name to see their contact info, add to contacts, or search all their emails
- **OAuth-only mode**: New `OAUTH_ONLY` env var hides the username/password form and only shows SSO login (#32)
- **OAuth retry**: Added retry button when OAuth discovery fails, preventing dead-end login pages

### Improvements

- Mobile/tablet layout transitions are now CSS-first — no more blink on orientation change
- More Actions dropdown works on touch devices (was hover-only)
- Touch-friendly context menu submenus (tap-to-expand instead of hover)
- Wide HTML emails are horizontally scrollable in iframe view

## 1.1.4 (2026-03-16)

### Fixes

- **Mobile**: Bottom navigation bar now stays visible when viewing an email, so users can switch between Mail/Calendar/Contacts (#30)
- **Move to folder**: Dialog now shows hierarchical folder structure instead of a flat list (#29)

## 1.1.3 (2026-03-16)

### Fixes

- **Calendar**: Fix crash when opening calendar with events that have no duration field (e.g. all-day events from certain clients) (#31)
- **Sieve filters**: Fix "Invalid property or value" error when saving filters — use `onSuccessActivateScript` per RFC 9661 instead of setting `isActive` directly (#21)
- **Security**: Update dompurify 3.3.1→3.3.3 (XSS fix), undici 7.22.0→7.24.4 (WebSocket crash, CRLF injection, HTTP smuggling), flatted 3.3.3→3.4.1 (DoS fix)

## 1.1.2 (2026-03-02)

### Fixes

- **Context menu**: Fix "Move to folder" submenu closing when scrolling the folder list or moving the mouse to the submenu (#19)
- **Move to folder**: Fix emails not actually moving on the server — JMAP response errors were silently ignored and shared account IDs were not resolved correctly
- **Dependencies**: Update tailwindcss, lucide-react, @tanstack/react-virtual, @typescript-eslint/*, globals, @types/node

## 1.1.1 (2026-02-28)

### Fixes

- **Email viewer**: Show/hide details toggle now stays in place when expanded instead of jumping to the bottom of the details section (#18)
- **Email viewer**: Details toggle text is now properly translated (was hardcoded in English)
- **Instrumentation**: Resolve Edge Runtime warnings by splitting Node.js-only code into a separate module
- **Security**: Patch minimatch ReDoS vulnerability (CVE-2026-27903) — upgrade 9.0.6→9.0.9 and 3.1.3→3.1.5

## 1.1.0 (2026-02-28)

- Server-side version update check on startup (logs when a newer release is available)

## 1.0.2 (2026-02-27)

- Fix 4 CVEs in production Docker image (removed npm, upgraded Alpine packages)

## 1.0.1 (2026-02-26)

- Remove stale references, clean up README

## 1.0.0 (2026-02-25)

- Initial public release
