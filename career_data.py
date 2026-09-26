"""Read-only, dataset-grounded student profiles and alumni summaries."""
import csv
from collections import Counter, defaultdict
from pathlib import Path

NA = "Not Applicable"
EMPLOYED = {"Employed Full-Time", "Employed Part-Time"}


def percentage(count, total):
    return round(100 * count / total, 1) if total else 0


def internship_band(count):
    return min(int(count), 2)


class CareerData:
    def __init__(self, root):
        root = Path(root)
        def read(name):
            with (root / f"{name}.csv").open(newline="", encoding="utf-8-sig") as file:
                return list(csv.DictReader(file))
        self.students = {r["campus_id"]: r for r in read("students_current")}
        self.alumni = read("alumni")
        self.catalog = {r["course_id"]: r for r in read("course_catalog")}
        self.transcripts = defaultdict(list)
        self.experiences = defaultdict(list)
        self.jobs = defaultdict(list)
        for row in read("transcripts"):
            self.transcripts[row["campus_id"]].append(row)
        for row in read("student_experience"):
            self.experiences[row["campus_id"]].append(row)
        for row in read("employment_history"):
            self.jobs[row["campus_id"]].append(row)
        for jobs in self.jobs.values():
            jobs.sort(key=lambda j: (j["start_date"], j["job_id"]))

    def profile(self, campus_id):
        student = self.students.get(campus_id)
        if not student:
            return None
        # Only education and experience fields needed by this experience.
        keys = ("campus_id", "major", "track", "class_level", "cumulative_gpa",
                "major_gpa", "credits_earned", "credits_required", "minor", "second_major",
                "expected_graduation_term", "internship_count", "credential_count",
                "engagement_activity_count")
        result = {k: None if student[k] == NA else student[k] for k in keys}
        courses = self.transcripts[campus_id]
        passed = {r["course_id"] for r in courses if r["grade"] in {"A", "B", "C", "D"}}
        skills = set()
        for cid in passed:
            skills.update(self.catalog.get(cid, {}).get("skill_tags", "").split("|"))
        result["course_skills"] = sorted(skills - {"", NA})
        result["courses"] = [{k: r[k] for k in ("course_id", "course_title", "term", "grade")} for r in courses]
        result["experiences"] = [{k: r[k] for k in ("experience_type", "experience_name", "organization", "term", "role_level", "outcome")} for r in self.experiences[campus_id]]
        return result

    def discover(self, campus_id, filters):
        student = self.students[campus_id]
        if filters.get("gpa") and student["cumulative_gpa"] == NA:
            raise ValueError("This student has no GPA yet. Turn off the GPA filter.")
        cohort = [a for a in self.alumni if a["major"] == student["major"] and a["degree_level"] == "Bachelor of Science"]
        if filters.get("track"):
            cohort = [a for a in cohort if a["track"] == student["track"]]
        if filters.get("gpa"):
            cohort = [a for a in cohort if abs(float(a["final_gpa"]) - float(student["cumulative_gpa"])) <= .250001]
        if filters.get("internships"):
            cohort = [a for a in cohort if internship_band(a["internship_count"]) == internship_band(student["internship_count"])]
        employed = [a for a in cohort if a["first_destination"] in EMPLOYED]
        outcomes = Counter(a["first_destination"] for a in cohort)
        groups = defaultdict(list)
        for alum in employed:
            groups[alum["first_job_family"]].append(alum)
        fields = []
        for family, members in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0])):
            first_titles = Counter(a["first_job_title"] for a in members)
            routes = Counter(a["first_job_found_via"] for a in members)
            skill_counts = Counter()
            next_roles = Counter()
            examples = []
            for alum in sorted(members, key=lambda a: a["campus_id"]):
                jobs = self.jobs[alum["campus_id"]]
                if jobs:
                    skill_counts.update(set(jobs[0]["role_skill_tags"].split("|")) - {"", NA})
                if len(jobs) > 1:
                    next_roles[jobs[1]["job_title"]] += 1
                    if len(examples) < 3:
                        examples.append({"campus_id": alum["campus_id"], "graduation_year": alum["graduation_year"], "jobs": [{k: j[k] for k in ("job_title", "employer", "start_date", "end_date", "change_type")} for j in jobs]})
            progressed = sum(next_roles.values())
            fields.append({"family": family, "count": len(members), "percent": percentage(len(members), len(employed)),
                "titles": [t for t, _ in first_titles.most_common(3)],
                "skills": [s for s, _ in skill_counts.most_common(6)],
                "routes": [{"name": name, "count": count, "percent": percentage(count, len(members))} for name, count in routes.most_common(3)],
                "with_next_job": progressed,
                "next_roles": [{"title": title, "count": count, "percent": percentage(count, progressed)} for title, count in next_roles.most_common(4)],
                "examples": examples})
        return {"major": student["major"], "cohort_count": len(cohort), "employed_count": len(employed),
            "unknown_count": outcomes.get("No Response", 0),
            "graduation_years": sorted({int(a["graduation_year"]) for a in cohort}),
            "outcomes": [{"name": name, "count": count, "percent": percentage(count, len(cohort))} for name, count in sorted(outcomes.items(), key=lambda p: (-p[1], p[0]))],
            "fields": fields, "filters": filters, "small_sample": len(cohort) < 20,
            "sources": ["alumni.csv", "employment_history.csv"], "as_of": "2026-09-15"}
