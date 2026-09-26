import io
import json
import re
import secrets
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from career_data import CareerData
from python.discover_map import discover_map

MAX_RESUME = 5 * 1024 * 1024


def validate_resume(upload):
    if not upload or not upload.filename:
        raise ValueError("Choose a PDF, DOCX, or TXT resume.")
    name = secure_filename(upload.filename)
    extension = Path(name).suffix.lower()
    data = upload.read(MAX_RESUME + 1)
    if not data or len(data) > MAX_RESUME:
        raise ValueError("Choose a nonempty resume smaller than 5 MB.")
    valid = False
    if extension == ".pdf":
        valid = data.startswith(b"%PDF-") and b"%%EOF" in data[-2048:]
    elif extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                valid = {"[Content_Types].xml", "word/document.xml"} <= set(archive.namelist())
        except (zipfile.BadZipFile, ValueError):
            pass
    elif extension == ".txt":
        try:
            text = data.decode("utf-8")
            valid = bool(text.strip()) and not any(ord(c) < 32 and c not in "\t\r\n" for c in text)
        except UnicodeDecodeError:
            pass
    if not valid:
        raise ValueError("That file does not look like a PDF, DOCX, or UTF-8 TXT resume. Please choose another file.")
    return name, extension, data


def resume_plain_text(extension, data):
    if extension == ".txt":
        return data.decode("utf-8")
    if extension == ".docx":
        return _docx_text(data)
    if extension == ".pdf":
        return _pdf_text(data)
    return ""


