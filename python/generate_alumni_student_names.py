#!/usr/bin/env python3
"""
generate_alumni_student_names.py

Adds synthetic identity fields directly onto the existing files — no
separate name or email files are created.

  alumni.csv            -> gets first_name, last_name, full_name, email
  students_current.csv  -> gets first_name, last_name, full_name

All new columns are inserted right after campus_id. Everything else in
each row is left untouched and in its original order.

Names are fictitious and deterministic (seeded from campus_id), so
re-running the script gives the same person the same name every time.

`email` (alumni.csv only) is derived from the person's name and their
CURRENT employer (is_current == TRUE row in employment_history.csv):
    first.last@{employer-slug}.com
Alumni with no current job on file (unemployed, still in school, etc.)
get a personal-style address instead: first.last@gmail.com.

Usage:
    python generate_alumni_student_names.py \
        --alumni alumni.csv \
        --students students_current.csv \
        --employment employment_history.csv \
        --outdir out/

Outputs (same filenames, in --outdir):
    alumni.csv
    students_current.csv
"""

import argparse
import csv
import hashlib
import random
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Name pools (fictitious, deliberately generic / diverse)
# ---------------------------------------------------------------------------

FIRST_NAMES = [
    "Aaliyah", "Aiden", "Alina", "Amir", "Anaya", "Andre", "Anika", "Ansel",
    "Ava", "Beatriz", "Benjamin", "Bianca", "Caleb", "Camila", "Carter",
    "Chidi", "Chloe", "Daniel", "Daniela", "David", "Deepa", "Diego",
    "Elena", "Eli", "Elijah", "Emma", "Ethan", "Fatima", "Gabriel", "Grace",
    "Hannah", "Hiroshi", "Ibrahim", "Isabella", "Jacob", "Jada", "Jasmine",
    "Jayden", "Jing", "Jordan", "Joseph", "Julia", "Kai", "Kayla", "Keisha",
    "Kevin", "Khalil", "Kiara", "Kwame", "Layla", "Liam", "Lucas", "Luna",
    "Maya", "Mei", "Mia", "Michael", "Miguel", "Mohammed", "Nadia", "Naomi",
    "Nathan", "Nia", "Nicholas", "Nina", "Noah", "Nora", "Olivia", "Omar",
    "Priya", "Rachel", "Rafael", "Rania", "Ravi", "Ryan", "Samir", "Sara",
    "Sebastian", "Simone", "Sofia", "Sophia", "Tariq", "Thomas", "Tobias",
    "Valeria", "Victor", "Wei", "William", "Xiomara", "Yara", "Yusuf",
    "Zara", "Zoe",
]

LAST_NAMES = [
    "Adebayo", "Alvarez", "Anderson", "Baker", "Bell", "Brooks", "Brown",
    "Campbell", "Carter", "Chen", "Clark", "Coleman", "Cooper", "Cruz",
    "Davis", "Diaz", "Edwards", "Ellis", "Evans", "Flores", "Foster",
    "Garcia", "Gomez", "Gonzalez", "Gray", "Green", "Gupta", "Hall",
    "Harris", "Henderson", "Hernandez", "Hill", "Ho", "Huang", "Hughes",
    "Ibrahim", "Jackson", "James", "Jenkins", "Johnson", "Jones", "Kaur",
    "Kelly", "Kim", "King", "Lee", "Lewis", "Liu", "Lopez", "Martin",
    "Martinez", "Mendez", "Mitchell", "Moore", "Morales", "Morgan",
    "Murphy", "Nguyen", "Nwosu", "Ochoa", "Okafor", "Oliveira", "Owens",
    "Park", "Patel", "Perez", "Perry", "Peterson", "Phillips", "Powell",
    "Price", "Ramirez", "Reed", "Reyes", "Richardson", "Rivera", "Roberts",
    "Robinson", "Rodriguez", "Rogers", "Ross", "Sanchez", "Sanders",
    "Scott", "Shah", "Silva", "Simmons", "Singh", "Smith", "Stewart",
    "Sullivan", "Taylor", "Thomas", "Thompson", "Torres", "Tran", "Turner",
    "Walker", "Wang", "Ward", "Watson", "White", "Williams", "Wilson",
    "Wong", "Wood", "Wright", "Yang", "Young", "Zhang", "Zhao",
]


