# Career Graph API

Reference for the current Flask backend. Local base URL:
`http://127.0.0.1:5000`. Examples below are commands you can run; they have not
been executed as tests.

## Conventions

- `/api/*` endpoints return JSON on success and do not require login. The
  campus-ID session selects a dashboard profile; it does not restrict API access.
- GET parameters go in the query string. `/api/advisor` accepts a JSON object
  with `Content-Type: application/json`.
- Major IDs: `cs` = Computer Science, `is` = Information Systems. Endpoints
  accepting `major` default to `cs` when it is omitted.
- Role IDs are lowercase, hyphenated job titles, such as `software-engineer-i`.
  Obtain available IDs from `/api/options`; use IDs rather than display titles.
- Student IDs use `CID-` followed by six digits and must exist in the current
  student dataset. API IDs are case-sensitive.
- Season names are `Spring`, `Summer`, and `Fall`, with `Spring` as the default.
- Records are synthetic, with snapshot date `2026-09-15`. Career cohorts use
  bachelor's alumni in the selected major. Activity associations and course
  coverage are not predictions of hiring or skill mastery.
- Student objects preserve CSV strings, including numeric/boolean-looking
  values. The literal `Not Applicable` becomes JSON `null`. Calculated counts,
  percentages, salary values, and course credits are JSON numbers.
- Data loads once per server process. Restart after replacing CSVs.

## Endpoint overview

| Method | Path | Used by |
| --- | --- | --- |
| GET | `/api/health` | Server availability |
| GET | `/api/options` | Dropdowns and initial configuration |
| GET | `/api/pathways` | Explore pathways graph |
| GET | `/api/roles/<role_id>` | Role details and salary filters |
| GET | `/api/students` | Student selector |
| GET | `/api/students/<student_id>/recommendations` | Personalized course panel |
| GET | `/api/engagement` | My engagement and activity previews |
| POST | `/api/advisor` | Advisor chat |

## GET /api/health

No parameters. Returns `200` without checking or loading the CSV dataset:

```json
{"status": "ok", "app": "career-graph"}
```

```bash
curl 'http://127.0.0.1:5000/api/health'
```

## GET /api/options

No parameters. Returns the supported selections:

| Field | Contents |
| --- | --- |
| `majors` | Objects with `id` and `name` |
| `roles` | Objects with `id`, `title`, `family`, and supported `majors` |
| `families` | Job-family display names |
| `regions` | Region display names |
| `years` | Job start years, newest first |
| `activity_types` | Objects with `id` and `name` |
| `snapshot` | `2026-09-15` |
| `synthetic` | `true` |
| `advisor_mode` | `dataset` |

```bash
curl 'http://127.0.0.1:5000/api/options'
```

## GET /api/pathways

| Query parameter | Required | Default / meaning |
| --- | --- | --- |
| `major` | No | `cs` |
| `family` | No | `all`; otherwise an exact family name from options |
| `focus` | No | Role ID to prioritize in the small graph when supported |

```bash
curl --get 'http://127.0.0.1:5000/api/pathways' \
  --data-urlencode 'major=cs' \
  --data-urlencode 'family=Software Engineering' \
  --data-urlencode 'focus=software-engineer-i'
```

Response fields:

- `major`, `family`: selected filters.
- `nodes`: up to six role objects, each with `id`, `title`, `family`, `majors`,
  `column`, `row`, and `count`. Column `0` contains up to three first jobs;
  column `1` contains up to three observed later roles. Rows are zero-based.
- `edges`: objects with `source`, `target`, `count`, `kind`, and `examples`.
  `source` is `degree` or a role ID. `kind` is `first_job` or `transition`.
  `examples` contains up to three campus IDs supporting that connection.
- `available_roles`, `role_count`: all matching role IDs and their count,
  including roles outside the six-node map.
- `cohort_count`: all bachelor's alumni in the major, including those without
  employment records. `employed_count`: those with recorded job histories.
  These two counts are not narrowed by the family filter.
- `note`: explanation of the connection semantics.

Edges count unique alumni. Transitions come from consecutive jobs, excluding
same-title transitions. A family filter requires both jobs to belong to that
family. `focus` is a preference, not a guarantee that a role can appear in the
small connected graph. Empty cohorts/connections return `200` with empty arrays.

