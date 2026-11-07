"""Omnium / Se mer. Vit mer. Deterministic motion film; no browser required.

python docs/presentation/render.py                # 1920 x 1080, 30 fps, MP4
python docs/presentation/render.py --preview      # storyboard + transition samples
python docs/presentation/render.py --width 1280   # faster review render

All timing is a pure function of time. Edit SCENES, PAIRS and scene functions.
Brand colours are read from the application's CSS, never duplicated here.
"""
from __future__ import annotations

import argparse
import functools
import math
from pathlib import Path
import re
import subprocess
import sys
import wave

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / '.packages'))

from PIL import Image, ImageDraw, ImageFont
import numpy as np

W, H = 1920, 1080
FPS = 30
OUT = HERE / 'output'
OUT.mkdir(exist_ok=True)

css = (ROOT / 'web/src/style.css').read_text(encoding='utf-8')
TOKENS = dict(re.findall(r'--([\w-]+):\s*(#[\da-fA-F]{6})', css))

def col(key):
    h = TOKENS[key]
    return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

PAPER, INK, MUTED = col('paper'), col('ink'), col('ink-muted')
TEAL, ORANGE, NAVY = col('teal'), col('orange'), col('navy')
WHITE, LINE, BAD = col('surface'), col('line'), col('bad')

def clamp(v, a=0, b=1): return max(a, min(b, v))
def ease(v): return 1 - (1 - clamp(v)) ** 4
def smooth(v):
    v = clamp(v)
    return v * v * (3 - 2 * v)
def mix(a, b, v): return a + (b - a) * v
def blend(a, b, v): return tuple(round(mix(x, y, v)) for x, y in zip(a, b))

@functools.lru_cache(maxsize=128)
def font(size, weight=600):
    f = ImageFont.truetype(str(HERE / 'assets/Outfit.ttf'), int(size))
    f.set_variation_by_axes([weight])
    return f

def text(im, content, x, y, size=60, color=INK, weight=600, anchor='lt'):
    ImageDraw.Draw(im).text((round(x), round(y)), content, font=font(size, weight), fill=color, anchor=anchor)

def width(content, size, weight=600):
    return font(size, weight).getlength(content)

def line(im, content, x, y, size, t, delay=0, color=INK, weight=600):
    """Clipped upward reveal: every text line has its own arrival."""
    p = ease((t - delay) / .54)
    if p <= 0: return
    tile = Image.new('RGBA', (W, int(size * 1.6)), (0, 0, 0, 0))
    text(tile, content, 0, (1-p)*size*1.45, size, color, weight)
    im.paste(tile, (round(x), round(y)), tile)

def rounded(im, box, radius, fill, outline=None, stroke=1):
    ImageDraw.Draw(im).rounded_rectangle(tuple(round(v) for v in box), radius=round(radius), fill=fill, outline=outline, width=stroke)

def pill(im, content, x, y, t, delay=0, color=TEAL):
    p = ease((t-delay)/.45)
    if p <= 0: return
    length = width(content, 26, 500) + 48
    y += (1-p)*32
    rounded(im, (x, y, x+length, y+49), 25, blend(PAPER, color, .09))
    text(im, content, x+24, y+10, 26, color, 500)

def load(name): return Image.open(ROOT / name).convert('RGB')
START = load('docs/demo/1-start.png')
CALM = load('docs/demo/2-grevlingasen.png')
RISK = load('docs/demo/4-arendalsgata.png')
DETAIL = load('docs/demo/3-data-point.png')
ORIGINAL_LOGO = load('docs/brand/omnium-logo.png')
# Geometry-preserving crops of the README logo; no redrawing of the identity.
MARK = ORIGINAL_LOGO.crop((363, 292, 887, 807)).convert('RGBA')
mark_mask = Image.new('L', MARK.size)
ImageDraw.Draw(mark_mask).ellipse((0, 0, 523, 514), fill=255)
MARK.putalpha(mark_mask)
WORD = ORIGINAL_LOGO.crop((256, 812, 1000, 963))