def rng_for_campus_id(campus_id: str) -> random.Random:
    """Deterministic per-person RNG seeded from campus_id, so re-running
    the script (or running it on both files) always yields the same
    name for the same campus_id."""
    digest = hashlib.sha256(campus_id.encode("utf-8")).hexdigest()
    seed = int(digest[:16], 16)
    return random.Random(seed)


def name_for_campus_id(campus_id: str, taken: dict) -> tuple[str, str]:
    r = rng_for_campus_id(campus_id)
    first = r.choice(FIRST_NAMES)
    last = r.choice(LAST_NAMES)

    # Nudge deterministically if this exact name was already used by a
    # different campus_id, so names (and derived emails) stay unique.
    key = (first, last)
    if key in taken and taken[key] != campus_id:
        r2 = rng_for_campus_id(campus_id + "-alt")
        last = r2.choice(LAST_NAMES)
        key = (first, last)
    taken.setdefault(key, campus_id)
    return first, last


def slugify_employer(employer: str) -> str:
    """'Clearfield Assurance' -> 'clearfieldassurance'"""
    slug = employer.lower()
    slug = re.sub(r"[^a-z0-9]+", "", slug)
    return slug or "company"


def load_current_employers(employment_path: Path) -> dict[str, str]:
    """campus_id -> current employer name, from is_current == TRUE rows."""
    current_employer = {}
    with employment_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("is_current", "").strip().upper() == "TRUE":
                current_employer[row["campus_id"]] = row["employer"]
    return current_employer


def build_email(first: str, last: str, employer: str) -> str:
    domain = slugify_employer(employer)
    return f"{first.lower()}.{last.lower()}@{domain}.com"


def add_name_columns(fieldnames: list[str], extra_cols: list[str]) -> list[str]:
    idx = fieldnames.index("campus_id") + 1
    return fieldnames[:idx] + extra_cols + fieldnames[idx:]


def process_students(in_path: Path, out_path: Path) -> None:
    taken_names: dict = {}
    with in_path.open(newline="", encoding="utf-8") as f_in:
        reader = csv.DictReader(f_in)
        fieldnames = reader.fieldnames or []
        new_fieldnames = add_name_columns(
            fieldnames, ["first_name", "last_name", "full_name"]
        )
        rows = []
        for row in reader:
            first, last = name_for_campus_id(row["campus_id"], taken_names)
            row["first_name"] = first
            row["last_name"] = last
            row["full_name"] = f"{first} {last}"
            rows.append(row)

    with out_path.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.DictWriter(f_out, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows -> {out_path}")


def process_alumni(in_path: Path, out_path: Path, employment_path: Path) -> None:
    current_employer = load_current_employers(employment_path)
    taken_names: dict = {}

    with in_path.open(newline="", encoding="utf-8") as f_in:
        reader = csv.DictReader(f_in)
        fieldnames = reader.fieldnames or []
        new_fieldnames = add_name_columns(
            fieldnames, ["first_name", "last_name", "full_name", "email"]
        )
        rows = []
        n_with_email = 0
        for row in reader:
            campus_id = row["campus_id"]
            first, last = name_for_campus_id(campus_id, taken_names)
            row["first_name"] = first
            row["last_name"] = last
            row["full_name"] = f"{first} {last}"

            employer = current_employer.get(campus_id)
            if employer:
                row["email"] = build_email(first, last, employer)
                n_with_email += 1
            else:
                row["email"] = build_email(first, last, "Gmail")

            rows.append(row)

    with out_path.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.DictWriter(f_out, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows -> {out_path}")
    print(f"  {n_with_email} alumni have a work email (current employer on file); "
          f"{len(rows) - n_with_email} have a gmail.com fallback (no current job on file).")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--alumni", required=True, type=Path)
    ap.add_argument("--students", required=True, type=Path)
    ap.add_argument("--employment", required=True, type=Path)
    ap.add_argument("--outdir", required=True, type=Path)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)

    process_alumni(args.alumni, args.outdir / "alumni.csv", args.employment)
    process_students(args.students, args.outdir / "students_current.csv")


if __name__ == "__main__":
    main()