def _docx_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        document = archive.read("word/document.xml")
    paragraphs = []
    for paragraph in ET.fromstring(document).iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        line = "".join(node.text or "" for node in paragraph.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _pdf_string(raw):
    output = bytearray()
    index = 0
    while index < len(raw):
        if raw[index] != 0x5C or index + 1 >= len(raw):
            output.append(raw[index])
            index += 1
            continue
        code = raw[index + 1]
        if code in b"nrtbf":
            output.append({ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}[code])
            index += 2
        elif code in b"()\\":
            output.append(code)
            index += 2
        elif 48 <= code <= 55:
            digits = bytearray()
            while len(digits) < 3 and index + 1 + len(digits) < len(raw) and 48 <= raw[index + 1 + len(digits)] <= 55:
                digits.append(raw[index + 1 + len(digits)])
            output.append(int(digits, 8) & 0xFF)
            index += 1 + len(digits)
        else:
            output.append(code)
            index += 2
    return output.decode("latin-1", errors="replace")


def _pdf_text(data):
    blobs = [data]
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        raw = match.group(1).strip(b"\r\n")
        try:
            blobs.append(zlib.decompress(raw))
        except zlib.error:
            blobs.append(raw)
    parts = []
    for blob in blobs:
        for array in re.finditer(rb"\[(.*?)\]\s*TJ", blob, re.S):
            pieces = []
            for token in re.finditer(rb"\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)", array.group(1)):
                if token.group(1) is not None:
                    pieces.append(_pdf_string(token.group(1)))
                elif float(token.group(2)) > 200:
                    pieces.append(" ")
            line = "".join(pieces).strip()
            if line:
                parts.append(line)
        for match in re.finditer(rb"\(((?:\\.|[^\\)]){1,300})\)\s*Tj", blob):
            line = _pdf_string(match.group(1)).strip()
            if line:
                parts.append(line)
    return "\n".join(parts)


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(MAX_CONTENT_LENGTH=MAX_RESUME + 65536, SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE="Lax", DATA_DIR=Path(app.root_path) / "data",
                      UPLOAD_DIR=Path(app.instance_path) / "resumes")
    if test_config:
        app.config.update(test_config)
    private = Path(app.config["UPLOAD_DIR"])
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not app.config.get("SECRET_KEY"):
        key_file = private.parent / "session.key"
        if not key_file.exists():
            try:
                with key_file.open("x") as f:
                    f.write(secrets.token_hex(32))
                key_file.chmod(0o600)
            except FileExistsError:
                pass
        app.config["SECRET_KEY"] = key_file.read_text()
    dataset = CareerData(app.config["DATA_DIR"])
    app.extensions["career_data"] = dataset

    def state():
        token = session.get("upload_id", "")
        if not re.fullmatch(r"[a-f0-9]{32}", token):
            return None
        path = private / f"{token}.json"
        try:
            result = json.loads(path.read_text())
            if result["campus_id"] not in dataset.students:
                return None
            return result
        except (OSError, ValueError, KeyError):
            return None

    def clear_upload():
        token = session.get("upload_id", "")
        if re.fullmatch(r"[a-f0-9]{32}", token):
            for file in private.glob(f"{token}.*"):
                file.unlink(missing_ok=True)
        session.pop("upload_id", None)

    @app.before_request
    def protect_local_session():
        if "csrf" not in session:
            session["csrf"] = secrets.token_hex(24)
        if request.method == "POST" and not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), session["csrf"]):
            return jsonify(error="Your session changed. Refresh the page and try again."), 403

    @app.after_request
    def private_response(response):
        if request.path.startswith("/api/") or request.path in {"/", "/app"}:
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(error):
        return jsonify(error="Choose a resume smaller than 5 MB."), 413

    @app.get("/")
    def index():
        if state():
            return redirect(url_for("workspace"))
        return render_template("welcome.html")

    @app.get("/app")
    def workspace():
        if not state():
            return redirect(url_for("index"))
        return render_template("index.html", student_id=state()["campus_id"])

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "career-graph"}

    @app.get("/api/students/<campus_id>")
    def student(campus_id):
        # Synthetic demo lookup, not authentication for real student records.
        profile = dataset.profile(campus_id.strip().upper())
        if profile is None:
            return jsonify(error="No current student with that ID. Try CID-116490 to explore the demo."), 404
        return jsonify(profile)

    @app.post("/api/enroll")
    def enroll():
        campus_id = request.form.get("campus_id", "").strip().upper()
        if campus_id not in dataset.students:
            return jsonify(error="Enter a valid current student ID before uploading."), 400
        upload = request.files.get("resume")
        if upload and upload.filename:
            try:
                name, extension, data = validate_resume(upload)
            except ValueError as error:
                return jsonify(error=str(error)), 400
        else:
            name, extension, data = "", "", b""
        token = secrets.token_hex(16)
        file = private / f"{token}{extension}"
        meta = private / f"{token}.json"
        metadata = {"campus_id": campus_id, "filename": name, "extension": extension, "size": len(data)}
        try:
            if data:
                file.write_bytes(data)
                file.chmod(0o600)
            meta.write_text(json.dumps(metadata))
            meta.chmod(0o600)
        except OSError:
            file.unlink(missing_ok=True)
            meta.unlink(missing_ok=True)
            return jsonify(error="Could not save your resume. Please try again."), 500
        clear_upload()
        session["upload_id"] = token
        return jsonify(next="/app#discover")

    @app.get("/api/session")
    def current_session():
        current = state()
        if not current:
            return jsonify(error="Enter your student ID and resume to continue."), 401
        return jsonify(student=dataset.profile(current["campus_id"]), resume={k: current[k] for k in ("filename", "size")})

    @app.get("/api/discover")
    def discover():
        current = state()
        if not current:
            return jsonify(error="Enter your student ID and resume to continue."), 401
        filters = {key: request.args.get(key) == "1" for key in ("track", "gpa", "internships")}
        try:
            return jsonify(discover_map(dataset, current["campus_id"], filters))
        except ValueError as error:
            return jsonify(error=str(error)), 400

    def resume_file(current):
        file = private / f"{session['upload_id']}{current['extension']}"
        if not file.exists():
            return None
        return file

    @app.get("/api/resume")
    def resume():
        current = state()
        if not current:
            return jsonify(error="No resume in this session."), 401
        file = resume_file(current)
        if file is None:
            return jsonify(error="Resume not found. Upload it again."), 404
        return send_file(file, as_attachment=True, download_name=current["filename"])

    @app.get("/api/resume/file")
    def resume_inline():
        current = state()
        if not current:
            return jsonify(error="No resume in this session."), 401
        file = resume_file(current)
        if file is None:
            return jsonify(error="Resume not found. Upload it again."), 404
        types = {".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
                 ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
        return send_file(file, as_attachment=False, download_name=current["filename"], mimetype=types[current["extension"]])

    @app.get("/api/resume/view/<path:name>")
    def resume_named(name):
        return resume_inline()

    @app.get("/api/resume/preview")
    def resume_preview():
        current = state()
        if not current:
            return jsonify(error="No resume in this session."), 401
        file = resume_file(current)
        if file is None:
            return jsonify(error="Resume not found. Upload it again."), 404
        text = resume_plain_text(current["extension"], file.read_bytes())[:20000]
        return jsonify(filename=current["filename"], extension=current["extension"], size=current["size"],
                       text=text, paragraphs=[line for line in text.splitlines() if line.strip()][:200])

    @app.post("/api/resume/chat")
    def resume_chat():
        current = state()
        if not current:
            return jsonify(error="Enter your student ID and resume to continue."), 401
        file = resume_file(current)
        if file is None:
            return jsonify(error="Resume not found. Upload it again."), 404
        message = request.get_json(silent=True) or {}
        try:
            text = resume_plain_text(current["extension"], file.read_bytes())[:20000]
            return jsonify(dataset.coach_resume(current["campus_id"], text, message.get("message", "")))
        except ValueError as error:
            return jsonify(error=str(error)), 400

    @app.post("/api/session/clear")
    def clear():
        clear_upload()
        session.clear()
        return jsonify(next="/")

    return app
