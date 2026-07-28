# Cloudflare TURN credential Worker

This Worker keeps the Cloudflare TURN key and API token off the public GitHub
Pages client. It returns only short-lived ICE credentials and stores nothing.

## Deploy

1. Revoke the API token that was pasted into chat and create a replacement.
2. From this directory, authenticate Wrangler:
   `npx wrangler login`
3. Add both values interactively:
   `npx wrangler secret put TURN_KEY_ID`
   `npx wrangler secret put TURN_API_TOKEN`
4. Deploy:
   `npx wrangler deploy`
5. Copy the resulting `https://...workers.dev` URL into the GitHub repository
   variable `VITE_TURN_CREDENTIALS_URL`, then rerun the Pages workflow.

For production abuse protection, add a Cloudflare rate-limiting rule for this
Worker route. The Worker already restricts browser calls to
`https://p2p-share.github.io`, permits only GET/OPTIONS, bounds credential TTL
to 5 minutes–24 hours, and never caches credentials.
