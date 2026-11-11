#!/usr/bin/env python3
"""Folio: a private, offline Markdown reader. Python standard library only."""
import argparse
import fcntl
import json
import mimetypes
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
import webbrowser
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
MAX_FILE = 20 * 1024 * 1024
EXTENSIONS = {'.md', '.markdown', '.mdown', '.mkd', '.txt'}


def read_document(filename):
    path = Path(filename).expanduser().resolve()
    if path.suffix.lower() not in EXTENSIONS:
        raise ValueError('Choose a Markdown or plain text file.')
    if path.stat().st_size > MAX_FILE:
        raise ValueError('This file is too large. Folio supports files up to 20 MB.')
    return dict(id=str(path), path=str(path), name=path.name,
                content=path.read_text(encoding='utf-8-sig'), modified=str(path.stat().st_mtime_ns))


def make_handler(token, startup):
    pending = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send_data(self, data, content_type='application/json', status=200):
            if not isinstance(data, bytes):
                data = data.encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def json(self, data, status=200):
            self.send_data(json.dumps(data), status=status)

        def authorized(self):
            # A random capability is required for filesystem access. Never allow
            # another origin to read it or inject a capability through a URL.
            host = self.headers.get('Host', '')
            return host == f'127.0.0.1:{self.server.server_port}' and secrets.compare_digest(self.headers.get('X-Folio-Token', ''), token)

        def do_GET(self):
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            try:
                if url.path.startswith('/api/'):
                    if url.path == '/api/asset':
                        if not secrets.compare_digest(query.get('token', [''])[0], token):
                            return self.json({'error': 'Unauthorized'}, 403)
                        base = Path(query['base'][0]).resolve().parent
                        path = (base / query['path'][0]).resolve()
                        if not path.is_relative_to(base):
                            return self.json({'error': 'Image must be inside the document folder.'}, 403)
                        mime = mimetypes.guess_type(path.name)[0] or ''
                        if mime not in {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif', 'image/bmp'}:
                            return self.json({'error': 'Unsupported image'}, 400)
                        if path.stat().st_size > MAX_FILE:
                            raise ValueError('Image is too large.')
                        return self.send_data(path.read_bytes(), mime)
                    if not self.authorized():
                        return self.json({'error': 'Unauthorized'}, 403)
                    if url.path == '/api/startup':
                        return self.json({'documents': [read_document(f) for f in startup], 'nativePicker': bool(shutil.which('zenity'))})
                    if url.path == '/api/ping':
                        return self.json({'app': 'folio'})
                    if url.path == '/api/pending':
                        documents = pending[:]
                        del pending[:len(documents)]
                        return self.json({'documents': documents})
                    if url.path == '/api/file':
                        path = query['path'][0]
                        if str(Path(path).stat().st_mtime_ns) == query.get('modified', [''])[0]:
                            return self.json({'unchanged': True})
                        return self.json(read_document(path))
                    return self.json({'error': 'Not found'}, 404)
                if url.path == '/config.js':
                    if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
                        return self.json({'error': 'Cross-site access denied'}, 403)
                    return self.send_data('window.FOLIO_TOKEN=' + json.dumps(token) + ';', 'text/javascript')
                relative = unquote(url.path).lstrip('/') or 'index.html'
                path = (ROOT / 'static' / relative).resolve()
                if not path.is_relative_to(ROOT / 'static') or not path.is_file():
                    return self.json({'error': 'Not found'}, 404)
                self.send_data(path.read_bytes(), mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
            except (OSError, ValueError, KeyError) as error:
                self.json({'error': str(error)}, 400)

        def do_POST(self):
            if not self.authorized():
                return self.json({'error': 'Unauthorized'}, 403)
            try:
                if self.path == '/api/queue':
                    length = int(self.headers.get('Content-Length', '0'))
                    if length > 65536:
                        return self.json({'error': 'Request too large'}, 413)
                    data = json.loads(self.rfile.read(length))
                    documents = [read_document(f) for f in data['files']]
                    pending.extend(documents)
                    return self.json({'ok': True})
                if self.path != '/api/open':
                    return self.json({'error': 'Not found'}, 404)
                if not shutil.which('zenity'):
                    return self.json({'fallback': True})
                result = subprocess.run(['zenity', '--file-selection', '--multiple', '--separator=\n',
                                         '--title=Open Markdown in Folio',
                                         '--file-filter=Markdown files | *.md *.markdown *.mdown *.mkd *.txt',
                                         '--file-filter=All files | *'], capture_output=True, text=True, timeout=300)
                if result.returncode:
                    return self.json({'documents': []})
                documents, errors = [], []
                for filename in result.stdout.strip().splitlines():
                    try:
                        documents.append(read_document(filename))
                    except (OSError, ValueError) as error:
                        errors.append(str(error))
                self.json({'documents': documents, 'errors': errors})
            except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
                self.json({'error': str(error)}, 400)
    return Handler


def main():
    parser = argparse.ArgumentParser(description='Folio — your local Markdown reading room')
    parser.add_argument('files', nargs='*', help='Markdown files to open')
    parser.add_argument('--port', type=int, default=4179)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    args.files = [str(Path(f).expanduser().resolve()) for f in args.files]
    for filename in args.files:
        try:
            read_document(filename)
        except (OSError, ValueError) as error:
            parser.error(str(error))
    # Keep one stable origin so saved history survives application launches.
    runtime = Path(os.environ.get('XDG_RUNTIME_DIR', f'/tmp/folio-{os.getuid()}')) / 'folio'
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(runtime, 0o700)
    lock = (runtime / f'instance-{args.port}.lock').open('w')
    state_file = runtime / f'instance-{args.port}.json'
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        try:
            state = json.loads(state_file.read_text())
            url = state['url']
            request = Request(url + '/api/queue', data=json.dumps({'files': args.files}).encode(),
                              headers={'X-Folio-Token': state['token'], 'Content-Type': 'application/json'})
            with urlopen(request, timeout=5) as response:
                response.read()
            if not args.no_browser:
                webbrowser.open(url)
            print(f'Opened in the running Folio instance: {url}')
            return
        except (OSError, ValueError, KeyError) as error:
            parser.error(f'Could not contact the running Folio instance: {error}')
    token = secrets.token_urlsafe(32)
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(token, args.files))
    except OSError:
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(token, args.files))
    url = f'http://127.0.0.1:{server.server_port}'
    state_file.write_text(json.dumps({'url': url, 'token': token}))
    state_file.chmod(0o600)
    print(f'Folio is ready at {url}\nPress Ctrl+C to close.', flush=True)
    if not args.no_browser:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nFolio closed.')
    finally:
        server.server_close()
        state_file.unlink(missing_ok=True)
        lock.close()


if __name__ == '__main__':
    main()
