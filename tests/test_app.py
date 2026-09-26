import io
import tempfile
import unittest
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from app import MAX_RESUME, create_app
from career_data import CareerData


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.app = create_app({"TESTING": True, "SECRET_KEY": "test-only-key", "UPLOAD_DIR": Path(cls.temp.name) / "resumes"})
        cls.data = cls.app.extensions["career_data"]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.client = self.app.test_client()
        self.client.get("/")
        with self.client.session_transaction() as session:
            self.csrf = session["csrf"]

    def enroll(self, campus_id="CID-116490", content=b"Example Student\nPython and SQL", filename="resume.txt", client=None, csrf=None):
        return (client or self.client).post("/api/enroll", data={"campus_id":campus_id, "resume":(io.BytesIO(content), filename)}, headers={"X-CSRF-Token":csrf or self.csrf})

    def test_entry_and_profile_are_required(self):
        self.assertEqual(self.client.get("/app").status_code, 302)
        self.assertEqual(self.client.get("/api/session").status_code, 401)
        self.assertEqual(self.client.get("/api/discover").status_code, 401)
        self.assertEqual(self.client.get("/api/resume").status_code, 401)
        self.assertEqual(self.client.get("/api/resume/preview").status_code, 401)
        self.assertEqual(self.client.post("/api/resume/chat", json={"message": "Hi"}, headers={"X-CSRF-Token": self.csrf}).status_code, 401)
        self.assertEqual(self.enroll().status_code, 200)
        self.assertIn(b'id="view-discover"', self.client.get("/app").data)
        current = self.client.get("/api/session").json
        self.assertEqual(current["student"]["major"], "Computer Science")
        self.assertEqual(current["resume"]["filename"], "resume.txt")
        self.assertNotIn("tuition_paid_to_date_usd", current["student"])
        downloaded = self.client.get("/api/resume")
        self.assertEqual(downloaded.data, b"Example Student\nPython and SQL")
        self.assertIn("attachment", downloaded.headers["Content-Disposition"])
        downloaded.close()

    def test_current_students_only_and_missing_gpa(self):
        self.assertEqual(self.client.get("/api/students/CID-655977").status_code, 404)
        self.assertEqual(self.client.get("/api/students/CID-000000").status_code, 404)
        p = self.client.get("/api/students/CID-227285").json
        self.assertIsNone(p["cumulative_gpa"])
        self.assertEqual(p["course_skills"], [])
        self.enroll("CID-227285")
        self.assertEqual(self.client.get("/api/discover?gpa=1").status_code, 400)
        self.assertEqual(self.client.get("/api/discover").status_code, 200)

    def test_upload_validation_and_csrf(self):
        self.assertEqual(self.enroll(csrf="wrong").status_code, 403)
        self.assertEqual(self.enroll(campus_id="CID-000000").status_code, 400)
        self.assertEqual(self.enroll(content=b"", filename="empty.txt").status_code, 400)
        self.assertEqual(self.enroll(content=b"hello", filename="fake.pdf").status_code, 400)
        self.assertEqual(self.enroll(content=b"hello", filename="fake.docx").status_code, 400)
        self.assertEqual(self.enroll(content=b"hello", filename="script.html").status_code, 400)
        self.assertEqual(self.enroll(content=b"\xff", filename="bad.txt").status_code, 400)
        self.assertEqual(self.enroll(content=b"a" * (MAX_RESUME + 1)).status_code, 400)
        self.assertEqual(self.enroll(content=b"a" * (MAX_RESUME + 100000)).status_code, 413)

    def test_sessions_are_isolated_and_replacement_cleans_old_file(self):
        self.enroll()
        with self.client.session_transaction() as session:
            old_token = session["upload_id"]
        other = self.app.test_client()
        self.assertEqual(other.get("/api/resume").status_code, 401)
        self.assertEqual(self.enroll(content=b"Replacement resume").status_code, 200)
        self.assertFalse(list(Path(self.app.config["UPLOAD_DIR"]).glob(old_token + ".*")))
        self.assertEqual(self.client.get("/api/session").json["resume"]["size"], 18)
        with self.client.session_transaction() as session:
            current_token = session["upload_id"]
        self.assertEqual(self.client.post("/api/session/clear", headers={"X-CSRF-Token":self.csrf}).status_code, 200)
        self.assertFalse(list(Path(self.app.config["UPLOAD_DIR"]).glob(current_token + ".*")))
        self.assertEqual(self.client.get("/api/session").status_code, 401)

    def test_failed_replacement_keeps_previous_resume(self):
        self.enroll()
        with self.client.session_transaction() as session:
            token = session["upload_id"]
        self.assertEqual(self.enroll(filename="bad.exe").status_code, 400)
        with self.client.session_transaction() as session:
            self.assertEqual(session["upload_id"], token)
        self.assertEqual(self.client.get("/api/session").json["resume"]["filename"], "resume.txt")

    def test_full_dataset_percentages_and_filters(self):
        self.enroll()
        d = self.client.get("/api/discover").json
        rows = [a for a in self.data.alumni if a["major"] == "Computer Science" and a["degree_level"] == "Bachelor of Science"]
        counts = Counter(a["first_destination"] for a in rows)
        self.assertEqual(d["cohort_count"], len(rows))
        self.assertEqual(d["unknown_count"], counts["No Response"])
        self.assertEqual(sum(x["count"] for x in d["fields"]), d["employed_count"])
        self.assertEqual(sum(x["count"] for x in d["outcomes"]), d["cohort_count"])
        for field in d["fields"]:
            self.assertEqual(field["percent"], round(100 * field["count"] / d["employed_count"], 1))
        filtered = self.client.get("/api/discover?track=1&gpa=1&internships=1").json
        expected = [a for a in rows if a["track"] == "Data Science" and 2.75 <= float(a["final_gpa"]) <= 3.25 and int(a["internship_count"]) == 1]
        self.assertEqual(filtered["cohort_count"], len(expected))
        self.assertLess(filtered["cohort_count"], d["cohort_count"])

    def test_resume_preview_chat_and_original_file(self):
        self.enroll()
        preview = self.client.get("/api/resume/preview").json
        self.assertEqual(preview["paragraphs"], ["Example Student", "Python and SQL"])
        inline = self.client.get("/api/resume/file")
        self.assertIn("inline", inline.headers["Content-Disposition"])
        inline.close()
        chat = self.client.post("/api/resume/chat", json={"message": "What should I add?"}, headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(chat.status_code, 200)
        self.assertIn("Computer Science", chat.json["reply"])
        self.assertIn("synthetic", chat.json["reply"])
        self.assertTrue(chat.json["suggestion"])
        self.assertEqual(self.client.post("/api/resume/chat", json={"message": "  "}, headers={"X-CSRF-Token": self.csrf}).status_code, 400)
        self.assertIn(b'id="view-resume"', self.client.get("/app").data)
        pdf = b"%PDF-1.1\n1 0 obj<</Length 44>>stream\nBT (Example Student) Tj [(Campus)-20(Editor) 250(Python)] TJ ET\nendstream\nendobj\n%%EOF\n"
        self.enroll(content=pdf, filename="resume.pdf")
        extracted = self.client.get("/api/resume/preview").json["text"]
        self.assertIn("Example Student", extracted)
        self.assertIn("CampusEditor Python", extracted)
        shown = self.client.get("/api/resume/file")
        self.assertEqual(shown.mimetype, "application/pdf")
        shown.close()
        document = io.BytesIO()
        with zipfile.ZipFile(document, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types></Types>")
            archive.writestr("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Campus Editor</w:t></w:r></w:p></w:body></w:document>')
        self.enroll(content=document.getvalue(), filename="resume.docx")
        self.assertEqual(self.client.get("/api/resume/preview").json["paragraphs"], ["Campus Editor"])


class CalculationTests(unittest.TestCase):
    def fixture(self):
        d = CareerData.__new__(CareerData)
        d.students = {"student": {"major":"Computer Science", "track":"General", "cumulative_gpa":"3.0", "internship_count":"0"}}
        def alum(cid, destination, **changes):
            return {"campus_id":cid,"major":"Computer Science","track":"General","degree_level":"Bachelor of Science","final_gpa":"3.0","internship_count":"0","first_destination":destination,"first_job_family":"Software","first_job_title":"Developer","first_job_found_via":"Career Fair","graduation_year":"2020",**changes}
        d.alumni = [alum("a", "Employed Full-Time"), alum("b", "Employed Part-Time"), alum("c", "No Response"), alum("d", "Continuing Education"), alum("e", "Employed Full-Time", degree_level="Master of Science")]
        def job(title, date):
            return {"job_title":title,"employer":"Example","start_date":date,"end_date":"","change_type":"First Job","role_skill_tags":"Python|Python|SQL"}
        d.jobs = defaultdict(list, {"a":[job("Developer", "2020-01-01"),job("Engineer", "2021-01-01"),job("Lead", "2023-01-01")],"b":[job("Developer", "2020-01-01")]})
        return d

    def test_people_not_job_spells_are_denominator(self):
        result = self.fixture().discover("student", {})
        self.assertEqual(result["cohort_count"], 4)
        self.assertEqual(result["employed_count"], 2)
        self.assertEqual(result["unknown_count"], 1)
        field = result["fields"][0]
        self.assertEqual(field["count"], 2)
        self.assertEqual(field["percent"], 100)
        self.assertEqual(field["with_next_job"], 1)
        self.assertEqual(field["next_roles"], [{"title":"Engineer", "count":1, "percent":100}])
        self.assertEqual(len(field["examples"][0]["jobs"]), 3)
        self.assertEqual(field["skills"], ["Python", "SQL"])

    def test_empty_cohort_and_no_jobs(self):
        d = self.fixture()
        d.students["student"]["track"] = "Unmatched"
        result = d.discover("student", {"track":True})
        self.assertEqual(result["cohort_count"], 0)
        self.assertEqual(result["fields"], [])
        d.alumni = [a for a in d.alumni if a["first_destination"] not in {"Employed Full-Time", "Employed Part-Time"}]
        result = d.discover("student", {})
        self.assertEqual(result["cohort_count"], 2)
        self.assertEqual(result["employed_count"], 0)
        self.assertEqual(result["fields"], [])


if __name__ == "__main__":
    unittest.main()