def paste(im, asset, x, y, w, h=None, radius=0):
    w = max(1, round(w))
    h = max(1, round(h if h is not None else asset.height*w/asset.width))
    pic = asset.resize((w, h), Image.Resampling.LANCZOS)
    mask = pic.getchannel('A') if pic.mode == 'RGBA' else None
    if radius:
        mask = Image.new('L', (w, h))
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w-1, h-1), radius=radius, fill=255)
    im.paste(pic, (round(x), round(y)), mask)

def mark(im, cx, cy, size, angle=0):
    img = MARK
    if angle:
        img = MARK.rotate(angle, Image.Resampling.BICUBIC, expand=False)
    paste(im, img, cx-size/2, cy-size/2, size, size)

def ring(im, cx, cy, radius, t=1, stroke=5, rotation=0):
    d = ImageDraw.Draw(im)
    for i in range(round(180*clamp(t))):
        f = i/180
        color = blend(ORANGE, TEAL, f*2) if f < .5 else blend(TEAL, NAVY, (f-.5)*2)
        d.arc((round(cx-radius), round(cy-radius), round(cx+radius), round(cy+radius)),
              start=i*2-90+rotation, end=(i+1)*2-89+rotation, fill=color, width=stroke)

def base(dark=False):
    im = Image.new('RGB', (W, H), INK if dark else PAPER)
    # Quiet typographic grid, only at the edge of the composition.
    d = ImageDraw.Draw(im)
    grid = blend(INK, WHITE, .11) if dark else blend(PAPER, TEAL, .08)
    for x in range(48, W, 64):
        for y in (48, H-48): d.ellipse((x, y, x+2, y+2), fill=grid)
    return im

def footer(im, n, label, dark=False):
    color = blend(WHITE, INK, .42) if dark else MUTED
    text(im, f'OMNIUM  /  {label}', 96, 1008, 21, color, 500)
    text(im, f'{n:02d} / 09', 1824, 1008, 21, color, 500, 'rt')

def screenshot(im, asset, x, y, w, t, delay=0, zoom=1):
    p = ease((t-delay)/.72)
    if p <= 0: return
    h = w*asset.height/asset.width
    x += (1-p)*150
    y += (1-p)*40
    rounded(im, (x+9, y+16, x+w+9, y+h+16), 26, blend(PAPER, INK, .10))
    paste(im, asset, x, y, w, h, radius=24)
    # Visible source credit even when the map has been cropped in a later shot.

def hook(t):
    im = base()
    p = ease(t/.9)
    mark(im, 1410, 488, mix(70, 430, p), angle=(1-p)*-65)
    ring(im, 1410, 488, 300, smooth((t-.4)/1.2), 3, rotation=t*10)
    line(im, 'Du ser', 110, 265, 132, t)
    line(im, 'adressen.', 110, 405, 132, t, .23)
    line(im, 'Men ser du alt?', 116, 610, 62, t, 1.15, TEAL, 500)
    d = ImageDraw.Draw(im)
    d.line((116, 715, 116+610*ease((t-1.35)/.55), 715), fill=ORANGE, width=8)
    pill(im, 'Risiko', 1120, 790, t, 1.65)
    pill(im, 'Nabolag', 1285, 790, t, 1.8)
    pill(im, 'Muligheter', 1490, 790, t, 1.95)
    footer(im, 1, 'SE MER')
    return im

def intro(t):
    im = base()
    p = ease(t/.7)
    mark(im, 960, mix(470, 370, p), mix(240, 430, p), angle=(1-p)*32)
    # Reveal the original wordmark through a moving crop, like a typeset line.
    word_w = 610
    ph = ease((t-.2)/.7)
    tile = Image.new('RGB', (word_w, 125), PAPER)
    paste(tile, WORD, 0, (1-ph)*140, word_w)
    im.paste(tile, (655, 610))
    line(im, 'Én adresse. Et større bilde.', 523, 799, 62, t, .7, TEAL, 500)
    footer(im, 2, 'MØT OMNIUM')
    return im

