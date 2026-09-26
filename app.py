import re

from flask import Flask, redirect, render_template, request, url_for


def create_app():
    app = Flask(__name__)

    @app.route("/", methods=["GET", "POST"])
    @app.route("/login", methods=["GET", "POST"])
    def index():
        campus_id = ""
        message = None
        invalid = False
        if request.method == "POST":
            campus_id = request.form.get("campus_id", "").strip()
            # Explicit preview shortcut: no student lookup or data loading.
            if campus_id == "-1":
                return redirect(url_for("demo"), code=303)
            invalid = re.fullmatch(r"CID-[0-9]{6}", campus_id) is None
            message = (
                "Enter a campus ID in the form CID-123456, or use -1 for the demo."
                if invalid
                else "Campus sign-in is not connected yet. Enter -1 to explore the demo."
            )
        return render_template(
            "login.html", campus_id=campus_id, message=message, invalid=invalid
        ), 400 if invalid else 200

    @app.get("/demo")
    def demo():
        # Public frontend preview, not an authenticated student session.
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "career-graph"}

    return app
