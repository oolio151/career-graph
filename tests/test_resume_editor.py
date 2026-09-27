import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app import create_app
from gemini import Gemini, GeminiError
from python import resume_editor
from python.resume_editor import (extract_pdf, extract_latex, apply_latex_lines, compile_latex,
                                   make_pdf, propose_edits)


class EditorTests(unittest.TestCase):
    def test_vercel_cache_is_writable_copy_and_preserves_downloads(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle = root / 'bundle'
            (bundle / 'cache').mkdir(parents=True)
            (bundle / 'cache/package').write_text('seed')
            with patch.dict(os.environ, {'VERCEL': '1'}), \
                    patch.object(resume_editor, '_LATEX_BUNDLE', bundle), \
                    patch('python.resume_editor.tempfile.gettempdir', return_value=temp):
                cache = resume_editor._latex_cache()
                self.assertNotEqual(cache, bundle / 'cache')
                self.assertEqual((cache / 'package').read_text(), 'seed')
                (cache / 'package').write_text('runtime update')
                self.assertEqual((resume_editor._latex_cache() / 'package').read_text(), 'runtime update')
                self.assertEqual((bundle / 'cache/package').read_text(), 'seed')

    def test_edit_request_uses_json_and_longer_timeout(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'candidates': [{'content': {'parts': [
            {'thought': True, 'text': 'internal'}, {'text': '{"reply":"Hello","edits":[]}'}]}}]}).encode()
        with patch('gemini.urllib.request.urlopen', return_value=response) as request:
            reply = Gemini('test').generate('resume', json_mode=True)
        config = json.loads(request.call_args.args[0].data)['generationConfig']
        self.assertEqual(config['responseMimeType'], 'application/json')
        self.assertEqual(request.call_args.kwargs['timeout'], 90)
        self.assertEqual(json.loads(reply)['edits'], [])

    def test_compile_failure_is_not_an_approximate_pdf(self):
        source = b'\\documentclass{article}\n\\begin{document}\nResume\n\\end{document}\n'
        with tempfile.TemporaryDirectory() as temp:
            app = create_app({'TESTING': True, 'SECRET_KEY': 'test', 'UPLOAD_DIR': Path(temp)})
            client = app.test_client()
            client.get('/')
            with client.session_transaction() as session:
                headers = {'X-CSRF-Token': session['csrf']}
            client.post('/api/enroll', data={'campus_id': 'CID-116490',
                'resume': (io.BytesIO(source), 'resume.tex')}, headers=headers)
            with patch('app.compile_latex', side_effect=RuntimeError('Missing package example.sty')):
                response = client.post('/api/resume/render', json={'lines': source.decode().splitlines()}, headers=headers)
            self.assertEqual(response.status_code, 422)
            self.assertIn('example.sty', response.json['error'])

    @unittest.skipUnless(Path('instance/bin/tectonic').exists(), 'Local compiler not installed')
    def test_real_compiler_preserves_color(self):
        from pypdf import PdfReader
        source = (br'\documentclass{article}\usepackage{xcolor}'
                  br'\definecolor{headercolor}{RGB}{173,100,82}'
                  br'\begin{document}\textcolor{headercolor}{Resume}\end{document}')
        pdf = PdfReader(compile_latex(source))
        self.assertIn('Resume', pdf.pages[0].extract_text())
        self.assertIn(b'0.678 0.392 0.322 rg', pdf.pages[0].get_contents().get_data())

    def test_latex_source_roundtrip(self):
        source = b"\\documentclass{article}\n\\begin{document}\nBuilt a thing.\n\\end{document}\n"
        self.assertEqual(extract_latex(source).splitlines()[2], 'Built a thing.')
        self.assertEqual(apply_latex_lines(extract_latex(source).splitlines()).decode(), source.decode())
        with self.assertRaises(ValueError):
            extract_latex(b'plain text')

    def test_latex_compiler_reports_missing_tool_cleanly(self):
        source = b"\\documentclass{article}\n\\begin{document}\nResume\n\\end{document}\n"
        # CI does not require TeX to be installed; the renderer must fail with a user-facing error.
        with patch.dict(os.environ, {'LATEX_COMPILER': '/definitely/missing/latex'}):
            with self.assertRaises(RuntimeError):
                compile_latex(source)

    def test_pdf_roundtrip_and_highlight(self):
        lines = ['Example Student', 'Experience', 'Built <widgets> & tools.']
        for changed in ([], [2]):
            data = make_pdf(lines, changed).getvalue()
            self.assertTrue(data.startswith(b'%PDF'))
            text = extract_pdf(data)
            self.assertIn('Built <widgets> & tools.', text)
        with self.assertRaises(ValueError):
            extract_pdf(b'not a pdf')

    def test_proposal_targets_exact_line_and_can_ask_questions(self):
        dataset = Mock()
        dataset.resume_context.return_value = 'Synthetic context'
        model = Mock(enabled=True, model='test')
        lines = ['Name', 'Built a website']
        result = {'reply': 'What did you build and which tools did you use?', 'edits': []}
        model.generate.return_value = json.dumps(result)
        self.assertEqual(propose_edits(dataset, 'id', lines, 'Improve this', [], model)['edits'], [])
        edit = {'line': 2, 'before': lines[1], 'after': 'Developed a website', 'reason': 'Clearer verb'}
        result['edits'] = [edit]
        model.generate.return_value = json.dumps(result)
        self.assertEqual(propose_edits(dataset, 'id', lines, 'Rewrite line 2', [], model)['edits'][0]['line'], 2)
        edit['before'] = 'Text not in the draft'
        model.generate.return_value = json.dumps(result)
        with self.assertRaises(GeminiError):
            propose_edits(dataset, 'id', lines, 'Rewrite line 2', [], model)

    def test_pdf_session_chat_and_followup(self):
        with tempfile.TemporaryDirectory() as temp:
            app = create_app({'TESTING': True, 'SECRET_KEY': 'test', 'UPLOAD_DIR': Path(temp), 'GEMINI_API_KEY': ''})
            client = app.test_client()
            self.assertEqual(client.get('/api/resume/editor').status_code, 401)
            client.get('/')
            with client.session_transaction() as session:
                csrf = session['csrf']
            headers = {'X-CSRF-Token': csrf}
            pdf = make_pdf(['Example Student', 'Experience', 'Built a website'])
            client.post('/api/enroll', data={'campus_id': 'CID-116490', 'resume': (pdf, 'resume.pdf')}, headers=headers)
            preview = client.get('/api/resume/editor')
            self.assertEqual(preview.status_code, 200)
            lines = preview.json['lines']
            model = Mock(enabled=True, model='test')
            model.generate.return_value = json.dumps({'reply': 'Which tools did you use?', 'edits': []})
            app.extensions['gemini'] = model
            response = client.post('/api/resume/editor/chat', json={'lines': lines, 'message': 'Help with my website'}, headers=headers)
            self.assertEqual(response.status_code, 200)
            client.post('/api/resume/editor/chat', json={'lines': lines, 'message': 'I used Flask'}, headers=headers)
            self.assertIn('Which tools did you use?', model.generate.call_args.args[0])
            self.assertEqual(client.post('/api/resume/editor/chat', json={}).status_code, 403)