## GET /api/roles/<role_id>

| Query parameter | Required | Default / meaning |
| --- | --- | --- |
| `major` | No | `cs` |
| `region` | No | All regions; empty string also means all regions |
| `year` | No | Latest available start year after filtering role, major, and region |

```bash
curl --get 'http://127.0.0.1:5000/api/roles/software-engineer-i' \
  --data-urlencode 'major=cs' \
  --data-urlencode 'year=2026'
```

Returns the role identity (`id`, `title`, `family`, `majors`) plus:

| Field | Contents |
| --- | --- |
| `major` | Selected major |
| `record_count`, `alumni_count` | Matching job records and unique alumni |
| `skills` | `{name, count, percent}` per skill, sorted by frequency |
| `salary` | `{count, year, region, median, p25, p75, available_years, note}` |
| `previous_roles`, `next_roles` | Up to five role objects per list, with unique-alumni `count` |
| `courses` | Catalog matches: `{id, title, skills}` |
| `source` | `{file, record_ids, count}` for matching employment records |

Only the **salary** section uses `region` and `year`. Skills, counts, courses,
transitions, and `source` cover matching roles/major across all years and regions.
Salary values are nominal annual base pay for the selected start year;
`p25` and `p75` describe the middle 50%. An empty salary subset returns
`count: 0` and `null` for median/percentiles, not an error. A globally known
role with no records in the selected major also returns an empty `200` result.

## GET /api/students

Optional `major` query parameter, default `cs`.

```bash
curl 'http://127.0.0.1:5000/api/students?major=cs'
```

Returns `{"students": [...]}` containing all current students for the major,
without pagination. Each object contains the fields from
[students_current.md](data/students_current.md), including `campus_id`, `major`,
`track`, `class_level`, `credits_earned`, `cumulative_gpa`, and
`expected_graduation_term`. Missing GPA is `null`, not zero.

## GET /api/students/<student_id>/recommendations

| Query parameter | Required | Default / meaning |
| --- | --- | --- |
| `role` | Yes | Target role ID |
| `season` | No | `Spring` |

The student's major determines the alumni cohort; there is no `major` parameter.

```bash
curl --get 'http://127.0.0.1:5000/api/students/CID-116490/recommendations' \
  --data-urlencode 'role=software-engineer-i' \
  --data-urlencode 'season=Spring'
```

Response fields:

- `student`, `role_id`, `season`: selected profile and target.
- `coverage`: `{covered, total, percent}` for distinct role skills covered by
  completed coursework. `percent` is `null` if there are no target skills.
- `covered_skills`, `in_progress_skills`, `missing_skills`: disjoint skill lists.
- `courses`: relevant completed/in-progress courses.
- `suggestions`: up to three courses adding uncovered skills, ranked by skill
  frequency while accounting for prior suggestions, prerequisites, and season.
- `blocked_courses`: up to six courses with prerequisite or season constraints.
- `note`: limitations on course eligibility and interpretation.

Course objects contain `id`, `title`, `credits`, `skills`, `new_skills`, `status`,
`prerequisites`, `missing_prerequisites`, `seasons`, and `difficulty`.
`status` is `completed`, `in_progress`, or `not_taken`.
`prerequisites` is an array of alternative groups: each group must be satisfied
by at least one course, e.g. `[["MATH151", "MATH155"]]`.
Suggested courses additionally contain `additional_skills`: skills they add
beyond earlier suggestions. `new_skills` excludes completed/in-progress coverage.

Completion requires earned course credit; repeated courses count once.
Recommendations do not verify minimum prerequisite grades, transfer equivalencies,
full degree requirements, or available seats. An empty suggestion list is valid.

## GET /api/engagement

| Query parameter | Required | Default / meaning |
| --- | --- | --- |
| `major` | No | `cs` |
| `role` | Yes | Target role ID |
| `student` | No | Current student ID; must match the selected major |

```bash
curl --get 'http://127.0.0.1:5000/api/engagement' \
  --data-urlencode 'major=cs' \
  --data-urlencode 'role=software-engineer-i' \
  --data-urlencode 'student=CID-116490'
```

