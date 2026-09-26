import io
import json
import re
import secrets
import zipfile
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from career_data import CareerData

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
        try:
            name, extension, data = validate_resume(request.files.get("resume"))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        token = secrets.token_hex(16)
        file = private / f"{token}{extension}"
        meta = private / f"{token}.json"
        metadata = {"campus_id": campus_id, "filename": name, "extension": extension, "size": len(data)}
        try:
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
            return jsonify(dataset.discover(current["campus_id"], filters))
        except ValueError as error:
            return jsonify(error=str(error)), 400

    @app.get("/api/resume")
    def resume():
        current = state()
        if not current:
            return jsonify(error="No resume in this session."), 401
        file = private / f"{session['upload_id']}{current['extension']}"
        if not file.exists():
            return jsonify(error="Resume not found. Upload it again."), 404
        return send_file(file, as_attachment=True, download_name=current["filename"])

    @app.post("/api/session/clear")
    def clear():
        clear_upload()
        session.clear()
        return jsonify(next="/")

    return app
