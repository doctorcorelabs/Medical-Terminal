# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Scheduled Functions

This project uses Netlify scheduled functions for background maintenance jobs.

- `scheduled-news`: fetches RSS and deletes old news records.
- `evaluate-alerts`: evaluates alert rules on a recurring interval.
- `cleanup-activity-events`: deletes `user_activity_events` records older than 14 days.
- `enqueue-alert-notifications`: creates queue items for new/resolved alert events.
- `enqueue-schedule-reminders`: creates queue items for due schedule reminders.
- `send-telegram-notifications`: dispatches pending queue items to Telegram Bot API.
- `retry-notification-dispatch`: recovers stale locks and requeues retryable failures.
- `notification-cycle`: orchestrates enqueue + dispatch in one run for full automation.

Automation notes:

- `notification-cycle` runs every minute via scheduled function.
- Schedule CRUD in the app also triggers `notification-cycle` best-effort to reduce waiting.
- You do not need to manually open function URLs in normal operation.

Required environment variables for scheduled jobs:

- `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SERVICE_ROLE_KEY` / `VITE_SUPABASE_SERVICE_ROLE_KEY`)

Additional environment variables for Telegram notification queue:

- `TELEGRAM_BOT_TOKEN` (required)
- `VITE_TELEGRAM_BOT_USERNAME` (required for one-click connect button in Schedule page, example: `my_medterminal_bot`)
- `TELEGRAM_WEBHOOK_SECRET` (recommended, validates Telegram webhook requests)
- `TELEGRAM_MAX_BATCH_SIZE` (default: `100`)
- `TELEGRAM_SEND_TIMEOUT_MS` (default: `7000`)
- `NOTIFICATION_MAX_ATTEMPTS` (default: `3`)
- `NOTIFICATION_BACKOFF_BASE_MS` (default: `5000`)
- `NOTIFICATION_STALE_LOCK_MINUTES` (default: `10`)
- `NOTIFICATION_ALERT_LOOKBACK_MINUTES` (default: `10`)
- `SCHEDULE_REMINDER_MINUTES` (default: `30`)
- `SCHEDULE_REMINDER_LOOKAHEAD_MINUTES` (default: `2`)
- `SCHEDULE_REMINDER_GRACE_MINUTES` (default: `1`)

Database setup:

- Run `supabase_telegram_notifications_setup.sql` in Supabase SQL Editor before enabling these jobs.

Telegram one-click verification setup:

1. Deploy the site so function endpoint is available.
2. Set Telegram bot webhook to:
	- `https://<your-site-domain>/.netlify/functions/telegram-webhook`
3. If you use `TELEGRAM_WEBHOOK_SECRET`, register the same value when calling Telegram `setWebhook`.
4. Ensure frontend env has `VITE_TELEGRAM_BOT_USERNAME`.
5. User flow: open Schedule page → click `Buka Telegram` → press `Start` in bot → status auto changes to connected.
