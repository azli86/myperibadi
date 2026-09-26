# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, v16.3, Turbopack) + Tailwind; FastAPI + Postgres API. Mobile web is the primary surface; the design language is web, not native.

## Users

<!-- inferred from the repository; the owner has not yet corrected it -->

Malaysian households and individuals tracking personal and shared money on a phone. The operator is often an admin of a household account, entering transactions several times a day, frequently one-handed, frequently interrupted. A second audience reads the same data as a report: what a trip cost, what a vehicle costs to run, what is left before the next cycle.

## Product Purpose

Budget by Digitalport ("MyPeribadi") records income and spending, groups it into wallets, categories, cycles and events, and answers the question the user actually has: where did the money go, and what is left. Transactions also arrive through a Telegram/WhatsApp bot and receipt OCR, so the ledger fills without the user opening the app.

## Positioning

<!-- inferred -->

The record is shared. Household members, wallets, trips, vehicles, health readings and warranties live in one account with per-user access, and a chat bot writes into the same ledger as the forms. Most personal-finance apps stop at one person's numbers.

## Operating Context

Malay and English are both first-class: every user-facing string goes through a `tr()` style pair, and the interface is read in either. Currency is RM and amounts are formatted, not raw. The app is installed as a PWA; users reach it from a phone home screen far more often than a desktop. Receipt photos, bank PDF statements and Telegram messages are ordinary inputs, not edge cases.

## Capabilities and Constraints

Money in, money out, transfers, refunds, split bills, cycles, budgets and events; wallets with balances; vehicles with fuel and maintenance; tax; health readings and medications; inventory and warranties; a chat assistant; support tickets. A transaction can carry a category, a wallet, a note, a location and a receipt. Events collect transactions over a date window and can be excluded from a budget.

The interface is deliberately token-driven: colour, surface, border and shadow come from CSS custom properties in `globals.css`, with a real light and dark theme. Both themes are shipped and both must stay correct. Generated build-version files are tracked because production consumes them.

## Brand Commitments

<!-- inferred -->

The product name is "MyPeribadi" for the user-facing brand and "Budget by Digitalport" for the operator. Existing navigation labels, product names and Malay terminology are established and must not be renamed as a side effect of a design change. No logo or palette is pinned beyond what `globals.css` already defines.

## Evidence on Hand

A live production Postgres instance with real household data: several thousand transactions, categories, wallets, events, vehicles. No marketing copy, testimonials, customer logos or benchmark figures exist and none may be invented.

## Product Principles

1. The number comes first. A screen that shows a balance must make that balance the most legible thing on it.
2. The phone is the surface. Any layout that only works above 768px is a layout that is not finished.
3. Both themes are real. A colour that only works in dark is a bug.
4. The bot and the form write to the same ledger. They must show the same truth.
5. Malay is not a translation layer bolted on at the end.

## Accessibility & Inclusion

<!-- inferred -->

Touch targets on the phone surface must stay comfortably tappable, contrast must hold in both themes, and every icon-only control needs an accessible label. No formal standard has been committed to.
