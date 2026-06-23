
# Gap Analysis: Current App vs DispoGenius / InvestorLift

Based on a review of the current codebase (Deals/Pipeline, Buyers + Archive, Finder, Title Co's, Realtors, Notaries, Marketing, Offers, Credits, GHL sync), here's where we stand and where the gaps are vs the leading dispo platforms.

## What we already have (solid foundation)
- Pipeline (Kanban + list), deal drawer, activity log, checklist, files, assignees
- Buyers rolodex + global Archive with reveal/credits + vetting + completeness scoring
- Buyer Finder algorithm w/ markets, price, property type, completeness boost
- Deal Marketing (public deal page), offers tracking
- Title companies, Realtors, Notaries directories (personal + archive)
- GHL integration (opportunity sync, stage mappings, sub-accounts, SSO)
- Credits, subscriptions, operator accounts, team/roles, KPIs

## Major gaps vs DispoGenius / InvestorLift

### 1. Outbound buyer marketing (biggest gap)
Neither a true "blast" engine exists. Competitors win here.
- **Email blasts** to matched buyers with deal page link, open/click tracking
- **SMS blasts** (Twilio/GHL) with compliance (TCPA opt-out, quiet hours)
- **Ringless voicemail** drops
- **Branded buyer-facing deal pages** (we have public deals; need theming, photos gallery, financials calculator, comps, map, downloadable docs)
- **Per-buyer tracking links** so we know who opened/clicked/viewed

### 2. Buyer engagement & bidding
- **Live offer portal** on the public deal page (buyer submits offer + POF without login, or via magic link)
- **Highest-and-best / auction mode** with countdown timer
- **Deal "interest" button** (soft signal before formal offer)
- **Buyer reply inbox** consolidated (email replies, SMS replies tied to deal)

### 3. Buyer intelligence
- **Buyer activity score** (opens, clicks, offers, closes) feeding the algorithm
- **"Hot buyers" leaderboard** per market
- **Skiptrace enrichment surfaced in UI** (we have skiptrace tables but limited workflow)
- **Duplicate detection / merge** for buyers across rolodex + archive
- **Buyer tags** (cash, hard money, fix-flip, BRRRR, Sec 8, MTR, etc.) used in matching
- **POF verification workflow** (admin review, expiration dates, auto-flag stale)

### 4. Deal intake & enrichment
- **Comps integration** (manual entry now; add ATTOM/Zillow/RentCast pull)
- **ARV/MAO calculator** built into deal
- **Photo gallery upload** + auto-resize, drag reorder, cover photo
- **Property data autofill** from address (county, zip, beds/baths, sqft)
- **Map view** of deals + buyers' markets

### 5. Contracts & closing
- **E-signature** (DocuSign/Dropbox Sign) on assignment contracts
- **Contract templates** with merge fields (buyer, seller, address, price)
- **EMD tracking workflow** with reminders + escrow link
- **Title order automation** — one-click "Send to title" with contract + buyer info
- **Closing checklist** auto-generated from stage

### 6. Lead/seller side (optional but DG has it)
- Seller lead intake forms, lead source attribution, disposition reasons
- We track lead_source but no intake forms or seller campaigns

### 7. Reporting & analytics
- KPIs exist; missing:
  - **Buyer engagement reports** (opens, clicks, response rate per blast)
  - **Time-to-assign / time-to-close cohort analysis**
  - **Revenue forecasting** from pipeline weighted by stage
  - **Per-market velocity**
  - **Source ROI** (which lead source → closed deals)

### 8. Collaboration & workflow
- **@mentions and threaded comments** on deals (we have activity log only)
- **Task automations / triggers** (when stage → X, create task / notify role)
- **Slack/Discord notifications** for new offers, won deals
- **Email-to-deal** (forward seller emails into deal activity)

### 9. Public-facing / VIP buyer portal
InvestorLift's killer feature: a **logged-in buyer portal** where buyers
- See deals matched to their criteria
- Save favorites, set alerts
- Submit offers, upload POF once and reuse
- See their own deal history with you
We have nothing here.

### 10. Mobile / Polish
- No PWA / mobile-optimized deal cards for on-the-go dispo
- Push notifications for new offers
- Quick-action toolbar (call buyer, text buyer, copy deal link)

---

## Quick-win improvements to existing features

- **Finder**: add filters for buyer tags, last-active recency, min completeness score; export matched list to CSV; "Send blast to these N buyers" CTA
- **Buyer profile**: timeline of every deal sent + their response; auto-vetting expiration; one-click "Request updated POF" email
- **Deal page**: photo lightbox, comps table, financial breakdown, embedded map
- **Offers tab**: rank by net-to-seller, side-by-side compare, accept→auto-populate contract
- **Marketing**: per-deal share link with UTM, QR code, branded preview card (OG tags) — verify SEO meta on PublicDeal
- **Archive**: bulk-reveal with credit estimate, saved searches with email alerts when new matching buyers added
- **Notifications**: in-app + email digest of new offers, hot buyers, expiring EMD, stale deals
- **Realtor/Notary directories**: tie to deals (assign closing notary / listing realtor), track usage like title companies

---

## Suggested prioritization (phases)

**Phase 1 — Outbound engine (highest ROI)**
1. Email blast to matched buyers (Resend, tracked opens/clicks per buyer)
2. Branded deal page upgrade (photos, comps, financials, map)
3. Tracked share links + UTM
4. Bulk "send to matched buyers" from Finder

**Phase 2 — Offer & engagement**
5. Public offer submission form on deal page (magic-link, no auth)
6. Offer ranking + accept→contract flow
7. SMS blast (Twilio or GHL passthrough) with TCPA controls
8. Buyer activity score feeding Finder algorithm

**Phase 3 — Contracts & closing**
9. E-sign integration + contract templates with merge fields
10. One-click send-to-title
11. Auto-checklist by stage + reminders

**Phase 4 — Buyer portal & intelligence**
12. Logged-in buyer portal (deals matched, favorites, alerts, POF vault)
13. Comps / ARV integration (ATTOM or RentCast)
14. Skiptrace workflow surfaced in buyer UI

**Phase 5 — Analytics & polish**
15. Engagement & revenue reports
16. Slack/email digests, automations, @mentions
17. Mobile PWA + push

---

## Technical notes (for later phases)
- Email: Resend via edge function; track via webhook → `buyer_engagement` table
- SMS: Twilio Messaging Service; persist consent + opt-outs per buyer
- E-sign: Dropbox Sign (cheaper than DocuSign) via edge function
- Comps: RentCast API (cheapest) or ATTOM for richer data
- Public offer submission: extend `deal_offers` with `submitted_via='public'`, validate via signed magic-link tokens
- Buyer portal: Supabase Auth with `buyer_portal` role; RLS limits to buyers' own data + deals matching their markets

---

Want me to turn any phase (or specific items) into a concrete build plan? I'd suggest starting with **Phase 1: email blast + branded deal page** — it's the single biggest competitive gap and unlocks measurable buyer engagement data we can feed back into the Finder algorithm.