def search(t):
    im = base()
    p = ease((t-1.1)/.95)
    line(im, 'Søk.', 105, 190, 115, t)
    line(im, 'Se.', 105, 324, 115, t, .32)
    line(im, 'Forstå.', 105, 458, 115, t, .64, TEAL)
    # The typed search field physically grows into the product screenshot.
    x, y = mix(760, 720, p), mix(400, 170, p)
    w, h = mix(1000, 1100, p), mix(120, 688, p)
    rounded(im, (x+8,y+14,x+w+8,y+h+14), 30, blend(PAPER, INK, .08))
    rounded(im, (x,y,x+w,y+h), mix(60,24,p), WHITE)
    if p < .85:
        ImageDraw.Draw(im).ellipse((x+36,y+40,x+66,y+70), outline=TEAL,width=4)
        ImageDraw.Draw(im).line((x+63,y+67,x+77,y+82),fill=TEAL,width=4)
        typed = 'Grevlingåsen 17'[:round(clamp(t/.8)*14)]
        text(im, typed + ('|' if t<1 else ''), x+100,y+36,42,INK,500)
    if p > .25:
        shot = CALM.resize((round(w),round(h)),Image.Resampling.LANCZOS)
        mask = Image.new('L', shot.size)
        ImageDraw.Draw(mask).rounded_rectangle((0,0,shot.width-1,shot.height-1),radius=24,fill=round(255*clamp((p-.25)/.5)))
        im.paste(shot,(round(x),round(y)),mask)
    line(im, 'Søk opp en eiendom.', 112, 720, 39, t, 1.4, MUTED, 400)
    line(im, 'Få oversikten.', 112, 775, 39, t, 1.6, MUTED, 400)
    footer(im, 3, 'FRA ADRESSE TIL OVERSIKT')
    return im

def risk(t):
    im = base()
    line(im, 'Oppdag', 105, 168, 98, t)
    line(im, 'det skjulte.', 105, 280, 98, t, .18, TEAL)
    screenshot(im, RISK, 780, 165, 1040, t, .2)
    # This is a real crop of the score and warning, enlarged for readability.
    card = RISK.crop((26,179,453,416))
    p = ease((t-.65)/.6)
    if p:
        paste(im, card, 110, 470+(1-p)*100, 570, radius=26)
    line(im, 'Risiko først. Med en forklaring.', 110, 847, 35, t, 1.45, MUTED, 400)
    pill(im, 'Kvikkleire', 790, 860, t, 1.35, BAD)
    pill(im, 'Radon', 1010, 860, t, 1.55, BAD)
    pill(im, 'Støy', 1173, 860, t, 1.75, BAD)
    footer(im, 4, 'SCORE + VARSLER')
    return im

def context(t):
    im = base()
    line(im, 'Mer enn', 110, 140, 104, t)
    line(im, 'en tomt.', 110, 252, 104, t, .18, TEAL)
    # A map window and a readable set of actual supported categories.
    map_crop = CALM.crop((480,64,1440,900))
    screenshot(im, map_crop, 1040, 142, 775, t, .12)
    items = [('Grunn og naturfare','Hva ligger under og rundt?'),
             ('Miljø og støy','Hva påvirker hverdagen?'),
             ('Skole og kollektiv','Hva finnes i nærheten?'),
             ('Natur og friluft','Hvor går neste tur?')]
    for i,(a,b) in enumerate(items):
        delay = .4+i*.33
        p = ease((t-delay)/.55)
        y = 438+i*112+(1-p)*60
        if p<=0: continue
        rounded(im,(110,y,940,y+92),20,WHITE)
        ImageDraw.Draw(im).ellipse((132,y+30,155,y+53),fill=[ORANGE,TEAL,col('green'),NAVY][i])
        text(im,a,182,y+15,35,INK,600)
        text(im,b,182,y+55,23,MUTED,400)
    text(im,'© Kartverket',1788,858,18,INK,400,'rt')
    footer(im, 5, 'HELE NÆROMRÅDET')
    return im