Returns `role_id`, `major`, `cohort_count`, `activities`, `examples`, and `note`.

Each activity contains:

- `id`, `name`: activity type.
- `count`, `percent`: unique participating alumni and their share of the cohort.
- `student_count`: matching experience rows for the supplied student; `0` if no
  student is supplied. Unlike alumni counts, this can include repeated activities.
- `examples`: up to three `{name, count}` examples, counted once per alum/name.
- `record_ids`: up to five supporting experience IDs.

Top-level `examples` contains up to three alumni with `campus_id`, `track`,
`year`, `activities`, and chronological `jobs` (`title`, `role_id`, `start`).
When no alumni match, activity counts are zero and percentages are `null`.
No activity-to-skill mapping is inferred.

## POST /api/advisor

| JSON field | Required | Default / meaning |
| --- | --- | --- |
| `question` | Yes | Nonblank string, at most 500 characters after trimming |
| `major` | No | `cs` |
| `role` | Normally | Selected role ID; an exact role title mentioned in the question overrides it |
| `student` | No | Current student ID matching `major`; omit or use `""` for none |
| `season` | No | `Spring`, used for personalized course suggestions |

All supplied fields listed above must be strings, not `null`.

```bash
curl 'http://127.0.0.1:5000/api/advisor' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What courses should I consider?","major":"cs","role":"software-engineer-i","student":"CID-116490","season":"Spring"}'
```

Response:

| Field | Contents |
| --- | --- |
| `answer` | Human-readable text calculated from dataset results |
| `mode` | `dataset` |
| `role_id` | Resolved role ID; omitted in the no-matching-records response |
| `sources` | Objects with `file`, `record_ids`, and `count` |

Source IDs are examples, not an exhaustive list. Employment source counts are
job rows; activity source counts are participating alumni; transcript references
use a campus ID and count that student's attempts.

The advisor is deterministic, with no external model or conversation memory.
Salary-related keywords select salary summaries; activity keywords select alumni
activity summaries. Otherwise, a supplied student produces course recommendations,
and no student produces a general skill/course overview. It does not calculate
ROI or answer arbitrary questions. It uses the latest available salary year and
all regions; salary-panel filters are not accepted by this endpoint.

## Errors and status codes

| Status | Meaning |
| --- | --- |
| `200` | Successful JSON result, including valid selections with no matching data |
| `400` | API validation failure, returned as `{"error": "message"}` |
| `404` | Unknown URL; Flask's default HTML response |
| `405` | Unsupported method; Flask's default HTML response |
| `413` | Request body exceeds 32 KiB; Flask's default HTML response |

Examples of validation errors:

```json
{"error": "Choose a valid student profile."}
```

```json
{"error": "The student profile must match the selected major."}
```

Malformed/missing advisor JSON returns `400` with `Send a JSON object.`
Unknown role IDs return `400`, not `404`. Do not assume every error response
is JSON; framework errors are not wrapped by the API's validation handler.

## Login and page routes

These routes return HTML or redirects, rather than API JSON.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` or `/login` | Campus-ID form |
| POST | `/` or `/login` | Form-encoded `campus_id`; valid current ID selects a session profile and redirects `303` to `/workspace` |
| POST | `/` or `/login` with `campus_id=-1` | Clears session and redirects `303` to `/demo` |
| GET | `/workspace` | Selected student's dashboard; redirects `302` to login without a profile |
| GET | `/demo` | Public dashboard with no preselected student |
| POST | `/logout` | Clears session and redirects `303` to login |

Login trims whitespace and uppercases campus IDs. Invalid or unknown IDs return
an HTML form with status `400`. Use cookies to retain a selected profile:

```bash
curl -c /tmp/career-graph-cookies.txt \
  -d 'campus_id=CID-116490' 'http://127.0.0.1:5000/login'
curl -b /tmp/career-graph-cookies.txt 'http://127.0.0.1:5000/workspace'
```

Set a stable `SECRET_KEY` to retain signed sessions across restarts/workers.
Without one, a temporary key is generated at startup. This is synthetic profile
selection, not real campus authentication. API calls do not infer `student` or
`major` from the session; callers must send their selected context explicitly.
Saved roles and activity interests use browser localStorage and have no API
write endpoints.
