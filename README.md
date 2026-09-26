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

## Gemini advisor setup

Create a local `.env` file using `.env.example` as a guide. Keep existing values
if you already have one, then set:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3-flash-preview
```

Restart Flask after changing these settings. `create_app()` loads this file;
existing environment variables take precedence. The key stays on the server,
is never sent to the browser, and `.env` is ignored by Git. A key can be created
in [Google AI Studio](https://aistudio.google.com/apikey).

The integration uses Google's [generateContent REST API](https://ai.google.dev/api/generate-content)
with system instructions and multi-turn contents. No new Python dependency is
required. `GET /api/advisor/status` reports configuration, not a successful provider
connection. No provider request runs until someone submits a chat question.

Each Gemini request includes the selected synthetic profile and its transcript
and experiences, the catalog, computed recommendations, role/engagement summaries,
up to five role summaries (selected, explicitly mentioned, then saved), up to ten
activity interests, and recent chat. Salary filters apply to the selected role;
other roles use their latest available year and all regions. The entire CSV
collection and unrelated student profiles are not uploaded. No live web search
or external job data is connected. Source IDs identify supplied evidence, not
independent verification of generated claims.

Conversation history lives only in page memory, not cookies, localStorage, or
server storage. At most four exchanges and 6,000 history characters are sent;
prior model replies are clipped to 3,000 characters. Reset chat, switching student
or major, or refreshing clears history. Browser bookmarks/interests persist.
Google receives submitted messages and the context described above.

Missing configuration retains the existing deterministic advisor, clearly labeled.
Provider failures show an error and preserve the question for retry; they do not
silently replace an AI reply with a dataset response. Check the configured model,
key permissions, and quota if the provider rejects requests. No live API call or
test has been run as part of this integration.

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
- **AI advisor:** When configured, Gemini 3.8 Flash answers using the selected
  synthetic student, transcript, activities, computed role statistics, course
  suggestions, saved interests, and recent conversation. Source references are
  shown below replies. Without credentials it stays in labeled dataset-only mode.
- **Saved pathways:** Dataset role bookmarks and activity interests stay in browser
  localStorage. Old illustrative role IDs are not treated as dataset-backed roles.

All career/engagement comparisons use bachelor's alumni in the chosen major.
Role salary summaries default to the latest available job start year, use nominal
base pay, and show the median and 25th/75th percentiles with record counts.
Skill frequencies use all matching role records across years; salary filters do
not change those frequencies. These synthetic figures are not market forecasts.

Chat replies default to roughly 40–100 words, with more detail only when requested.
Exact greetings, thanks, and farewells receive brief local responses without a Gemini
call or career-context construction; these are labeled as advisor messages, not Gemini.
The chat safely renders a small Markdown subset (bold, italics, headings, lists, inline
code, and source references) using DOM text nodes rather than model-provided HTML.
Resume Studio keeps its separate, longer editing instructions and plain-text display.

## Resume Studio

Open **Resume studio** in the sidebar, or visit `/resume`. The sidebar link carries
over the role and major currently selected in Explore pathways. Choose a pathway,
upload a PDF/DOCX/UTF-8 TXT resume (up to 2 MB, PDFs up to five pages), and check the
editable extracted text before selecting **Review with Gemini**. Pasting text also
works. Reviews require 80–16,000 characters and configured Gemini credentials.
Run `python -m pip install -r requirements.txt` after pulling this feature to add
`pypdf` for PDF extraction. Scanned/image-only and encrypted PDFs are not supported;
paste readable text instead. DOCX extraction uses document-body paragraphs and tables;
headers, footers, comments, images, and layout are not analyzed.

Gemini receives the confirmed text plus the selected role's computed CSV evidence.
An optional checkbox includes the current synthetic campus profile for course
suggestions. The profile must match the selected major; it never establishes facts
about the resume owner. The prompt requests specific, truthful bullet rewrites with
resume line references and dataset source citations, and prohibits invented metrics,
qualifications, employers, or experiences. Generated advice still needs human review.

Alumni comparisons use a transparent, deterministic method:

- Cohort: unique Bachelor of Science alumni in the selected major who held the role.
- Detect literal role-skill vocabulary mentions in the resume (case-insensitive,
  except single-letter skill names). No synonym expansion or proficiency is inferred.
- Compare those mentions with each alum's completed-course skill tags. Deduplicate
  courses, exclude F/W/IP, and require positive earned credits. Transfer credits
  contribute no course-mapped skills.
- Rank by shared skill count, break ties by campus ID, and show at most three
  positive-overlap examples with supporting course IDs and career histories.
- Display activities separately; they have no structured skill tags. Empty results
  remain empty. These are synthetic examples, not real alumni contacts, a probability
  of hiring, an ATS score, or evidence that an activity caused an outcome.

Results include editing notes, vocabulary mentions, source records, and matching
alumni examples, with copy/download controls. No live job postings are retrieved.
Uploaded files are processed for text extraction and are not retained by the app.
Only **Review with Gemini** sends the confirmed text and context to Google. Resume
text and reviews are not saved in localStorage, the session cookie, or a database.
Clear workspace removes them from the page; explicit downloads are saved by the user.
The upload/review endpoints return `Cache-Control: no-store`.

## Backend layout

All Python code except `app.py` lives under `python/`:

| File                 | Responsibility                                                  |
| -------------------- | --------------------------------------------------------------- |
| `data_loader.py`     | Cached CSV loading, indexes, shared parsing, and options        |
| `pathways.py`        | Observed major-to-job and job-to-job graph                      |
| `roles.py`           | Role skills, salary summaries, related courses, and transitions |
| `recommendations.py` | Student course coverage and next-course suggestions             |
| `engagement.py`      | Activity counts and example alumni histories                    |
| `advisor.py`         | Gemini orchestration and dataset-only fallback                  |
| `advisor_context.py` | Sourced student/role context and advisor instructions           |
| `gemini.py`          | Server-only Gemini transport, configuration, and safe errors    |
| `api.py`             | Flask JSON routes and input validation                          |
| `auth.py`            | Campus-ID lookup and selected-profile session helpers           |
| `resume_upload.py`   | Bounded PDF/DOCX/TXT text extraction                            |
| `resume_review.py`   | Resume editing context and sourced alumni overlap comparisons   |

Source files remain in `data/`; the full dataset is loaded lazily once per server
process. Restart Flask after replacing CSV files to reload the data.

## API

See [API_README.md](API_README.md) for the complete endpoint reference, including
parameters, response fields, curl examples, errors, and campus-ID session routes.

| Endpoint                                 | Inputs                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                        | None                                                                                                                     |
| `POST /api/resume/extract`               | Multipart `resume` file                                                                                                  |
| `POST /api/resume/review`                | JSON `text`, `major`, `role`, optional `include_profile`                                                                 |
| `GET /api/options`                       | None                                                                                                                     |
| `GET /api/pathways`                      | `major=cs\|is`, optional `family`, `focus` role ID                                                                       |
| `GET /api/roles/<id>`                    | `major`, optional `region`, `year`                                                                                       |
| `GET /api/students`                      | `major`                                                                                                                  |
| `GET /api/students/<id>/recommendations` | `role`, optional `season=Spring\|Summer\|Fall`                                                                           |
| `GET /api/engagement`                    | `major`, `role`, optional `student`                                                                                      |
| `GET /api/advisor/status`                | Provider configuration status (no credential values)                                                                     |
| `POST /api/advisor`                      | JSON: `question`, `major`, `role`, optional `student`, `season`, `history`, `saved_roles`, `interests`, `region`, `year` |

Invalid selections return JSON errors with status 400. The frontend displays
loading/error messages and offers retries. No tests or additional mobile work
are included, per project direction.
