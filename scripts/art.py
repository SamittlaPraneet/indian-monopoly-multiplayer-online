from pathlib import Path
from xml.sax.saxutils import escape
import re,json
content=Path('src/content/board.ts').read_text()
rows=re.findall(r'\[\s*(\d+),\s*"([^"]+)",\s*"([^"]+)",\s*(\d+)',content)
manifest=[]
for ident,name,full,price in rows:
    ident=int(ident)
    hills='<path d="M0 190 130 80 250 185 370 70 520 190 640 100V260H0Z" fill="#689586"/><path d="M220 120v100m15-90v80m155-110v90" stroke="#d9e9db" stroke-width="12"/>'
    sea='<path d="M0 200Q100 185 200 200T400 200T640 200V260H0Z" fill="#6faeac"/>'
    skyline=''.join(f'<rect x="{90+n*65}" y="{130-(n%3)*25}" width="45" height="{90+(n%3)*25}" rx="2" fill="#4d7967"/>' for n in range(7))
    if ident==1: art=hills
    elif ident==16:art=sea+'<rect x="100" y="155" width="430" height="48" rx="24" fill="#506c6b"/><rect x="300" y="112" width="65" height="50" rx="7" fill="#506c6b"/><path d="M330 115V86h20" fill="none" stroke="#506c6b" stroke-width="9"/>'
    elif ident==29:art='<path d="M200 220V125h240v95h-75v-60q-45-80-90 0v60Z" fill="#b68b5c"/>'+''.join(f'<rect x="{x}" y="85" width="26" height="135" fill="#bc976d"/><path d="M{x-3} 85q16-45 32 0Z" fill="#a57a50"/>' for x in [182,222,414,454])
    elif ident in [34,39]:art='<path d="M220 220V105h200v115h-65v-55q-35-55-70 0v55Z" fill="#b58d5d"/><rect x="205" y="85" width="230" height="25" fill="#c19c6c"/>'
    elif ident==31:art=skyline+'<path d="M50 190h540" stroke="#cfb483" stroke-width="14"/><rect x="150" y="145" width="330" height="35" rx="12" fill="#d7d7b8"/>'+''.join(f'<rect x="{x}" y="152" width="28" height="13" rx="2" fill="#638280"/>' for x in range(175,455,40))
    elif ident in [3,11,26,37]:art=sea+skyline
    else:art=skyline
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260" viewBox="0 0 640 260"><title>{escape(name)}: original stylised illustration</title><rect width="640" height="260" fill="#e7e5ce"/><circle cx="515" cy="65" r="28" fill="#e5ba70"/>{art}<path d="M0 235H640" stroke="#385e50" stroke-width="2"/></svg>'
    Path(f'public/art/city-{ident}.svg').write_text(svg)
    manifest.append({'file':f'/art/city-{ident}.svg','creator':'Original project artwork','licence':'Project-owned original artwork','source':'scripts/art.py','description':f'Stylised {name}; illustrative, not an architectural drawing'})
Path('src/content/assets.json').write_text(json.dumps(manifest,indent=2))
Path('public/icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#245a4d"/><path d="M18 46 46 18M23 18h23v23" fill="none" stroke="#efd28a" stroke-width="7"/></svg>')
