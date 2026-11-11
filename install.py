#!/usr/bin/env python3
"""Install Folio's Linux menu entry and command without root or pip."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent
data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
applications = data / 'applications'
icons = data / 'icons/hicolor/scalable/apps'
binary = Path.home() / '.local/bin'
for directory in [applications, icons, binary]:
    directory.mkdir(parents=True, exist_ok=True)

launcher = binary / 'folio'
launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(root / 'viewer.py')) + ' "$@"\n')
launcher.chmod(0o755)
shutil.copyfile(root / 'static/icon.svg', icons / 'folio.svg')

def desktop_quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'

entry = applications / 'folio.desktop'
entry.write_text('\n'.join([
    '[Desktop Entry]', 'Version=1.0', 'Type=Application', 'Name=Folio',
    'GenericName=Markdown Viewer', 'Comment=Your words, a little more beautiful.',
    f'Exec={desktop_quote(sys.executable)} {desktop_quote(root / "viewer.py")} -- %F',
    f'TryExec={sys.executable}', 'Icon=folio', 'Terminal=false',
    'Categories=Office;Viewer;', 'Keywords=Markdown;Reader;Notes;MD;',
    'MimeType=text/markdown;text/x-markdown;text/plain;', 'StartupNotify=false', '',
]))
entry.chmod(0o755)
if shutil.which('update-desktop-database'):
    subprocess.run(['update-desktop-database', str(applications)], check=False, capture_output=True)
print(f'Installed Folio in your application menu.\nCommand: {launcher}\nOpen a file: folio /path/to/notes.md\nKeep this project folder in place; the launcher uses it.')
