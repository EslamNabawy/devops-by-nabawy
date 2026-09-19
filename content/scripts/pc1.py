d = open(r'C:/Users/eslam/OneDrive/Desktop/CI CD/CI-CD/website/scripts/build.py', 'rb').read().decode('utf-8')
i = d.find('class="bookhero"')
print(repr(d[max(0, i - 1200):i + 1500]))
