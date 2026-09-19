import re

d = open(r'C:/Users/eslam/OneDrive/Desktop/CI CD/CI-CD/website/scripts/build.py', 'rb').read().decode('utf-8')
for m in re.finditer(r'\.readcontext[^{]*\{[^}]*\}|\.readcontext [^{]*\{[^}]*\}', d):
    print(repr(m.group(0))[:200])
    print('---')
