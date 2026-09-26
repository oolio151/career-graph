#!/usr/bin/env python3
"""
generate_names.py

Adds a synthetic `full_name` (and `first_name` / `last_name`) field to
alumni.csv and students_current.csv, keyed off campus_id so the same
campus_id always gets the same name across files/runs.

All names are fictitious and generated deterministically (seeded RNG),
matching the "all employers are fictitious" convention already used in
employment_history.csv.

Usage:
    python generate_names.py \
        --alumni /path/to/alumni.csv \
        --students /path/to/students_current.csv \
        --outdir /path/to/output_dir

Outputs:
    alumni_with_names.csv
    students_current_with_names.csv
    (name columns are inserted right after campus_id)
"""

import argparse
import csv
import hashlib
import random
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


def name_for_campus_id(campus_id: str) -> tuple[str, str]:
    r = rng_for_campus_id(campus_id)
    first = r.choice(FIRST_NAMES)
    last = r.choice(LAST_NAMES)
    return first, last


def process_file(in_path: Path, out_path: Path) -> None:
    with in_path.open(newline="", encoding="utf-8") as f_in:
        reader = csv.DictReader(f_in)
        fieldnames = reader.fieldnames or []
        if "campus_id" not in fieldnames:
            raise ValueError(f"{in_path} has no campus_id column")

        # Insert first_name, last_name, full_name right after campus_id
        idx = fieldnames.index("campus_id") + 1
        new_fieldnames = (
            fieldnames[:idx]
            + ["first_name", "last_name", "full_name"]
            + fieldnames[idx:]
        )

        rows = []
        seen_names = {}  # dedupe safeguard: track (first,last) collisions
        for row in reader:
            campus_id = row["campus_id"]
            first, last = name_for_campus_id(campus_id)

            # If two different campus_ids happen to land on the exact same
            # name, nudge the second one deterministically so alumni lists
            # / email generation don't collide.
            key = (first, last)
            if key in seen_names and seen_names[key] != campus_id:
                r = rng_for_campus_id(campus_id + "-alt")
                last = r.choice(LAST_NAMES)
                key = (first, last)
            seen_names.setdefault(key, campus_id)

            row["first_name"] = first
            row["last_name"] = last
            row["full_name"] = f"{first} {last}"
            rows.append(row)

    with out_path.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.DictWriter(f_out, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows -> {out_path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--alumni", required=True, type=Path)
    ap.add_argument("--students", required=True, type=Path)
    ap.add_argument("--outdir", required=True, type=Path)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)

    process_file(args.alumni, args.outdir / "alumni_with_names.csv")
    process_file(args.students, args.outdir / "students_current_with_names.csv")


if __name__ == "__main__":
    main()
