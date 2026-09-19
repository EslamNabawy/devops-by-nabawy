import re

d = open(r'C:/Users/eslam/OneDrive/Desktop/CI CD/CI-CD/website/scripts/build.py', 'rb').read().decode('utf-8')
for m in re.finditer(r'[Rr]elated [Bb]ooks', d):
    i = m.start()
    print(repr(d[max(0, i - 700):i + 300]))
    print('======')
