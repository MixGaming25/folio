import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from viewer import make_handler, read_document


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler('test-token', []))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, route, headers=None):
        return urlopen(Request(self.base + route, headers=headers or {}), timeout=5)

    def test_static_and_capability(self):
        with self.get('/') as response:
            self.assertIn(b'Markdown document', response.read())
            self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
        with self.assertRaises(HTTPError) as caught:
            self.get('/api/startup')
        self.assertEqual(caught.exception.code, 403)
        with self.get('/api/startup', {'X-Folio-Token': 'test-token'}) as response:
            self.assertEqual(json.load(response)['documents'], [])

    def test_config_cannot_be_loaded_by_other_sites(self):
        for site in ['cross-site', 'same-site']:
            with self.assertRaises(HTTPError) as caught:
                self.get('/config.js', {'Sec-Fetch-Site': site})
            self.assertEqual(caught.exception.code, 403)

    def test_traversal_and_unknown_routes(self):
        for route in ['/../viewer.py', '/%2e%2e/viewer.py', '/api/missing']:
            with self.assertRaises(HTTPError) as caught:
                self.get(route, {'X-Folio-Token': 'test-token'})
            self.assertEqual(caught.exception.code, 404)

    def test_utf8_and_change_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'notes.md'
            path.write_text('\ufeff# Café — hello 世界', encoding='utf-8')
            doc = read_document(path)
            self.assertEqual(doc['content'], '# Café — hello 世界')
            self.assertIsInstance(doc['modified'], str)
            route = '/api/file?' + urlencode({'path': str(path), 'modified': doc['modified']})
            with self.get(route, {'X-Folio-Token': 'test-token'}) as response:
                self.assertTrue(json.load(response)['unchanged'])
            path.write_text('# Changed', encoding='utf-8')
            with self.get(route, {'X-Folio-Token': 'test-token'}) as response:
                self.assertEqual(json.load(response)['content'], '# Changed')

    def test_assets_stay_within_document_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'notes').mkdir()
            (root / 'secret.svg').write_text('<svg/>')
            (root / 'notes' / 'ok.svg').write_text('<svg/>')
            base = {'token': 'test-token', 'base': str(root / 'notes' / 'a.md')}
            with self.get('/api/asset?' + urlencode({**base, 'path': 'ok.svg'})) as response:
                self.assertEqual(response.read(), b'<svg/>')
            with self.assertRaises(HTTPError) as caught:
                self.get('/api/asset?' + urlencode({**base, 'path': '../secret.svg'}))
            self.assertEqual(caught.exception.code, 403)


if __name__ == '__main__':
    unittest.main()
