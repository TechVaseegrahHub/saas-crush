<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6f5858c8-2318-4120-9787-e357be0f87ca

## Run Locally

Create a .env.local file with the MongoDB variables from .env.example.
The server loads .env.local and .env; it does not load .env.example.

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production

The live deployment must define the MongoDB, WhatsApp, and admin variables in
`.env.example` (copy the values into the deployment provider's environment
settings; `.env` is not uploaded automatically). For
MongoDB Atlas, add the deployment's outbound network access to the Atlas IP
access list. Check `/api/health` after deploying; it should return
`{"ok":true,"database":"connected"}` before testing score saving.

Set `ADMIN_PASSWORD` before opening `/admin`. The admin page uses it to protect
customer data, including WhatsApp numbers.

Build the frontend and start the Express server so the `/api/leaderboard` and
`/api/scores` routes are available in the deployed app:

`npm run build && npm start`
