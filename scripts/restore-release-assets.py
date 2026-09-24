"""Restore original Actions artifacts, refusing to overwrite different release assets."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlparse


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def main():
    tag, run = os.environ['RELEASE_TAG'], os.environ['SOURCE_RUN']
    repo = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag) or not run.isdigit():
        raise ValueError('Invalid release tag or source run ID')
    release = json.loads(gh('api', f'repos/{repo}/releases/tags/{tag}'))
    work = Path(os.environ['RUNNER_TEMP']) / 'release-recovery'
    work.mkdir()
    gh('run', 'download', run, '--repo', repo, '--pattern', 'henkan-*', '--dir', str(work / 'bundles'))
    gh('run', 'download', run, '--repo', repo, '--name', 'updater-json', '--dir', str(work / 'manifest'))
    manifest_file = work / 'manifest/updater.json'
    manifest = json.loads(manifest_file.read_text())
    if manifest['version'] != tag[1:]:
        raise ValueError('Artifact version does not match destination release')
    files = {}
    extensions = ('.exe', '.exe.sig', '.msi', '.msi.sig', '.dmg', '.AppImage', '.AppImage.sig', '.app.tar.gz', '.app.tar.gz.sig', '.AppImage.tar.gz', '.AppImage.tar.gz.sig')
    for file in (work / 'bundles').rglob('*'):
        if not file.is_file() or 'Contents' in file.parts or not file.name.endswith(extensions):
            continue
        if file.name in files and files[file.name].read_bytes() != file.read_bytes():
            raise ValueError(f'Conflicting artifact filename: {file.name}')
        files[file.name] = file
    for suffixes in [('.exe', '.msi'), ('.AppImage',), ('.dmg',)]:
        if not any(name.endswith(suffixes) for name in files):
            raise ValueError(f'Missing platform installer: {suffixes}')
    for entry in manifest.get('platforms', {}).values():
        name = unquote(urlparse(entry['url']).path.rsplit('/', 1)[-1])
        if name not in files or name + '.sig' not in files:
            raise ValueError(f'Missing updater payload or signature: {name}')
        if files[name + '.sig'].read_text().strip() != entry['signature'].strip():
            raise ValueError(f'Updater signature mismatch: {name}')
    files['updater.json'] = manifest_file
    existing = {asset['name']: asset for asset in release['assets']}
    pending, evidence = [], {}
    for name, file in files.items():
        digest = 'sha256:' + hashlib.sha256(file.read_bytes()).hexdigest()
        if name in existing:
            asset = existing[name]
            if name == 'updater.json':
                gh('release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', str(work / 'existing'))
                if json.loads((work / 'existing' / name).read_text()) != manifest:
                    raise ValueError('Existing updater manifest differs')
                digest = asset['digest']
            elif asset['size'] != file.stat().st_size or asset.get('digest') != digest:
                raise ValueError(f'Existing asset differs; refusing overwrite: {name}')
        else:
            pending.append(file)
        evidence[name] = digest
    Path('recovery-report.json').write_text(json.dumps({'tag': tag, 'source_run': run, 'sha256': evidence}, indent=2))
    print(f'{tag}: validated {len(files)} original assets; {len(pending)} missing', flush=True)
    if os.environ.get('DRY_RUN', 'true') == 'true':
        print('Dry run: nothing uploaded')
        return
    for file in pending:
        gh('release', 'upload', tag, '--repo', repo, str(file))
        print(f'Restored {file.name}', flush=True)
    actual = json.loads(gh('api', f"repos/{repo}/releases/{release['id']}/assets?per_page=100"))
    by_name = {asset['name']: asset for asset in actual}
    for name, digest in evidence.items():
        if by_name.get(name, {}).get('digest') != digest:
            raise ValueError(f'Uploaded checksum mismatch: {name}')
    print(f'{tag}: all restored asset checksums verified', flush=True)


if __name__ == '__main__':
    main()
