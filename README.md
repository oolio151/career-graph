# career-graph
for hackumbc 2026

Flask starter for the DoIT track, with Jinja HTML templates and plain CSS/JavaScript.

## Local setup

Python 3.10+ is required. From the project directory on Linux, macOS, or WSL:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m flask --app app:create_app run --debug
```

Open http://127.0.0.1:5000. Click **Check backend connection** to try the JSON API.
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
