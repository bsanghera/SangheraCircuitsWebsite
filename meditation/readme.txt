Meditation Journal – sangheracircuits.com/meditation

This repo powers my meditation journal site published at https://sangheracircuits.com/meditation
.

The public site is read-only: visitors can view stats, key findings, and session notes.

I log in through a custom admin interface that authenticates with GitHub via a Cloudflare Worker.

All data is stored as simple JSON files in this repo (no database needed).

📖 Overview

Public Page (/meditation/index.html)
Displays overall metrics, key findings, and the list of meditation sessions.

Admin Page (/meditation/admin/)
Custom form interface for me to add/edit sessions and takeaways.

Storage
Meditation entries and key findings are stored as JSON files under /meditation/data/.
GitHub is the “database”: edits are pushed as commits.

Authentication
Login is handled through GitHub OAuth via a Cloudflare Worker.
Only whitelisted GitHub users (via ALLOWED_USERS env var) can make changes.
Unauthorized visitors cannot add/edit/delete anything.

🔑 Login Flow

Go to /meditation/admin/.

Click Login with GitHub.

Cloudflare Worker redirects to GitHub OAuth and exchanges code for a token.

Worker checks if the GitHub user is allowed.

If yes, token is passed back → admin UI lets me add/edit entries.

Submitting a new entry commits a JSON file to this repo through GitHub’s API.

📂 File Structure
meditation/
│
├── index.html         # Public-facing meditation journal
├── app.js             # Fetches JSON data, renders stats + entries
├── styles.css         # Styles for public page
│
├── admin/
│   ├── index.html     # Custom admin page with login + form
│   ├── app.js         # Logic for login, saving entries via GitHub API
│   └── styles.css     # Styling for admin UI
│
├── data/
│   ├── takeaways.json # Key findings list
│   └── entries/
│       ├── index.json # Index of all entry filenames
│       ├── 2025-10-02.json
│       ├── 2025-10-03.json
│       └── ...
│
└── uploads/           # (optional) for media/images

✍️ Editing Flow

Add a session:

Log into /meditation/admin/

Fill out date, duration, notes

Save → admin posts to GitHub API → new JSON file created in /data/entries/

/data/entries/index.json is updated so the public site can list all entries

Edit key findings:

Log into admin

Update takeaways.json

Save → commits new version

☁️ Cloudflare Worker

The worker (/auth, /callback) handles GitHub OAuth.

Exchanges code → access_token securely

Verifies that the GitHub username is in ALLOWED_USERS

Sends the token back to the admin UI

Admin UI uses the token to call the GitHub API (create/update files)

Environment variables

GITHUB_CLIENT_ID

GITHUB_CLIENT_SECRET

ALLOWED_ORIGIN (site origin, e.g. https://sangheracircuits.com)

ALLOWED_USERS (comma-separated GitHub usernames allowed to log in)

🔒 Security

Only users on the allow-list can log in and edit

All edits go through GitHub API with real authentication

Public cannot bypass and post fake data because the worker checks OAuth + username

Data is version-controlled in GitHub
