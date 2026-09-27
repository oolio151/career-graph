# career-graph

for hackumbc 2026

A responsive career-exploration frontend for the HackUMBC 2026 DoIT track, built with Flask, Jinja, and plain CSS/JavaScript.

## Local setup

Python 3.10+ is required. From the project directory on Linux, macOS, or WSL:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m flask --app app:create_app run --debug
```

Open http://127.0.0.1:5000. The health endpoint is available at `/api/health`.
Stop the server with Ctrl+C. Debug mode is for local development only.

On Windows PowerShell, create and activate the environment with:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m flask --app app:create_app run --debug
```

## Resume advisor (Gemini)

The resume chat is connected to the Google Gemini API. The key is read from the server
environment and never sent to the browser. To enable it:

```bash
cp .env.example .env
# then put your key in .env
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

Restart the server. The chat header shows which engine answered, so a demo is never
ambiguous about whether a reply came from a model or from the local rules.

**Grounding.** The model never sees a free-form question on its own. `CareerData.resume_context()`
builds a facts block from `students_current.csv`, `alumni.csv`, and `employment_history.csv` —
the student's record and course skills, the alumni cohort size, first-job shares, the skills
those first jobs asked for, and which of them the student's passed courses do *not* cover —
and keeps it available as optional background. The advisor uses personal details and statistics
only when relevant to the question, and can discuss general career topics such as hackathons
without reciting the student's record. Specific dataset claims must use the supplied evidence;
resume rewrites must preserve supported experience. Synthetic-data reminders accompany dataset
claims rather than every conversation turn.

**Conversation memory.** Resume chat includes up to eight previous successful Gemini
exchanges, capped at 12,000 characters, alongside the latest profile and resume context.
History is stored server-side with the session's uploaded files and survives page refreshes.
Replacing the resume or clearing the student session deletes that history.

**Fallback.** If `GEMINI_API_KEY` is unset, or the API is unreachable, rate-limited, or returns
nothing usable, `coach_resume` falls back to the deterministic on-device rules and sets a `note`
field explaining why. The demo degrades instead of breaking. Responses carry `source`
(`gemini` or `local`), `model`, and `grounded_in` so the UI can label the source honestly.

Gemini is called over `urllib` from the standard library in `gemini.py`, so the project keeps
its two dependencies. Set `GEMINI_MODEL` to override the default `gemini-2.5-flash` model.

## Where to build

- `app.py`: Flask application factory, page routes, and API endpoints.
- `career_data.py`: dataset-backed student profiles, alumni comparisons, and the resume facts block.
- `gemini.py`: standard-library Gemini client.
- `templates/base.html`: shared page layout.
- `templates/index.html`: home page.
- `static/css/style.css`: styles.
- `static/js/main.js`: browser JavaScript and API calls.
- `requirements.txt`: Python dependencies.
- `.env.example`: example local configuration; `.env` is ignored by Git.

No Node.js or frontend build step is needed. Flask reloads Python changes in
debug mode; refresh the browser after editing HTML, CSS, or JavaScript.

## Frontend demo

- **Discover:** Where alumni in your major went, filtered by track, GPA, and internship count. Calculated from the CSVs.
- **Resume:** Your uploaded file beside a chat that answers from your courses and alumni first jobs, via Gemini. Read and edit the file in the browser.
- **Explore pathways:** Switch between Computer Science and Information Systems, filter career branches, and select roles to see example skills and salary ranges. *Fixtures, not the dataset — see below.*
- **My engagement:** Explore three example activities and save your interests. *Fixtures.*
- **Advisor:** Try a clearly labeled, scripted conversation about roles, skills, and experiences. *Fixtures.*
- **Saved pathways:** Bookmark roles and return to them later. Saved roles and activity interests are stored locally in your browser; chat is kept only for the current page session.

The interface supports mobile layouts, keyboard navigation, reduced motion, and a horizontally scrollable pathway map. Google Fonts supplies DM Sans and Manrope when available, with local sans-serif fallbacks. Icons are inline SVG; no icon service or frontend build is required.

## What is still a fixture

`static/js/main.js` still contains hand-authored presentation fixtures in `roles`, `pathways`,
and `activities`, used by the Explore, Activities, Advisor, and Saved views. Those views do **not**
load or analyze the track CSVs, and their salary ranges and graph edges are illustrative rather
than calculated outcomes. The Discover and Resume views are the dataset-backed ones. The About
dialog in the app says the same thing.

The [track dataset](https://github.com/jasonpaluck/hackumbc-2026) is synthetic; any analysis must
keep saying so. Advisor responses identify the records supporting their claims, and the model is
instructed to say when the data does not answer a question rather than filling the gap.
