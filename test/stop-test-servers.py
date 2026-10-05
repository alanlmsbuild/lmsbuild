#!/usr/bin/env python3
# Stops only the test servers: whatever listens on 3002 or 5199 AND is
# either the test API (PORT=3002 in its environment) or the test website
# (vite with test/browser/vite.test.config.mjs). Never touches 3001 or 5173.
import os, re, signal, subprocess

out = subprocess.run(['ss', '-ltnp'], capture_output=True, text=True).stdout
pids = set()
for line in out.splitlines():
    if re.search(r':(3002|5199)\s', line):
        pids.update(int(p) for p in re.findall(r'pid=(\d+)', line))

for pid in sorted(pids):
    try:
        args = open(f'/proc/{pid}/cmdline', 'rb').read().replace(b'\0', b' ').decode().strip()
        env = open(f'/proc/{pid}/environ', 'rb').read().split(b'\0')
    except OSError:
        continue
    test_api = 'server/index.js' in args and b'PORT=3002' in env
    test_site = 'vite' in args and 'vite.test.config' in args
    if test_api or test_site:
        os.kill(pid, signal.SIGTERM)
        print('stopped', pid, args[:80])
    else:
        print('left alone (not a test server)', pid, args[:80])