def trust(t):
    im = base(True)
    line(im, 'Fakta.', 105, 165, 116, t, color=WHITE)
    line(im, 'Kilder.', 105, 295, 116, t, .2, col('map-water'))
    line(im, 'Forklart.', 105, 425, 116, t, .4, WHITE)
    # True source/explanation UI, separate from the editorial summary feature copy.
    crop = DETAIL.crop((0,70,480,900)).resize((620,1072),Image.Resampling.LANCZOS)
    offset = round(292*smooth((t-1.1)/2.3))
    crop = crop.crop((0,offset,620,offset+780))
    p = ease((t-.3)/.8)
    paste(im,crop,1035+(1-p)*200,130,620,780,radius=26)
    line(im,'Kort sammendrag fra faktaene.',112,667,42,t,.9,WHITE,400)
    line(im,'AI når tilgjengelig.',112,725,34,t,1.15,col('map-water'),400)
    line(im,'Mangler data? Det sier vi.',112,835,36,t,1.5,WHITE,500)
    footer(im, 6, 'ÅPNE OFFENTLIGE DATA', True)
    return im

PAIRS = [
    ('Boligkjøpere', 'boligsjekken'),
    ('Utbyggere', 'tidlig oversikt'),
    ('Geologer', 'grunnforhold'),
    ('Kommuner', 'områdeoversikt'),
    ('Turgåere', 'nærmeste tursti'),
    ('Nysgjerrige', 'nabolaget'),
    ('Deg', 'neste valg'),
]

def reel_position(t):
    # Short readable holds, fast eased scrolls; both columns visibly roll.
    if t < .65: return 0
    k = (t-.65)/.78
    idx = min(6, int(k))
    return min(6, idx + ease((k-idx-.43)/.57))

def reel(im, words, x, y, w, position, color, delay_offset=0):
    viewport = Image.new('RGB',(w,390),PAPER)
    d=ImageDraw.Draw(viewport)
    pos=clamp(position-delay_offset,0,6)
    for i,word in enumerate(words):
        yy=153+(i-pos)*132
        dist=abs(i-pos)
        if yy < -100 or yy > 400: continue
        ink=blend(color,PAPER,min(.83,dist*.65))
        sz=70 if width(word,70)>w-20 else 76
        text(viewport,word,30,yy,sz,ink,600)
    # Fade edges into paper, preserving the slot-machine feel.
    a=np.asarray(viewport).copy()
    ramp=np.minimum(np.arange(390)/65,(389-np.arange(390))/65)
    ramp=np.clip(ramp,0,1)[:,None,None]
    a=(a*ramp+np.array(PAPER)*(1-ramp)).astype('uint8')
    im.paste(Image.fromarray(a),(x,y))

def audiences(t):
    im=base()
    line(im,'Mange mennesker.',110,125,85,t)
    line(im,'Mange muligheter.',110,223,85,t,.18,TEAL)
    line(im,'For',140,415,45,t,.2,INK,500)
    line(im,'Til',1055,415,45,t,.3,INK,500)
    p=reel_position(t)
    reel(im,[a for a,b in PAIRS],110,445,790,p,TEAL)
    reel(im,[b for a,b in PAIRS],1025,445,790,p,INK,.065 if p<6 else 0)
    d=ImageDraw.Draw(im)
    for x,w in [(110,790),(1025,790)]:
        d.line((x,586,x+w,586),fill=LINE,width=2)
        d.line((x,714,x+w,714),fill=LINE,width=2)
    cx,cy=960,650
    pulse=1+math.sin(t*math.pi*2/.78)*.05
    mark(im,cx,cy,74*pulse)
    line(im,'Én inngang til kunnskap om stedet.',110,883,40,t,.55,MUTED,400)
    footer(im,7,'FOR DEG. TIL NESTE VALG.')
    return im

