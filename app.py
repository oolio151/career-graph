import os
import secrets
from pathlib import Path

from flask import Flask, redirect, render_template, request, session, url_for
from dotenv import load_dotenv
from python.api import api
from python.auth import current_profile, select_profile


def create_app():
    load_dotenv(Path(__file__).resolve().parent / '.env')
    app = Flask(__name__)
    app.config.update(
        MAX_CONTENT_LENGTH=32 * 1024,
        SECRET_KEY=os.environ.get('SECRET_KEY') or secrets.token_hex(32),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        GEMINI_API_KEY=os.environ.get('GEMINI_API_KEY', ''),
        GEMINI_MODEL=os.environ.get('GEMINI_MODEL', 'gemini-3.8-flash'),
    )
    app.register_blueprint(api)

    @app.route('/', methods=['GET', 'POST'])
    @app.route('/login', methods=['GET', 'POST'])
    def index():
        campus_id, message, invalid = '', None, False
        if request.method == 'POST':
            campus_id = request.form.get('campus_id', '').strip().upper()
            if campus_id == '-1':
                session.clear()
                return redirect(url_for('demo'), code=303)
            try:
                select_profile(campus_id)
                return redirect(url_for('workspace'), code=303)
            except ValueError as error:
                message, invalid = str(error), True
        return render_template('login.html', campus_id=campus_id,
                               message=message, invalid=invalid), 400 if invalid else 200

    @app.get('/workspace')
    def workspace():
        profile = current_profile()
        if not profile:
            return redirect(url_for('index'))
        return render_template('index.html', initial_profile=profile)

    @app.get('/demo')
    def demo():
        return render_template('index.html', initial_profile=None)

    @app.post('/logout')
    def logout():
        session.clear()
        return redirect(url_for('index'), code=303)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'app': 'career-graph'}

    return app
