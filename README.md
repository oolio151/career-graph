# Career Graph

A Flask career-exploration app for hackUMBC 2026's DoIT track. The existing
Jinja/CSS/JavaScript frontend now reads the supplied synthetic CSV dataset.

## Run locally

From the project directory in Linux, macOS, or WSL:

```bash
# Only needed when creating a new environment:
python3 -m venv .venv

source .venv/bin/activate
python -m pip install -r requirements.txt
python -m flask --app app:create_app run --debug
```

Open http://127.0.0.1:5000 for the campus-ID entry page. Enter a current student
ID such as `CID-116490` to open that student's workspace, or `-1` to explore
the demo. Stop with Ctrl+C. Debug mode is for local development.
activate it with `.\.venv\Scripts\Activate.ps1` before running the last two commands.
No Node.js, database, or frontend build step is needed.

## Campus-ID entry

`/` and `/login` accept IDs from `students_current.csv`. Valid IDs create a
signed session and redirect to `/workspace`, with the student's major and
profile selected. Unknown IDs show an error. `/workspace` redirects to login
when no profile is selected. Use **Change profile** to clear the session.
`/demo` remains public and allows browsing different majors and students.

This selects a synthetic dataset profile; it is not real UMBC authentication.
The dataset APIs remain public for the hackathon demo. Set `SECRET_KEY` in
the environment or local `.env` to keep sessions across server restarts and
worker processes; otherwise a temporary key is generated on startup.

## Connected screens

- **Explore pathways:** Select a major and job family to see observed first jobs
  and consecutive career transitions. The map shows up to three first roles and
  three subsequent roles; the career selector exposes other roles. Edge evidence
  lists unique alumni counts and example IDs. Role details show skill frequencies,
  previous/next roles, and salary summaries with region/start-year filters.
- **Course suggestions:** Select a student profile and planning season to compare
  completed and in-progress coursework against the selected role's skills. Up to
  three suggestions cover additional skills while considering earned prerequisite
  course credit and typical offering seasons. Expand the constraints for blocked
  courses. Confirm actual eligibility, minimum grades, and availability with an advisor.
- **My engagement:** Shows activity participation among unique bachelor's alumni
  in the selected major who held the selected role, plus examples and the student's
  own participation counts. Activities are associations, not skill assessments.
- **AI advisor:** The chat calls Flask and returns calculated answers about the
  selected role, optional student, courses, activities, or salary, with supporting
  dataset IDs. This is a deterministic dataset advisor, not live generative AI;
  it answers each question independently and requires no API key.
- **Saved pathways:** Dataset role bookmarks and activity interests stay in browser
  localStorage. Old illustrative role IDs are not treated as dataset-backed roles.

All career/engagement comparisons use bachelor's alumni in the chosen major.
Role salary summaries default to the latest available job start year, use nominal
base pay, and show the median and 25th/75th percentiles with record counts.
Skill frequencies use all matching role records across years; salary filters do
not change those frequencies. These synthetic figures are not market forecasts.

## Backend layout

All Python code except `app.py` lives under `python/`:

| File | Responsibility |
| --- | --- |
| `data_loader.py` | Cached CSV loading, indexes, shared parsing, and options |
| `pathways.py` | Observed major-to-job and job-to-job graph |
| `roles.py` | Role skills, salary summaries, related courses, and transitions |
| `recommendations.py` | Student course coverage and next-course suggestions |
| `engagement.py` | Activity counts and example alumni histories |
| `advisor.py` | Evidence-backed dataset answers |
| `api.py` | Flask JSON routes and input validation |
| `auth.py` | Campus-ID lookup and selected-profile session helpers |

Source files remain in `data/`; the full dataset is loaded lazily once per server
process. Restart Flask after replacing CSV files to reload the data.

## API

See [API_README.md](API_README.md) for the complete endpoint reference, including
parameters, response fields, curl examples, errors, and campus-ID session routes.

| Endpoint | Inputs |
| --- | --- |
| `GET /api/health` | None |
| `GET /api/options` | None |
| `GET /api/pathways` | `major=cs\|is`, optional `family`, `focus` role ID |
| `GET /api/roles/<id>` | `major`, optional `region`, `year` |
| `GET /api/students` | `major` |
| `GET /api/students/<id>/recommendations` | `role`, optional `season=Spring\|Summer\|Fall` |
| `GET /api/engagement` | `major`, `role`, optional `student` |
| `POST /api/advisor` | JSON: `question`, `major`, `role`, optional `student`, `season` |

Invalid selections return JSON errors with status 400. The frontend displays
loading/error messages and offers retries. No tests or additional mobile work
are included, per project direction.
