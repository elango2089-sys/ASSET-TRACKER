# Synergy Asset Tracker

Asset management application for Synergy Global Sourcing.

## Features
- Track Big Bins (SGM-B) and Small Bins (SGM-S).
- Manage Dispatches and Returns.
- Supplier Ledger for tracking outstanding assets.
- PWA Support (Installable on mobile/desktop).
- Export to Excel.

## Local Setup
1. Clone the repository.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Cloud Deployment (Render.com)
1. Upload this folder to a GitHub repository.
2. Connect the repository to **Render.com**.
3. Use the following settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Access your app via the provided `.onrender.com` URL.

> [!WARNING]
> Render's free tier resets the `data.json` file every time the server restarts. For permanent storage, consider using a database like MongoDB.
