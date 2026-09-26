# Project conventions

- This is Career Graph, a Flask app for hackUMBC 2026's DoIT track.
- The exact product features have not been finalized. The data uses below are
  candidate directions, not approved feature requirements.
- **All project Python files except the root `app.py` must live under `python/`.**
  This includes services, data loaders, analysis scripts, utilities, and tests
  (`python/tests/`). Package `__init__.py` files also belong under `python/`.
  Installed dependencies in `.venv/` are outside this source-code convention.
- Keep `app.py` focused on Flask setup and routing; import other logic from
  `python/`. Run package scripts from the repository root with
  `python -m python.module_name`.
- HTML belongs in `templates/`, CSS in `static/css/`, and browser JavaScript in
  `static/js/`. Python dependencies belong in `requirements.txt`.
- Preserve downloaded source data in `data/`, including its documentation and
  `sample/` directory. Put generated data in a separate, clearly named location.
- Read `data/README.md` and the relevant dataset's `.md` before implementing
  data transformations. Resolve data paths relative to the project location,
  rather than assuming a particular shell working directory.

# Data relevant to the project

The following counts were verified against the downloaded CSVs on 2026-09-26.

| Dataset | Rows | Useful fields and potential use |
| --- | ---: | --- |
| `students_current.csv` | 1,800 | `campus_id`, `major`, `track`, `class_level`, credits, GPA, work hours, and expected graduation: starting profile and planning constraints. |
| `transcripts.csv` | 140,458 | `campus_id`, `course_id`, `term`, `grade`, earned credits, and repeat flag: completed/in-progress coursework and course-derived skill coverage. |
| `course_catalog.csv` | 72 | `course_id`, `skill_tags`, `prerequisite_ids`, `required_for_majors`, credits, difficulty, and offering seasons: course/skill graph and prerequisite-aware course suggestions. |
| `employment_history.csv` | 6,028 | `campus_id`, `job_family`, title, seniority, `role_skill_tags`, dates, salary, region, and change type: target-role skills, career transitions, and outcome comparisons. |
| `alumni.csv` | 3,200 | `campus_id`, major, track, degree, graduation cohort, first destination, first-job details, and experience counts: comparable alumni pathways and graduate outcomes. |
| `student_experience.csv` | 20,059 | `campus_id`, experience type/name, organization, term, duration, role, and outcome: internships, certifications, research, and extracurricular context. |

## Candidate implementation priorities

1. Build student → completed courses → skills → target job-family connections
   using current students, transcripts, the catalog, and employment history.
   The catalog contains 119 distinct skills; jobs use 88, all present in the
   catalog. Compare pipe-split tags directly without inventing a mapping.
   Treat course coverage as evidence of exposure, not proof of skill mastery.
2. Suggest courses that cover missing target-role skills while respecting
   prerequisites, completed/in-progress courses, and typical offering seasons.
   Describe any match score as skill coverage, not hiring probability.
3. Add alumni pathway examples and experience context using alumni and
   student experiences. Order career transitions by job `start_date` within
   each person; compare relevant majors, degrees, cohorts, and seniority.
4. Consider salary, location, time-to-first-job, and experience summaries as
   supporting context. Show cohort sizes and avoid presenting associations as
   causal effects or individual outcome guarantees.

## Joins and data handling

- `campus_id` is the person key. Current students and alumni are disjoint;
  never join them as if they represented the same people. Transcripts and
  experiences cover both groups; employment records cover alumni only.
- `course_id` joins transcripts to the catalog. Prerequisites refer back to
  catalog courses. Verified no missing person/course references in either the
  full dataset or the sample dataset.
- Do not directly join all one-to-many tables and then aggregate: that would
  multiply transcript, job, and experience rows. Aggregate independently or
  maintain separate graph edges before combining person-level results.
- Lists are pipe-delimited. Prerequisite groups may contain alternatives:
  `MATH151 or MATH155` satisfies the requirement with either course. Preserve
  the distinction between alternatives and multiple required groups.
- `Not Applicable` is a literal sentinel, not zero. Parse it before numeric or
  boolean conversion. Pure boolean fields use `TRUE`/`FALSE`; fields with the
  sentinel need explicit handling. Blank employment `end_date` means current.
- There are 414 current students without a GPA. Do not give them a zero GPA.
- Transcript rows are attempts. Deduplicate courses for skill coverage, and
  keep in-progress (`IP`), withdrawn (`W`), failed (`F`), and earned-credit
  courses distinct. Do not assume every credit-earning grade satisfies an
  institutional prerequisite; required minimum grades are not supplied.
- GPA is credit-weighted and excludes `W` and `IP`; repeats remain separate
  attempts under the supplied dataset definition. Transfer credits are
  included in person-level totals but lack transcript course mappings.
- Sort terms by year and season (`Spring`, `Summer`, `Fall`), not alphabetically.
  Use the dataset snapshot date, **2026-09-15**, for current-job tenure.
- Only 2,147 alumni have employment rows. The 480 `No Response` outcomes are
  unknown, not unemployed. Declare the denominator for any placement rate.
- Salaries are nominal dollars of the job's start year. Separate cohorts or
  explicitly adjust before comparing years. Cost-of-living normalization is
  `salary * 100 / cost_of_living_index`; it does not adjust for inflation.
- Alumni include 3,018 bachelor's and 182 master's graduates; do not silently
  combine degree levels in comparisons with current undergraduates.
- Coverage is Computer Science and Information Systems, with eight job
  families. Employers are fictitious, and course difficulty is a dataset
  measure, not an official UMBC rating. These are not live job postings.
- Experiences have no structured skill tags, so any experience-to-skill
  mapping would need an explicit, separately documented method.
- The catalog does not supply full degree-audit rules, guaranteed future
  sections, timetable conflicts, or seat availability. Course suggestions
  should not claim to be a verified graduation plan.

## Development priorities

- Focus on the desktop experience. Do not spend time on mobile layouts,
  mobile optimization, or mobile validation unless the user asks for it.
- Do not write or run tests unless the user explicitly asks for them.
  Prioritize implementing requested features; testing is not a completion
  requirement for this project.

- `data/sample/` is a referentially complete smaller dataset with the same
  schema: 180 students, 320 alumni, 14,057 transcript attempts, 552 jobs,
  1,963 experiences, and all 72 courses. Use either sample or full files
  consistently; do not concatenate samples into the full data.
- Start development against the sample where useful; use the full dataset
  for user-facing aggregate results unless clearly labeled as sample data.
- Keep Flask startup instructions in `README.md` current.