def converge(t):
    im=base()
    p=ease(t/1.1)
    words=['Grunn','Miljø','Natur','Skole','Kollektiv','Risiko']
    for i,word in enumerate(words):
        angle=2*math.pi*i/6-.4
        r=mix(620,205,p)
        x=960+math.cos(angle)*r
        y=440+math.sin(angle)*r*.65
        alpha=1-smooth((t-1)/.5)
        if alpha>0:
            text(im,word,x,y,38,blend(PAPER,TEAL,alpha),500,'mm')
    mark(im,960,420,mix(90,370,p),angle=(1-p)*-30)
    ring(im,960,420,mix(650,240,p),1,3,rotation=t*18)
    line(im,'Mange behov.',605,725,83,t,.45)
    line(im,'Ett kart.',787,825,83,t,.85,TEAL)
    footer(im,8,'SAMLET I OMNIUM')
    return im

def closing(t):
    im=base()
    p=ease(t/.9)
    mark(im,960,365,mix(320,470,p))
    # Outer ring gently resolves into the original brand silhouette.
    if t<1:
        ring(im,960,365,260+50*(1-p),1,3)
    paste(im,WORD,635,620,650)
    line(im,'Se mer. Vit mer.',665,809,77,t,.4,TEAL,500)
    line(im,'Offentlige data · Oslo og Akershus',638,934,35,t,.8,MUTED,400)
    return im

SCENES=[(3.0,hook),(3.0,intro),(4.0,search),(4.5,risk),(4.0,context),
        (4.0,trust),(7.0,audiences),(3.0,converge),(4.0,closing)]
DURATION=sum(d for d,_ in SCENES)

def scene_at(t):
    start=0
    for i,(duration,scene) in enumerate(SCENES):
        if t < start+duration or i==len(SCENES)-1:
            return i,t-start,start
        start+=duration

def frame(t):
    i,local,start=scene_at(t)
    im=SCENES[i][1](local)
    transition=.40
    if i and local<transition:
        p=smooth(local/transition)
        old=SCENES[i-1][1](SCENES[i-1][0]+local)
        # Shared circular portal for the two logo reveals; a quick horizontal
        # push elsewhere carries the typography into the next composition.
        if i in (1,8):
            mask=Image.new('L',(W,H))
            r=1300*p
            ImageDraw.Draw(mask).ellipse((960-r,540-r,960+r,540+r),fill=255)
            old.paste(im,(0,0),mask)
            im=old
        else:
            canvas=base(i==5)
            canvas.paste(old,(-round(W*p),0))
            canvas.paste(im,(round(W*(1-p)),0))
            im=canvas
    return im

def audio(path):
    """Original procedural 120 BPM pulse, ticks and transition sweeps.

    No sampled music, voice, or reference-video audio is used.
    """
    sr=48000
    count=round(DURATION*sr)
    result=np.zeros(count,dtype=np.float64)
    rng=np.random.default_rng(9)
    def add(start,data,amp=1):
        n=min(len(data),count-round(start*sr))
        if n>0: result[round(start*sr):round(start*sr)+n] += data[:n]*amp
    for beat in np.arange(0,DURATION,.5):
        tt=np.arange(round(.22*sr))/sr
        phase=2*np.pi*(44*tt+70*.028*(1-np.exp(-tt/.028)))
        add(beat,np.sin(phase)*np.exp(-tt*23),.20)
        ht=np.arange(round(.055*sr))/sr
        hat=rng.standard_normal(len(ht))*np.exp(-ht*100)
        add(beat+.25,hat,.018)
    # Soft arpeggio. Its restrained rhythm leaves room for spoken pitching.
    notes=[220,277.1826,329.6276,415.3047,329.6276,277.1826,246.9417,329.6276]
    for k,at in enumerate(np.arange(0,DURATION,.25)):
        tt=np.arange(round(.32*sr))/sr
        env=(1-np.exp(-tt*200))*np.exp(-tt*11)
        f=notes[k%len(notes)]
        sig=(np.sin(2*np.pi*f*tt)+.23*np.sin(4*np.pi*f*tt))*env
        add(at,sig,.043)
    cuts=np.cumsum([d for d,_ in SCENES])[:-1]
    for at in cuts:
        tt=np.arange(round(.36*sr))/sr
        noise=rng.standard_normal(len(tt))
        noise=np.convolve(noise,np.ones(9)/9,mode='same')
        add(max(0,at-.18),noise*np.sin(np.pi*tt/.36)**2,.09)
    # Reinforce each reel stop with a tiny mechanical click.
    for at in np.arange(23.15,28.7,.78):
        tt=np.arange(round(.045*sr))/sr
        add(at,np.sin(2*np.pi*1200*tt)*np.exp(-tt*120),.045)
    tt=np.arange(count)/sr
    result*=np.clip(tt/.3,0,1)*np.clip((DURATION-tt)/.8,0,1)
    result=np.tanh(result*.95)
    stereo=np.stack((result,result*.97),axis=1)
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(sr)
        wav.writeframes((stereo*32767).astype('<i2').tobytes())

