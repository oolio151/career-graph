import io
import json
import tempfile
import unittest
import urllib.error
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from unittest import mock

from app import MAX_RESUME, create_app
from career_data import CareerData, person_name
from gemini import MAX_OUTPUT_TOKENS, TRUNCATION_NOTICE, Gemini, GeminiError


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.app = create_app({"TESTING": True, "SECRET_KEY": "test-only-key", "UPLOAD_DIR": Path(cls.temp.name) / "resumes",
                              "GEMINI_API_KEY": ""})
        cls.data = cls.app.extensions["career_data"]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.client = self.app.test_client()
        self.client.get("/")
        with self.client.session_transaction() as session:
            self.csrf = session["csrf"]
        # Tests may swap in a fake advisor; put the original back so no test
        # ever reaches the real Gemini API.
        original = self.app.extensions["gemini"]
        self.addCleanup(self.app.extensions.__setitem__, "gemini", original)

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

    def test_skip_resume_then_upload_in_workspace(self):
        response = self.client.post("/api/enroll", data={"campus_id": "CID-116490"},
                                    headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/session").json["resume"]["filename"], "")
        self.assertEqual(self.client.get("/api/discover").status_code, 200)
        page = self.client.get("/app").data
        self.assertIn(b'id="resume-upload-form"', page)
        self.assertNotIn(b'id="view-advisor"', page)
        self.assertNotIn(b'id="view-saved"', page)
        self.assertEqual(self.client.get("/api/resume/preview").status_code, 404)
        self.assertEqual(self.enroll().status_code, 200)
        self.assertEqual(self.client.get("/api/resume/preview").status_code, 200)
        reply = self.client.post("/api/resume/chat", json={"message": "What can I improve?"},
                                 headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(reply.status_code, 200)

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

    def test_chat_uses_gemini_when_key_is_configured(self):
        self.enroll()
        reply = ("Data & Analytics is the most common first job for 212 of 1,480 employed Computer "
                 "Science graduates. Your coursework does not cover containerization.\n\n"
                 "These records are synthetic and are not a prediction about hiring.\n\n"
                 "SUGGESTED RESUME LINE: Built a Flask service over a 1.4M-row dataset.")
        self.app.extensions["gemini"] = Gemini("test-key")
        with mock.patch.object(Gemini, "generate", return_value=reply) as generate:
            chat = self.client.post("/api/resume/chat", json={"message": "What should I add?"}, headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(chat.status_code, 200)
        self.assertEqual(chat.json["source"], "gemini")
        self.assertEqual(chat.json["model"], "gemini-3.5-flash-lite")
        self.assertEqual(chat.json["suggestion"], "Built a Flask service over a 1.4M-row dataset.")
        self.assertIn("synthetic", chat.json["reply"])
        self.assertNotIn("SUGGESTED RESUME LINE", chat.json["reply"])
        prompt, system = generate.call_args.args
        self.assertIn("CID-116490", prompt)
        self.assertIn("Data & Analytics", prompt)
        self.assertIn("Example Student", prompt)
        self.assertIn("synthetic", system.lower())

    def test_resume_chat_remembers_followups_and_resets_on_replacement(self):
        self.enroll()
        self.app.extensions['gemini'] = Gemini('test-key')
        headers = {'X-CSRF-Token': self.csrf}
        with mock.patch.object(Gemini, 'generate', return_value='Try a small team project.') as generate:
            self.client.post('/api/resume/chat', json={'message': 'I want to try a hackathon.'}, headers=headers)
            response = self.client.post('/api/resume/chat', json={'message': 'How should I prepare for it?'}, headers=headers)
            self.assertEqual(response.status_code, 200)
            prompt = generate.call_args.args[0]
            self.assertIn('I want to try a hackathon.', prompt)
            self.assertIn('Try a small team project.', prompt)
            self.assertEqual(self.app.test_client().post('/api/resume/chat', json={'message': 'Hi'}).status_code, 403)
            self.enroll()
            self.client.post('/api/resume/chat', json={'message': 'Hello'}, headers=headers)
            self.assertNotIn('I want to try a hackathon.', generate.call_args.args[0])

    def test_truncation_notice_never_lands_in_the_pasteable_line(self):
        data = self.data
        cases = {
            "before": f"Reply text here.\n\n{TRUNCATION_NOTICE}\n\nSUGGESTED RESUME LINE: Analyzed a dataset.",
            "after": f"Reply text here.\n\nSUGGESTED RESUME LINE: Analyzed a dataset.\n\n{TRUNCATION_NOTICE}",
        }
        for label, text in cases.items():
            reply, suggestion = data._split_suggestion(text)
            self.assertEqual(suggestion, "Analyzed a dataset.", label)
            self.assertIn(TRUNCATION_NOTICE, reply, label)
            self.assertIn("Reply text here.", reply, label)

    def test_chat_falls_back_when_gemini_fails(self):
        self.enroll()
        self.app.extensions["gemini"] = Gemini("test-key")
        with mock.patch.object(Gemini, "generate", side_effect=GeminiError("Gemini returned HTTP 429.")):
            chat = self.client.post("/api/resume/chat", json={"message": "What should I add?"}, headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(chat.status_code, 200)
        self.assertEqual(chat.json["source"], "local")
        self.assertIn("429", chat.json["note"])
        self.assertIn("Computer Science", chat.json["reply"])
        self.assertTrue(chat.json["suggestion"])

    def test_chat_config_never_exposes_the_key(self):
        self.app.extensions["gemini"] = Gemini("super-secret-key")
        config = self.client.get("/api/resume/chat/config")
        self.assertEqual(config.json, {"engine": "gemini", "model": "gemini-3.5-flash-lite"})
        self.assertNotIn("super-secret-key", config.get_data(as_text=True))
        health = self.client.get("/api/health").json
        self.assertEqual(health["advisor"]["engine"], "gemini")
        self.assertNotIn("super-secret-key", json.dumps(health))
        self.app.extensions["gemini"] = Gemini("")
        self.assertEqual(self.client.get("/api/resume/chat/config").json["engine"], "local")

    def test_latex_renderer_validates_source(self):
        self.enroll()
        headers = {"X-CSRF-Token": self.csrf}
        missing_document = self.client.post("/api/resume/render", json={"source": "hello"}, headers=headers)
        self.assertEqual(missing_document.status_code, 400)
        unsafe = self.client.post(
            "/api/resume/render",
            json={"source": r"\documentclass{article}\begin{document}\input{secret}\end{document}"},
            headers=headers,
        )
        self.assertEqual(unsafe.status_code, 400)
        self.assertIn("disabled", unsafe.json["error"])


class CalculationTests(unittest.TestCase):
    def test_person_names_support_full_partial_and_legacy_records(self):
        self.assertEqual(person_name({"campus_id": "CID-123456", "full_name": "Ada Lovelace"}), "Ada Lovelace")
        self.assertEqual(person_name({"campus_id": "CID-123456", "full_name": "Not Applicable",
                                      "first_name": "Ada", "last_name": "Lovelace"}), "Ada Lovelace")
        self.assertEqual(person_name({"campus_id": "CID-123456"}), "CID-123456")

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


class GeminiClientTests(unittest.TestCase):
    """The HTTP wrapper, with no network access."""

    def setUp(self):
        # No test in this class may reach the real API. Each one re-patches
        # urlopen with the behaviour it needs.
        patcher = mock.patch("gemini.urllib.request.urlopen")
        self.urlopen = patcher.start()
        self.addCleanup(patcher.stop)
        self.urlopen.side_effect = AssertionError("tests must not call the real Gemini API")

    def reply(self, payload):
        body = json.dumps(payload).encode("utf-8")
        return mock.MagicMock(__enter__=mock.MagicMock(return_value=mock.MagicMock(read=lambda: body)))

    def call(self, client, payload, system="system", side_effect=None):
        with mock.patch("gemini.urllib.request.urlopen", side_effect=side_effect, return_value=self.reply(payload) if side_effect is None else None) as urlopen:
            result = client.generate("prompt", system)
        return result, urlopen

    def test_disabled_without_a_key(self):
        self.assertFalse(Gemini("").enabled)
        with self.assertRaises(GeminiError):
            Gemini("").generate("prompt")

    def test_request_shape_and_reply_parsing(self):
        client = Gemini("secret-key")
        self.assertTrue(client.enabled)
        text, urlopen = self.call(client, {"candidates": [{"content": {"parts": [{"text": " hello "}]}}]})
        self.assertEqual(text, "hello")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertIn("gemini-3.5-flash-lite:generateContent", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "secret-key")
        body = json.loads(request.data)
        self.assertEqual(body["contents"], [{"role": "user", "parts": [{"text": "prompt"}]}])
        self.assertEqual(body["systemInstruction"]["parts"][0]["text"], "system")

    def test_custom_model_and_omitted_system_instruction(self):
        text, urlopen = self.call(Gemini("k", "gemini-3.5-flash"), {"candidates": [{"content": {"parts": [{"text": "x"}]}}]}, system=None)
        self.assertEqual(text, "x")
        request = urlopen.call_args.args[0]
        self.assertIn("gemini-3.5-flash:generateContent", request.full_url)
        self.assertNotIn("systemInstruction", json.loads(request.data))

    def test_errors_are_raised_without_leaking_the_key(self):
        http_error = urllib.error.HTTPError("u", 429, "quota", {}, None)
        self.addCleanup(http_error.close)
        for side_effect, expected in ((http_error, "429"), (urllib.error.URLError("no route"), "Could not reach"),
                                      (TimeoutError(), "Could not reach")):
            with mock.patch("gemini.urllib.request.urlopen", side_effect=side_effect):
                with self.assertRaises(GeminiError) as caught:
                    Gemini("secret-key").generate("prompt")
            self.assertIn(expected, str(caught.exception))
            self.assertNotIn("secret-key", str(caught.exception))

    def test_unusable_payloads_raise(self):
        for payload in ({}, {"candidates": []}, {"candidates": [{"content": {"parts": []}}]},
                        {"candidates": [{"content": {"parts": [{"text": "   "}]}}]}):
            with self.assertRaises(GeminiError):
                self.call(Gemini("k"), payload)

    def test_blocked_prompt_reports_the_reason(self):
        with self.assertRaises(GeminiError) as caught:
            self.call(Gemini("k"), {"promptFeedback": {"blockReason": "SAFETY"}})
        self.assertIn("SAFETY", str(caught.exception))

    def test_gemini_3_gets_a_thinking_budget_and_a_larger_token_cap(self):
        text, urlopen = self.call(Gemini("k"), {"candidates": [{"content": {"parts": [{"text": "x"}]}}]})
        self.assertEqual(text, "x")
        config = json.loads(urlopen.call_args.args[0].data)["generationConfig"]
        self.assertEqual(config["maxOutputTokens"], MAX_OUTPUT_TOKENS)
        self.assertGreater(MAX_OUTPUT_TOKENS, 1000)
        self.assertEqual(config["thinkingConfig"], {"thinkingLevel": "low"})

    def test_older_models_do_not_receive_thinking_level(self):
        _, urlopen = self.call(Gemini("k", "gemini-2.5-flash"), {"candidates": [{"content": {"parts": [{"text": "x"}]}}]})
        self.assertNotIn("thinkingConfig", json.loads(urlopen.call_args.args[0].data)["generationConfig"])

    def test_truncated_reply_is_marked_instead_of_looking_complete(self):
        payload = {"candidates": [{"content": {"parts": [{"text": "Software Engineering is the most common"}]},
                                   "finishReason": "MAX_TOKENS"}]}
        text, _ = self.call(Gemini("k"), payload)
        self.assertIn("Software Engineering is the most common", text)
        self.assertIn("cut off", text)

    def test_complete_reply_is_not_marked(self):
        text, _ = self.call(Gemini("k"), {"candidates": [{"content": {"parts": [{"text": "done"}]}, "finishReason": "STOP"}]})
        self.assertEqual(text, "done")


if __name__ == "__main__":
    unittest.main()
