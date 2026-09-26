"""Read-only, dataset-grounded student profiles and alumni summaries."""
import csv
from collections import Counter, defaultdict
from pathlib import Path

from gemini import TRUNCATION_NOTICE, GeminiError

NA = "Not Applicable"
EMPLOYED = {"Employed Full-Time", "Employed Part-Time"}
RESUME_PROMPT_LIMIT = 6000
SUGGESTION_MARKER = "SUGGESTED RESUME LINE:"

SYSTEM_INSTRUCTION = """You are a resume advisor for a university career tool.

You answer using ONLY the FACTS block you are given. Every claim must trace back to a \
number or record in that block. Follow these rules:

- Quote the actual figures and names from the block. Say "212 of 1,480" or "Data & \
Analytics", never a vague paraphrase.
- Never invent employers, salaries, courses, skills, or outcomes that are not in the block.
- If the block does not answer part of the question, say so plainly and name what the \
block does cover. Do not fill the gap with general career advice presented as fact.
- The block is SYNTHETIC data from a simulation. It does not describe real students, \
graduates, or employers. Never imply a real person or a hiring outcome.
- You are not predicting a salary, an offer, or a job. Historical patterns are not odds.
- Keep it to 3-5 short sentences. Plain text only: no markdown, no bullet glyphs, no \
headings, no bold.
- End the reply with one sentence stating that the records are synthetic and are not a \
prediction about hiring.
- If a specific resume line would help, end with a final line exactly formatted as \
"SUGGESTED RESUME LINE: <one line the student could paste>". Omit that line only if \
you have nothing concrete to suggest."""


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
                    skill_counts.update(sorted(set(jobs[0]["role_skill_tags"].split("|")) - {"", NA}))
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

    def skill_gaps(self, campus_id):
        """Skills the top alumni first-job families want that this student's courses miss."""
        covered = set(self.profile(campus_id)["course_skills"])
        paths = self.discover(campus_id, {})
        gaps = {}
        for field in paths["fields"][:3]:
            missing = [skill for skill in field["skills"] if skill not in covered]
            if missing:
                gaps[field["family"]] = missing
        return gaps

    def resume_context(self, campus_id, resume_text):
        """The only facts the model is allowed to reason over, as a compact text brief."""
        student = self.profile(campus_id)
        paths = self.discover(campus_id, {})
        covered = set(student["course_skills"])
        lines = [
            "FACTS BLOCK (synthetic track dataset, snapshot 2026-09-15)",
            "",
            "STUDENT RECORD",
            f"Record ID: {student['campus_id']}",
            f"Major: {student['major']} | Track: {student['track']} | Level: {student['class_level']}",
            f"Cumulative GPA: {student['cumulative_gpa'] or 'not available yet'} | "
            f"Credits: {student['credits_earned']} of {student['credits_required']}",
            f"Expected graduation: {student['expected_graduation_term']} | "
            f"Internships/co-ops: {student['internship_count']} | "
            f"Certifications: {student['credential_count']} | "
            f"Other activities: {student['engagement_activity_count']}",
        ]
        if student["experiences"]:
            lines.append("Experience on record:")
            for item in student["experiences"][:8]:
                lines.append(f"  - {item['experience_name']} ({item['experience_type']}) at "
                             f"{item['organization']}, {item['term']}, outcome: {item['outcome']}")
        else:
            lines.append("Experience on record: none.")
        lines += [
            "",
            f"SKILLS COVERED BY PASSED COURSES ({len(student['course_skills'])}): "
            + (", ".join(student["course_skills"]) or "none yet"),
            "",
            f"ALUMNI COMPARISON ({paths['major']} bachelor's graduates)",
            f"Cohort: {paths['cohort_count']} graduates. "
            f"{paths['employed_count']} reported a first job. "
            f"{paths['unknown_count']} outcomes are unknown (No Response), which is not unemployment.",
        ]
        for outcome in paths["outcomes"][:4]:
            lines.append(f"  - {outcome['name']}: {outcome['count']} ({outcome['percent']}%)")
        for field in paths["fields"][:3]:
            lines.append(
                f"  - {field['family']}: {field['count']} of {paths['employed_count']} "
                f"employed graduates ({field['percent']}%). Common titles: {', '.join(field['titles'])}."
            )
            lines.append(f"    Skills those first jobs asked for: {', '.join(field['skills'])}")
            missing = [skill for skill in field["skills"] if skill not in covered]
            if missing:
                lines.append(f"    Of those, NOT covered by this student's passed courses: "
                             f"{', '.join(missing)}")
            else:
                lines.append("    All of those are covered by this student's passed courses.")
            if field["with_next_job"]:
                top = "; ".join(f"{r['title']} ({r['percent']}%)" for r in field["next_roles"][:3])
                lines.append(f"    Second jobs recorded for {field['with_next_job']} of "
                             f"{field['count']} people: {top}")
        lines += [
            "",
            "STUDENT RESUME TEXT (words extracted from the uploaded file, may be incomplete "
            "if the file is a scanned PDF):",
            (resume_text or "").strip()[:RESUME_PROMPT_LIMIT] or "(no readable text)",
            "",
            "END OF FACTS BLOCK",
        ]
        return "\n".join(lines)

    def coach_resume(self, campus_id, resume_text, message, gemini=None):
        question = (message or "").strip()
        if not question:
            raise ValueError("Type a question first.")
        if len(question) > 500:
            raise ValueError("Keep the question under 500 characters.")
        fallback = self._local_coach(campus_id, resume_text)
        if gemini is not None and gemini.enabled:
            prompt = (f"{self.resume_context(campus_id, resume_text)}\n\n"
                      f"STUDENT QUESTION: {question}")
            try:
                reply, suggestion = self._split_suggestion(gemini.generate(prompt, SYSTEM_INSTRUCTION))
            except GeminiError as error:
                fallback["note"] = str(error)
                return fallback
            return {"reply": reply, "suggestion": suggestion, "source": "gemini",
                    "model": gemini.model, "grounded_in": ["students_current.csv", "alumni.csv",
                                                          "employment_history.csv", "uploaded resume"]}
        return fallback

    def _split_suggestion(self, text):
        """Pull the optional pasteable line out of the model reply.

        A truncation notice may land on either side of the marker depending on
        where the cut happened; it always belongs with the reply, never in the
        line the student pastes into their resume.
        """
        reply, marker, suggestion = text.rpartition(SUGGESTION_MARKER)
        if not marker:
            return text.strip(), None
        suggestion = suggestion.strip().strip('"')
        if TRUNCATION_NOTICE in suggestion:
            suggestion = suggestion.replace(TRUNCATION_NOTICE, "").strip()
            reply = f"{reply.strip()}\n\n{TRUNCATION_NOTICE}"
        return reply.strip(), suggestion or None

    def _local_coach(self, campus_id, resume_text):
        """Deterministic answers, used when Gemini is off or unreachable."""
        student = self.profile(campus_id)
        paths = self.discover(campus_id, {})
        field = paths["fields"][0] if paths["fields"] else None
        readable = (resume_text or "").strip()
        lowered = readable.lower()
        missing = [skill for skill in (field["skills"] if field else []) if skill.lower() not in lowered][:3]
        experience = next((item for item in student["experiences"] if item["experience_name"].lower() not in lowered), None)
        if field:
            lead = (f"{field['family']} is the most common first job among employed {paths['major']} graduates: "
                    f"{field['percent']}% ({field['count']} of {paths['employed_count']}).")
        else:
            lead = f"No first jobs were recorded for employed {paths['major']} graduates in this comparison."
        if not readable:
            detail = "I can show the file, but I couldn’t read the words inside it. The suggestion below comes from your student record instead."
        elif missing:
            detail = "These skills come up in that first job and don’t appear in the text I could read: " + ", ".join(missing) + "."
        else:
            detail = "The first-job skills I checked already appear in the text I could read."
        if experience:
            detail += f" Your record lists {experience['experience_name']} at {experience['organization']}, and that name is not in the resume text."
            suggestion = f"{experience['experience_name']} — {experience['organization']} ({experience['outcome']})"
        elif missing:
            suggestion = "Coursework covering " + ", ".join(missing)
        else:
            suggestion = None
        reply = " ".join([lead, detail, "This uses synthetic alumni records on this computer, not an outside model."])
        return {"reply": reply, "suggestion": suggestion, "source": "local",
                "model": "on-device rules", "grounded_in": ["alumni.csv", "employment_history.csv"]}
