import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from app import create_app
from gemini import GeminiError
from python.connect import draft_email, matches


class ConnectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.app = create_app({'TESTING': True, 'SECRET_KEY': 'test',
                              'UPLOAD_DIR': Path(cls.temp.name), 'GEMINI_API_KEY': ''})
        cls.dataset = cls.app.extensions['career_data']

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_matching_and_position_filter(self):
        result = matches(self.dataset, 'CID-116490')
        self.assertTrue(result['matches'])
        scores = [a['score'] for a in result['matches']]
        self.assertEqual(scores, sorted(scores, reverse=True))
        role = result['matches'][0]['positions'][0]
        filtered = matches(self.dataset, 'CID-116490', [role])
        self.assertTrue(all(role in a['positions'] for a in filtered['matches']))
        with self.assertRaises(ValueError):
            matches(self.dataset, 'CID-116490', ['invented position'])

    def test_draft_excludes_gpa_and_rejects_it_in_reply(self):
        alum = matches(self.dataset, 'CID-116490')['matches'][0]
        gemini = Mock(enabled=True, model='test-model')
        gemini.generate.return_value = 'Subject: Learning about your career\nHello!'
        draft = draft_email(self.dataset, 'CID-116490', alum['campus_id'], [], gemini)
        self.assertEqual(draft['subject'], 'Learning about your career')
        self.assertEqual(draft['body'], 'Hello!')
        context = gemini.generate.call_args.args[0]
        self.assertEqual(json.loads(context)['shared_college'], 'University of Maryland, Baltimore County (UMBC)')
        self.assertNotIn('gpa', context.lower())
        self.assertNotIn('email', context.lower())
        gemini.generate.return_value = 'We share a similar GPA.'
        with self.assertRaises(GeminiError):
            draft_email(self.dataset, 'CID-116490', alum['campus_id'], [], gemini)

    def test_session_csrf_and_page(self):
        client = self.app.test_client()
        self.assertEqual(client.get('/api/connect').status_code, 401)
        client.get('/')
        with client.session_transaction() as session:
            csrf = session['csrf']
        client.post('/api/enroll', data={'campus_id': 'CID-116490'}, headers={'X-CSRF-Token': csrf})
        page = client.get('/app').data
        self.assertIn(b'id="view-connect"', page)
        self.assertNotIn(b'id="view-engagement"', page)
        self.assertEqual(client.get('/api/connect').status_code, 200)
        self.assertEqual(client.post('/api/connect/draft', json={}).status_code, 403)
        alum = client.get('/api/connect').json['matches'][0]['campus_id']
        self.assertEqual(client.post('/api/connect/draft', json={'alumni_id': alum},
                                    headers={'X-CSRF-Token': csrf}).status_code, 503)