def storyboard():
    times=[1.9,4.7,8.7,12.4,16.9,21.1,25.0,28.7,31.4,35.1]
    sheet=Image.new('RGB',(1200,5*370),PAPER)
    for i,t in enumerate(times):
        im=frame(t)
        im.save(OUT/f'frame-{t:04.1f}.jpg',quality=92)
        thumb=im.resize((600,338),Image.Resampling.LANCZOS)
        x=(i%2)*600;y=(i//2)*370
        sheet.paste(thumb,(x,y))
        text(sheet,f'{t:04.1f}s',x+12,y+343,20,INK,500)
    sheet.save(OUT/'storyboard.jpg',quality=92)
    # Include actual transitions and a frame from the fast scrolling interval.
    check=[3.15,6.2,10.2,18.7,23.05,24.30,32.7]
    strips=Image.new('RGB',(640,360*len(check)),PAPER)
    for i,t in enumerate(check):
        strips.paste(frame(t).resize((640,360)),(0,i*360))
    strips.save(OUT/'transitions.jpg',quality=90)
    frame(35.1).save(OUT/'poster.jpg',quality=95)
    print(OUT/'storyboard.jpg',flush=True)

def render(output_width, fps):
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    audio_path=OUT/'soundtrack.wav'
    audio(audio_path)
    target=OUT/'omnium-presentation.mp4'
    height=round(output_width*9/16)//2*2
    cmd=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24',
         '-s',f'{output_width}x{height}','-r',str(fps),'-i','-',
         '-i',str(audio_path),'-c:v','libx264','-preset','fast','-crf','18',
         '-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',
         '-t',str(DURATION),str(target)]
    with (OUT/'encoder.log').open('w') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        try:
            for i in range(round(DURATION*fps)):
                im=frame(i/fps)
                if output_width!=W: im=im.resize((output_width,height),Image.Resampling.LANCZOS)
                proc.stdin.write(im.tobytes())
                if i%(fps*3)==0: print(f'{i/fps:.0f}/{DURATION:.1f}s rendered',flush=True)
        finally:
            proc.stdin.close()
            code=proc.wait()
        if code: raise RuntimeError(f'Encoder failed ({code}); see output/encoder.log')
    print(f'VIDEO: {target}',flush=True)

if __name__=='__main__':
    args=argparse.ArgumentParser()
    args.add_argument('--preview',action='store_true')
    args.add_argument('--width',type=int,default=1920)
    args.add_argument('--fps',type=int,default=30)
    config=args.parse_args()
    if config.width<320 or config.width%2 or not 1<=config.fps<=60:
        args.error('Use an even width >=320 and fps from 1 to 60.')
    storyboard()
    if not config.preview: render(config.width,config.fps)
