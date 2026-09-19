import re

d = open(r'C:/Users/eslam/OneDrive/Desktop/CI CD/CI-CD/website/scripts/build.py', 'rb').read().decode('utf-8')
i = d.find('def related_box_html')
print(repr(d[i:i + 1200]))
print('====== chapnav css ======')
for m in re.finditer(r'\.chapnav[^{]*\{[^}]*\}|\.relatedbox[^{]*\{[^}]*\}|\.relgrid[^{]*\{[^}]*\}|\.relcard[^{]*\{[^}]*\}', d):
    print(repr(m.group(0))[:180])
