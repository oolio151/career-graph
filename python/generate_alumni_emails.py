#!/usr/bin/env python3
"""
generate_alumni_emails.py

Builds a synthetic work-email address for each alumnus, based on:
  - their name (from alumni_with_names.csv, produced by generate_names.py)
  - their CURRENT employer (is_current == TRUE row in employment_history.csv)

Email format:  first.last@{employer-slug}.com
  e.g. "Grace Kim" at "Clearfield Assurance" -> grace.kim@clearfieldassurance.com

Alumni with no current job on file (i.e. no row in employment_history.csv,
or all their spells have ended with none marked is_current == TRUE) get
email = "Not Applicable", matching this dataset's existing convention for
missing values.

Usage:
    python generate_alumni_emails.py \
        --alumni /path/to/alumni_with_names.csv \
        --employment /path/to/employment_history.csv \
        --out /path/to/alumni_emails.csv

If alumni_with_names.csv doesn't exist yet, run generate_names.py first.

Output columns:
    campus_id, full_name, current_employer, email
"""

import argparse
import csv
import re
from pathlib import Path


def slugify_employer(employer: str) -> str:
    """Turn an employer name into a bare domain-friendly slug.
    'Clearfield Assurance'      -> 'clearfieldassurance'
    'Tidal Power Cooperative'   -> 'tidalpowercooperative'
    """
    slug = employer.lower()
    slug = re.sub(r"[^a-z0-9]+", "", slug)  # strip spaces, punctuation, &, etc.
    return slug or "company"


def load_current_employers(employment_path: Path) -> dict[str, str]:
    """Map campus_id -> current employer name, from the row(s) where
    is_current == TRUE. Each person has at most one current spell per
    the data's own invariant (end_date blank iff is_current TRUE)."""
    current_employer = {}
    with employment_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("is_current", "").strip().upper() == "TRUE":
                current_employer[row["campus_id"]] = row["employer"]
    return current_employer


def build_email(full_name: str, employer: str) -> str:
    parts = full_name.strip().split()
    first = parts[0].lower()
    last = parts[-1].lower() if len(parts) > 1 else "x"
    domain = slugify_employer(employer)
    return f"{first}.{last}@{domain}.com"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--alumni", required=True, type=Path,
                     help="alumni_with_names.csv (must have campus_id, full_name)")
    ap.add_argument("--employment", required=True, type=Path,
                     help="employment_history.csv")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    current_employer = load_current_employers(args.employment)

    out_rows = []
    with args.alumni.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if "full_name" not in (reader.fieldnames or []):
            raise ValueError(
                "alumni file has no full_name column — run generate_names.py first"
            )
        for row in reader:
            campus_id = row["campus_id"]
            full_name = row["full_name"]
            employer = current_employer.get(campus_id)

            if employer:
                email = build_email(full_name, employer)
            else:
                employer = "Not Applicable"
                email = "Not Applicable"

            out_rows.append({
                "campus_id": campus_id,
                "full_name": full_name,
                "current_employer": employer,
                "email": email,
            })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["campus_id", "full_name", "current_employer", "email"]
        )
        writer.writeheader()
        writer.writerows(out_rows)

    n_with_email = sum(1 for r in out_rows if r["email"] != "Not Applicable")
    print(f"Wrote {len(out_rows)} rows -> {args.out}")
    print(f"  {n_with_email} alumni have a current-employer email; "
          f"{len(out_rows) - n_with_email} are 'Not Applicable' (no current job on file).")


if __name__ == "__main__":
    main()
