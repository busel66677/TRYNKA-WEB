# TRYNKA regression tests

Run locally with Node.js 22 and Python 3:

```bash
npm install
npx playwright install chromium
npm run test:ui
```

The suite uses the repository's **real** `index.html` and CSS files, but
blocks application JavaScript and populates a **synthetic** game screen.
No test makes authenticated Supabase requests or changes any real game records.

Current scope (3 screen sizes):
- Hand stays in the dedicated card dock.
- Mobile header, toolbar and game table do not overlap or overflow.
- Three-dot menu expands in the document flow.
- Action buttons stay inside the table and remain legible.

Not yet covered: login, two real players, turn timers, network reconnect,
wagers, reveal, svara, bot moves, and server-side data integrity. Those need
an isolated staging environment and test user accounts.

Tests run on every pull request into `main`. The GitHub Pages production
site is not changed by this test-only branch until the pull request is
approved and merged.
