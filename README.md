# Bulk Email Campaign Manager

A modern email campaign platform built with Next.js, Supabase, and Resend that enables organizations to import contacts, create personalized email campaigns, and track delivery status in real time.

## Overview

Bulk Email Campaign Manager simplifies the process of sending personalized emails at scale. Whether you're managing event invitations, church programs, marketing campaigns, community outreach, or organizational announcements, the platform provides an intuitive workflow from contact import to email delivery.

## Key Features

### Contact Management

* Import contacts from Excel (.xlsx, .xls) and CSV files
* Automatic column detection for names and email addresses
* Search, filter, and manage contacts
* Bulk contact operations
* Cloud-backed contact storage

### Personalized Email Campaigns

* Dynamic personalization using merge tags
* Rich HTML email support
* Reusable email templates
* Live email preview before sending
* Custom sender name and email configuration

### Email Delivery

* Powered by Resend for reliable email delivery
* **Resumable batch sending** — contacts are sent in small batches that survive
  serverless time limits, so large lists send to completion. Stop and resume at
  any time; already-sent contacts are never re-sent.
* **Rate-limit aware** — paces sends under Resend's limits (configurable via
  `RESEND_SEND_DELAY_MS`) and automatically retries transient/rate-limit errors
  with backoff.
* **Bounce skipping** — addresses that hard-bounce or are invalid are marked
  `bounced` and skipped on every future run. A Resend webhook
  (`/api/webhooks/resend`) keeps the bounce list up to date asynchronously.
* Real-time delivery tracking with detailed send logs
* Failed delivery management and retry support

### Robust Spreadsheet Import

* Detects the email column by header **or** by scanning cell contents
* Finds names across `Title` / `First` / `Middle` / `Last` / `Surname` /
  `Other Names` / full-name columns, and falls back to the most name-like column
* Handles header rows that aren't the first row, messy email cells
  (`mailto:`, surrounding text, multiple addresses), and ALL-CAPS names
* De-duplicates against existing contacts and within the file

### Analytics & Status Tracking

* Monitor campaign progress in real time
* Track sent, pending, and failed emails
* Delivery statistics dashboard
* Campaign performance visibility

### Modern User Experience

* Clean and responsive interface
* Fast contact search and filtering
* Streamlined campaign workflow
* Mobile-friendly design
* Built with Next.js and TypeScript

## Technology Stack

* **Frontend:** Next.js, React, TypeScript
* **Database:** Supabase
* **Email Service:** Resend
* **Styling:** Modern responsive UI
* **Deployment:** Netlify-ready

## Use Cases

* Event invitations
* Church and ministry communications
* Conference registrations
* Community outreach campaigns
* Newsletter distribution
* Customer announcements
* Nonprofit engagement campaigns

## Core Workflow

1. Import contacts from Excel or CSV files
2. Organize and manage recipients
3. Create personalized email content
4. Preview campaigns before sending
5. Launch email campaigns
6. Monitor delivery status in real time
7. Review campaign results and analytics

## Security & Reliability

* Secure cloud-based contact storage
* Environment-based credential management
* Reliable transactional email infrastructure
* Error handling and delivery monitoring
* Scalable architecture for growing contact lists

## Netlify Deployment

The application is configured for Netlify with `netlify.toml`.

Use these build settings:

* Build command: `npm run build`
* Publish directory: `.next`
* Node version: `18`

Before deploying, add the variables from `.env.example` to the Netlify site's environment variables. Keep server-side secrets such as `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` out of public client variables.

### Bounce webhook (optional but recommended)

In the Resend dashboard, add a webhook pointing at
`https://<your-domain>/api/webhooks/resend` and subscribe to the
`email.bounced` and `email.complained` events. To protect the endpoint, set
`RESEND_WEBHOOK_TOKEN` and append `?token=<value>` to the webhook URL.

### Database

Run `supabase/default.sql` in the Supabase SQL editor. The `status` column is
free-form text and supports `pending`, `sending`, `sent`, `failed`, and
`bounced` — no migration is needed for the bounce status.

## License

MIT License
