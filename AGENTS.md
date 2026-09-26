# Career Graph conventions

- All project Python code except root `app.py` belongs under `python/`.
- Keep the existing frontend design. Connect features to their corresponding
  Explore pathways, My engagement, AI advisor, and Saved pathways views.
- Do not write or run tests unless the user explicitly requests them.
- Do not spend time on mobile development or mobile validation unless requested.
- Keep downloaded CSVs and their documentation in `data/` unchanged. Read the
  accompanying data documentation before changing calculations.
- The dataset is synthetic. Use observed counts and explicit cohort definitions;
  do not describe skill overlap or activity associations as hiring probability.
- Course skill tags and job skill tags share a vocabulary. Activities have no
  structured skill tags; show alumni associations separately.
- Exclude withdrawals and in-progress courses from completed course coverage.
  Deduplicate repeated courses; transferred credits have no course mappings.
- Handle `Not Applicable` as missing, not zero. Preserve prerequisite alternatives
  (`MATH151 or MATH155`) and use the 2026-09-15 dataset snapshot where relevant.
- The current advisor uses computed dataset summaries, not a live AI model.
  Do not imply that generative AI is connected or expose server credentials.
