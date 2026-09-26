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

## Where to build

- `app.py`: Flask application factory, page routes, and API endpoints.
- `python/`: all other project Python code, including data loaders, services, and tests.
- `AGENTS.md`: project conventions and dataset guidance.
- `templates/base.html`: shared page layout.
- `templates/index.html`: home page.
- `static/css/style.css`: styles.
- `static/js/main.js`: browser JavaScript and API calls.
- `requirements.txt`: Python dependencies.
- `.env.example`: example local configuration; `.env` is ignored by Git.

No Node.js or frontend build step is needed. Flask reloads Python changes in
debug mode; refresh the browser after editing HTML, CSS, or JavaScript.

## Quick backend check

With the environment activated:

```bash
python -c "from app import create_app; c = create_app().test_client(); assert c.get('/').status_code == 200; assert c.get('/api/health').json['status'] == 'ok'; print('Flask checks passed')"
```

## Frontend demo

- **Explore pathways:** Switch between Computer Science and Information Systems, filter career branches, and select roles to see example skills and salary ranges.
- **My engagement:** Explore three example activities and save your interests.
- **AI advisor:** Try a clearly labeled, scripted conversation about roles, skills, and experiences.
- **Saved pathways:** Bookmark roles and return to them later. Saved roles and activity interests are stored locally in your browser; chat is kept only for the current page session.

The interface supports mobile layouts, keyboard navigation, reduced motion, and a horizontally scrollable pathway map. Google Fonts supplies DM Sans and Manrope when available, with local sans-serif fallbacks. Icons are inline SVG; no icon service or frontend build is required.

## Connecting real features later

`static/js/main.js` contains hand-authored presentation fixtures in `roles`, `pathways`, and `activities`. The demo does **not** load or analyze the track CSVs. Salary ranges and graph edges are illustrative, not calculated outcomes. Replace these fixtures with Flask API responses when integrating the dataset. Replace `replyTo()` with a backend advisor request when implementing live AI, keeping credentials on the server.

The [track dataset](https://github.com/jasonpaluck/hackumbc-2026) is synthetic; any eventual analysis should retain that distinction. Advisor responses should identify the records supporting their claims.
