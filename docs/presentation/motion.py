"""Omnium v2: one continuous composition, eight beats, 28 seconds.

The logo, search field, map window and reel highlight share geometry across
chapters. Render directly at the requested resolution for fast review loops.
"""
from __future__ import annotations

import argparse
import functools
import json
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

DURATION = 28.0
BPM = 150
BEAT = 60 / BPM
CHAPTERS = [(0, 'Én adresse'), (2.4, 'Omnium'), (4, 'Søk'), (7.2, 'Risiko'),
            (10.4, 'Nærområdet'), (13.6, 'Fakta og kilder'),
            (16.8, 'For / Til'), (23.2, 'Se mer. Vit mer.')]
PAIRS = [('Boligkjøpere', 'boligsjekken'), ('Utbyggere', 'tidlig oversikt'),
         ('Geologer', 'grunnforhold'), ('Kommuner', 'områdeoversikt'),
         ('Turgåere', 'nærmeste tursti'), ('Nysgjerrige', 'nabolaget'),
         ('Deg', 'neste valg')]
REEL_START, REEL_STEP = 17.45, .76
OUT = HERE / 'output'
OUT.mkdir(exist_ok=True)
SCALE = 1.0

CSS = (ROOT / 'web/src/style.css').read_text(encoding='utf-8')
TOKENS = dict(re.findall(r'--([\w-]+):\s*(#[\da-fA-F]{6})', CSS))
def color(name):
    v = TOKENS[name]
    return tuple(int(v[i:i+2], 16) for i in (1, 3, 5))
PAPER, WHITE, INK = color('paper'), color('surface'), color('ink')
TEAL, NAVY, ORANGE = color('teal'), color('navy'), color('orange')
MUTED, LINE, WATER = color('ink-muted'), color('line'), color('map-water')
GREEN, BAD = color('green'), color('bad')

def clamp(x, a=0., b=1.): return max(a, min(b, x))
def ease(x): return 1 - (1 - clamp(x)) ** 4
def smooth(x):
    x = clamp(x)
    return x*x*(3-2*x)
def lerp(a,b,p): return a+(b-a)*p
def blend(a,b,p): return tuple(round(lerp(x,y,p)) for x,y in zip(a,b))
def gate(t,start,end,fade=.23):
    return min(ease((t-start)/fade), smooth((end-t)/fade))
def xy(values): return tuple(round(v*SCALE) for v in values)
def px(value): return max(1,round(value*SCALE))

@functools.lru_cache(maxsize=256)
def font(size, weight=600):
    f = ImageFont.truetype(str(HERE/'assets/Outfit.ttf'),size)
    f.set_variation_by_axes([weight])
    return f

def measure(s,size,weight=600): return font(px(size),weight).getlength(s)/SCALE

@functools.lru_cache(maxsize=384)
def glyph(s,size,weight,ink):
    f=font(size,weight)
    im=Image.new('RGBA',(math.ceil(f.getlength(s))+6,math.ceil(size*1.45)))
    # One ascender line for every word: accents must not shift the baseline.
    reference_top=f.getbbox('ÉÅHg',anchor='la')[1]
    ImageDraw.Draw(im).text((2,-reference_top),s,font=f,fill=ink,anchor='la')
    return im

@functools.lru_cache(maxsize=32)
def asset(name):
    if name in ('mark','word'):
        original=Image.open(ROOT/'docs/brand/omnium-logo.png').convert('RGBA')
        if name=='mark':
            im=original.crop((363,292,887,807))
            m=Image.new('L',im.size)
            ImageDraw.Draw(m).ellipse((0,0,523,514),fill=255)
            im.putalpha(m)
            return im
        im=original.crop((256,812,1000,963))
        # Remove only the pale paper from this placement, preserving the wordmark.
        # Alpha extraction avoids a visible rectangular patch on tinted paper.
        a=np.asarray(im).copy()
        a[:,:,3]=np.clip((242-a[:,:,:3].min(axis=2).astype(float))*2,0,255).astype('uint8')
        return Image.fromarray(a)
    return Image.open(HERE/'assets/captures'/f'{name}.png').convert('RGB')

class Canvas:
    def __init__(self,bg=PAPER):
        self.im=Image.new('RGB',xy((1920,1080)),bg)
        self.d=ImageDraw.Draw(self.im)
        self.bg=bg

    def box(self,box,radius,fill,outline=None,stroke=1):
        self.d.rounded_rectangle(xy(box),radius=px(radius),fill=fill,outline=outline,width=px(stroke))

    def stroke(self,points,ink,weight=2):
        self.d.line([xy(p) for p in points],fill=ink,width=px(weight),joint='curve')

    def circle(self,cx,cy,r,ink,outline=None,weight=1):
        self.d.ellipse(xy((cx-r,cy-r,cx+r,cy+r)),fill=ink,outline=outline,width=px(weight))

    def text(self,s,x,y,size=60,ink=INK,weight=600,alpha=1,align='left'):
        if alpha<=0: return
        tile=glyph(s,px(size),weight,ink)
        if align=='center': x-=measure(s,size,weight)/2
        if align=='right': x-=measure(s,size,weight)
        if alpha<.999:
            tile=tile.copy()
            tile.putalpha(tile.getchannel('A').point(lambda p:round(p*alpha)))
        self.im.paste(tile,xy((x,y)),tile)

    def words(self,s,x,y,size,t,start,end,ink=INK,weight=600,align='left',stagger=.045):
        if t<start or t>end: return
        if align=='center': x-=measure(s,size,weight)/2
        out=smooth((end-t)/.24)
        for i,word in enumerate(s.split(' ')):
            at=start+i*stagger
            p=ease((t-at)/.42)
            self.text(word,x+(1-p)*16,y+(1-p)*54-(1-out)*34,size,ink,weight,p*out)
            x+=measure(word+' ',size,weight)

    def picture(self,name,rect,crop=None,radius=0,alpha=1):
        if alpha<=0: return
        x,y,w,h=rect
        if w<2 or h<2: return
        im=asset(name)
        if crop: im=im.crop(tuple(round(v) for v in crop))
        # Cover with preserved aspect ratio. A moving crop changes the camera,
        # never the shape of letters, map features or the brand mark.
        tw,th=px(w),px(h)
        factor=max(tw/im.width,th/im.height)
        im=im.resize((max(tw,round(im.width*factor)),max(th,round(im.height*factor))),Image.Resampling.LANCZOS)
        dx=(im.width-tw)//2;dy=(im.height-th)//2
        im=im.crop((dx,dy,dx+tw,dy+th))
        m=Image.new('L',(tw,th))
        ImageDraw.Draw(m).rounded_rectangle((0,0,tw-1,th-1),radius=px(radius) if radius else 0,fill=round(255*alpha))
        if im.mode=='RGBA':
            m=Image.fromarray((np.asarray(m).astype('uint16')*np.asarray(im.getchannel('A'))//255).astype('uint8'))
        self.im.paste(im,xy((x,y)),m)

    def logo(self,cx,cy,size,alpha=1,angle=0):
        im=asset('mark')
        if angle: im=im.rotate(angle,Image.Resampling.BICUBIC)
        im=im.resize((px(size),px(size)),Image.Resampling.LANCZOS)
        if alpha<1:
            im.putalpha(im.getchannel('A').point(lambda v:round(v*alpha)))
        self.im.paste(im,xy((cx-size/2,cy-size/2)),im)

    def ring(self,cx,cy,r,progress=1,weight=6,alpha=1,rotation=0):
        for i in range(round(150*clamp(progress))):
            f=i/150
            col=blend(ORANGE,TEAL,min(1,f*2)) if f<.5 else blend(TEAL,NAVY,(f-.5)*2)
            col=blend(self.bg,col,alpha)
            self.d.arc(xy((cx-r,cy-r,cx+r,cy+r)),i*2.4-90+rotation,(i+1)*2.4-89+rotation,fill=col,width=px(weight))

def track(t,keys):
    """Smooth keyframes with actual resting intervals, shared by every scene."""
    if t<=keys[0][0]: return keys[0][1]
    for (a,va),(b,vb) in zip(keys,keys[1:]):
        if t<=b:
            p=smooth((t-a)/(b-a))
            return tuple(lerp(x,y,p) for x,y in zip(va,vb))
    return keys[-1][1]

# One persistent shape: logo outline -> search pill -> map -> summary -> reel
# selection -> logo. There are no whole-frame slide wipes between chapters.
WINDOW=[
    (3.45,(750,180,420,420,210)), (3.85,(880,410,160,160,80)),
    (4.35,(330,410,1260,140,70)), (5.25,(330,410,1260,140,70)),
    (6.05,(610,180,1210,681,30)), (7.05,(610,180,1210,681,30)),
    (7.8,(850,140,970,790,32)), (10.15,(850,140,970,790,32)),
    (10.95,(980,160,840,730,32)), (13.25,(980,160,840,730,32)),
    (14.1,(1080,125,650,830,32)), (16.1,(1080,125,650,830,32)),
    (16.95,(110,530,1700,156,40)), (22.75,(110,530,1700,156,40)),
    (23.65,(750,210,420,420,210)), (28,(750,210,420,420,210)),
]

def background(t):
    dark=smooth((t-13.28)/.48)*(1-smooth((t-16.15)/.55))
    bg=blend(PAPER,INK,dark)
    c=Canvas(bg)
    # Broad drifting contour arcs evoke a map without representing geographic data.
    for i in range(4):
        r=470+i*55+10*math.sin(t*.5+i*.3)
        ink=blend(bg,TEAL,.10 if dark<.5 else .15)
        c.d.arc(xy((1460-r,-190-r,1460+r,-190+r)),20+t*.7,165+t*.7,fill=ink,width=px(2))
    return c

def shared_window(c,t):
    if t<3.45 or t>24: return
    x,y,w,h,r=track(t,WINDOW)
    alpha=gate(t,3.45,24,.35)
    surface=blend(c.bg,WHITE,alpha)
    c.box((x+6,y+12,x+w+6,y+h+12),r,blend(c.bg,INK,.06*alpha))
    c.box((x,y,x+w,y+h),r,surface,blend(c.bg,LINE,alpha),2)
    a=gate(t,5.45,16.65,.5)
    if a<=0: return
    rect=(x,y,w,h)
    # Search camera settles onto the map; source coordinates are observed pixels.
    z=smooth((t-7.08)/.85)
    drift=12*smooth((t-7.8)/2.4)
    risk_crop=tuple(lerp(v,q,z) for v,q in zip((0,0,1280,720),(480+drift,64+drift,1280-drift,720-drift)))
    if t<10.9:
        c.picture('risk',rect,risk_crop,r,a)
    if 10.2<t<14.1:
        q=smooth((t-10.2)/.65)
        drift=10*smooth((t-10.4)/2.8)
        c.picture('neighborhood',rect,(480+drift,64+drift,1280-drift,720-drift),r,a*q)
    if t>=13.35:
        q=smooth((t-13.35)/.65)
        # Readable excerpt of the real AI summary. No simulated product card.
        shift=22*smooth((t-14.1)/1.7)
        c.picture('summary',rect,(27,72+shift,437,596+shift),r,a*q)
    if 7.7<t<13.4:
        c.text('© Kartverket',x+w-22,y+h-35,19,INK,400,alpha=gate(t,7.7,13.4),align='right')

def opening(c,t):
    end=2.45
    c.words('Én adresse.',245,355,170,t,.05,end)
    c.words('Hvor mye vet du?',252,570,58,t,.62,end,TEAL,400)
    p=ease(t/.72)
    cx,cy,size=track(t,[(0,(1510,480,80)),(.8,(1510,480,380)),(1.95,(1510,480,380)),(2.65,(960,390,420))])
    c.logo(cx,cy,size,angle=(1-p)*-45)
    # An orange underline draws toward the ring and follows it into the next beat.
    q=ease((t-.65)/.55)
    if t<2.35:
        a=1-smooth((t-1.95)/.4)
        c.stroke([(255,675),(255+750*q,675)],blend(PAPER,ORANGE,a),7)
        c.circle(255+750*q,675,7,blend(PAPER,ORANGE,a))
    c.ring(cx,cy,size/2+35,ease((t-.2)/.85),3,gate(t,.1,3.5),rotation=t*20)

def brand_and_search(c,t):
    if 2.1<=t<3.9:
        if t>=2.65: c.logo(960,390,420,1-smooth((t-3.4)/.45))
        a=gate(t,2.4,3.75)
        c.picture('word',(655,650,610,124),alpha=a)
        c.words('Alt starter her.',960,824,48,t,2.65,3.65,TEAL,400,'center')
    if 3.75<=t<5.65:
        x,y,w,h,r=track(t,WINDOW)
        cx=x+min(h*.5,79);cy=y+h/2
        c.logo(cx,cy,clamp(h*.47,66,130),gate(t,3.75,5.65))
        a=gate(t,4.25,5.55,.18)
        typed='Arendalsgata 22'[:round(clamp((t-4.2)/.85)*14)]
        c.text(typed,475,451,51,INK,500,a)
        if t<5.15: c.text('|',477+measure(typed,51,500),449,51,TEAL,400,a)
        c.words('Søk opp en adresse.',960,255,82,t,3.95,5.55,INK,600,'center')
    for i,s in enumerate(['Søk.','Se.','Forstå.']):
        c.words(s,110,270+i*145,108,t,5.35+i*.16,7.3,TEAL if i==2 else INK)

def risks(c,t):
    c.words('Se',110,215,132,t,7.18,10.55)
    c.words('risikoen.',110,355,132,t,7.3,10.55,TEAL)
    a=gate(t,7.85,10.45)
    p=ease((t-7.85)/.45)
    # Keep the severity word and the complete factual warning in frame.
    c.picture('risk',(110,570+(1-p)*60,650,106),(26,388,438,455),26,a)
    c.words('Varsler. Score. Forklaring.',112,748,43,t,8.1,10.5,MUTED,400)
    c.words('Se faresonene på kartet.',112,815,37,t,8.35,10.5,MUTED,400)

def icon(c,kind,x,y,ink):
    if kind==0:
        c.stroke([(x,y+28),(x+26,y+5),(x+52,y+28)],ink,4)
        c.stroke([(x+8,y+25),(x+8,y+57),(x+44,y+57),(x+44,y+25)],ink,4)
        c.stroke([(x+22,y+56),(x+22,y+37),(x+32,y+37),(x+32,y+56)],ink,3)
    elif kind==1:
        c.box((x+7,y+4,x+45,y+50),7,None,ink,4)
        c.stroke([(x+8,y+29),(x+44,y+29)],ink,3)
        c.circle(x+16,y+49,5,ink);c.circle(x+36,y+49,5,ink)
    else:
        c.stroke([(x+3,y+56),(x+26,y+9),(x+48,y+56),(x+3,y+56)],ink,4)
        c.stroke([(x+26,y+55),(x+26,y+65)],ink,4)

def neighborhood(c,t):
    c.words('Se',110,168,112,t,10.42,13.65)
    c.words('mulighetene.',110,290,102,t,10.54,13.65,TEAL)
    items=[('Skole og barnehage','Hverdagen i nærheten'),
           ('Buss og kollektiv','For reisen videre'),
           ('Natur og friluft','Rom for en pause')]
    for i,(title,sub) in enumerate(items):
        at=10.85+i*.26;a=gate(t,at,13.58)
        if not a: continue
        p=ease((t-at)/.5)
        x=110-(1-p)*70;y=450+i*145
        c.box((x,y,x+740,y+121),25,blend(c.bg,WHITE,a))
        ink=blend(c.bg,[TEAL,ORANGE,GREEN][i],a)
        icon(c,i,x+26,y+25,ink)
        c.text(title,x+112,y+24,39,INK,600,a)
        c.text(sub,x+112,y+75,27,MUTED,400,a)

def trust(c,t):
    c.words('Fakta.',110,210,132,t,13.62,16.85,WHITE)
    c.words('Kilder.',110,353,132,t,13.78,16.85,WATER)
    c.words('Forklart.',110,496,132,t,13.94,16.85,WHITE)
    c.words('AI-sammendrag fra faktaene.',114,743,43,t,14.2,16.8,WHITE,400)
    c.words('Mangler data? Det sier vi.',114,820,39,t,14.45,16.8,WATER,400)

def reel_pos(t):
    if t<REEL_START: return 0
    k=(t-REEL_START)/REEL_STEP
    idx=min(6,int(k))
    # Nearly half a second of legible rest, then one fluid upward roll.
    return min(6,idx+smooth((k-idx-.52)/.48))

def reel(c,words,x,position,ink,alpha):
    # Clip on its own layer, so neighboring rows cannot bleed into the headings.
    strip=Canvas(PAPER)
    strip.im=c.im.copy()
    for i,word in enumerate(words):
        yy=567+(i-position)*146
        if yy<360 or yy>890: continue
        dist=abs(i-position)
        strength=max(.14,1-dist*.76)*alpha
        size=min(84,84*(720/max(720,measure(word,84))))
        strip.text(word,x,yy,size,blend(PAPER,ink,strength),600)
    x1,y1,x2,y2=xy((x-8,425,x+760,851))
    tile=strip.im.crop((x1,y1,x2,y2))
    a=np.asarray(tile).copy()
    n=tile.height
    ramp=np.clip(np.minimum(np.arange(n)/px(68),(n-1-np.arange(n))/px(68)),0,1)[:,None,None]
    a=(a*ramp+np.array(PAPER)*(1-ramp)).astype('uint8')
    c.im.paste(Image.fromarray(a),(x1,y1))

def audiences(c,t):
    a=gate(t,16.65,23.25,.32)
    if not a: return
    c.words('For alle som vil vite mer.',960,185,80,t,16.65,23.15,INK,600,'center')
    c.words('For',140,350,44,t,16.75,23.18,TEAL,500)
    c.words('Til',1055,350,44,t,16.86,23.18,TEAL,500)
    p=reel_pos(t)
    reel(c,[a for a,b in PAIRS],140,p,TEAL,a)
    reel(c,[b for a,b in PAIRS],1055,p,INK,a)
    # Shared highlight stays put: the eye follows the words, not the whole canvas.
    for x,w in [(110,790),(1025,790)]:
        c.stroke([(x,530),(x+w,530)],blend(PAPER,LINE,a),2)
        c.stroke([(x,686),(x+w,686)],blend(PAPER,LINE,a),2)
    if t<23.05: c.logo(960,606,72,alpha=a)
    # Small progress ticks communicate many options without competing with copy.
    for i in range(len(PAIRS)):
        q=1-abs(p-i)
        c.box((818+i*43,925,844+i*43,931),3,blend(PAPER,TEAL,(.2+.8*clamp(q))*a))

def ending(c,t):
    if t<23.05: return
    p=smooth((t-23.05)/.65)
    c.logo(960,lerp(606,420,p),lerp(72,420,p))
    c.ring(960,420,245,1,3,gate(t,23.3,25),rotation=t*10)
    c.picture('word',(620,680,680,138),alpha=gate(t,23.65,29,.45))
    c.words('Se mer. Vit mer.',960,855,72,t,24.15,29,TEAL,500,'center')
    c.words('Offentlige data · Oslo og Akershus',960,970,30,t,24.6,29,MUTED,400,'center')

def frame(t):
    c=background(t)
    shared_window(c,t)
    if t<2.65: opening(c,t)
    if 2.1<=t<7.3: brand_and_search(c,t)
    if 7.18<=t<10.55: risks(c,t)
    if 10.42<=t<13.65: neighborhood(c,t)
    if 13.62<=t<16.85: trust(c,t)
    if 16.65<=t<23.25: audiences(c,t)
    ending(c,t)
    # A restrained progress trail replaces slide numbers and presentation chrome.
    if t<23.1:
        c.stroke([(96,1028),(96+1728*clamp(t/23.1),1028)],blend(c.bg,TEAL,.2),2)
    return c.im

def soundtrack(path):
    sr=48000;n=round(DURATION*sr)
    out=np.zeros(n,dtype=np.float64)
    rng=np.random.default_rng(17)
    def add(at,data,amp):
        start=round(at*sr);length=min(len(data),n-start)
        if start>=0 and length>0: out[start:start+length]+=data[:length]*amp
    for at in np.arange(0,26,BEAT):
        tt=np.arange(round(.23*sr))/sr
        phase=2*np.pi*(46*tt+65*.025*(1-np.exp(-tt/.025)))
        add(at,np.sin(phase)*np.exp(-tt*24),.20)
        ht=np.arange(round(.05*sr))/sr
        add(at+BEAT/2,rng.standard_normal(len(ht))*np.exp(-ht*100),.018)
    notes=[220,329.628,277.183,415.305,329.628,277.183,246.942,329.628]
    for k,at in enumerate(np.arange(0,26,BEAT/2)):
        tt=np.arange(round(.3*sr))/sr
        f=notes[k%len(notes)]
        env=(1-np.exp(-tt*180))*np.exp(-tt*13)
        add(at,(np.sin(2*np.pi*f*tt)+.15*np.sin(4*np.pi*f*tt))*env,.042)
    for at,_ in CHAPTERS[1:]:
        tt=np.arange(round(.32*sr))/sr
        noise=np.convolve(rng.standard_normal(len(tt)),np.ones(12)/12,mode='same')
        add(at-.14,noise*np.sin(np.pi*tt/.32)**2,.075)
    for i in range(6):
        tt=np.arange(round(.035*sr))/sr
        add(REEL_START+(i+1)*REEL_STEP,np.sin(2*np.pi*1300*tt)*np.exp(-tt*140),.035)
    # Resolve to a quiet chord beneath the final logo, not an abrupt cutoff.
    tt=np.arange(round(4.4*sr))/sr
    chord=sum(np.sin(2*np.pi*f*tt) for f in (220,277.183,329.628))/3
    add(23.6,chord*(1-np.exp(-tt*7))*np.exp(-tt*.65),.07)
    tt=np.arange(n)/sr
    out*=np.clip(tt/.2,0,1)*np.clip((DURATION-tt)/.9,0,1)
    out=np.tanh(out)
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((np.stack([out,out*.98],axis=1)*32767).astype('<i2').tobytes())

def review_images(prefix='v2'):
    times=[1.3,2.9,4.95,6.6,8.8,12.0,15.4,18.0,20.3,22.6,23.75,26.4]
    sheet=Image.new('RGB',(1200,6*368),PAPER)
    for i,t in enumerate(times):
        pic=frame(t)
        pic.save(OUT/f'{prefix}-frame-{t:05.2f}.jpg',quality=92)
        x=i%2*600;y=i//2*368
        sheet.paste(pic.resize((600,338),Image.Resampling.LANCZOS),(x,y))
        ImageDraw.Draw(sheet).text((x+12,y+341),f'{t:.2f}s',font=font(20,500),fill=INK)
    sheet.save(OUT/f'{prefix}-storyboard.jpg',quality=92)
    # Temporal strips, not only attractive resting frames: judge actual continuity.
    samples=[3.4,3.65,3.9,4.15,5.3,5.55,5.8,6.05,7.1,7.35,7.6,7.85,
             13.3,13.55,13.8,14.05,16.2,16.45,16.7,16.95,22.8,23.05,23.3,23.55]
    strip=Image.new('RGB',(1280,6*200),PAPER)
    for i,t in enumerate(samples):
        pic=frame(t).resize((320,180),Image.Resampling.LANCZOS)
        x=i%4*320;y=i//4*200
        strip.paste(pic,(x,y))
        ImageDraw.Draw(strip).text((x+8,y+181),f'{t:.2f}s',font=font(15,500),fill=INK)
    strip.save(OUT/f'{prefix}-transitions.jpg',quality=93)
    frame(26.4).save(OUT/'poster-v2.jpg',quality=95)
    (OUT/'chapters.json').write_text(json.dumps({'duration':DURATION,'chapters':CHAPTERS},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Storyboard: {OUT / (prefix+"-storyboard.jpg")}',flush=True)

def render(name,fps):
    import imageio_ffmpeg
    ff=imageio_ffmpeg.get_ffmpeg_exe()
    audio_path=OUT/f'{name}-soundtrack.wav'
    soundtrack(audio_path)
    target=OUT/f'{name}.mp4'
    partial=OUT/f'{name}.partial.mp4'
    w,h=xy((1920,1080))
    cmd=[ff,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}',
         '-r',str(fps),'-i','-','-i',str(audio_path),'-c:v','libx264','-preset','fast',
         '-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',
         '-t',str(DURATION),str(partial)]
    with (OUT/f'{name}-encoder.log').open('w') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        try:
            for i in range(round(DURATION*fps)):
                proc.stdin.write(frame(i/fps).tobytes())
                if i%(fps*4)==0: print(f'{i/fps:.0f}/{DURATION:.0f}s',flush=True)
        finally:
            proc.stdin.close();code=proc.wait()
        if code: raise RuntimeError('Encoding failed; see encoder log.')
    # Check the entire encoded stream before replacing a previous deliverable.
    result=subprocess.run([ff,'-v','error','-i',str(partial),'-f','null','-'],capture_output=True,text=True)
    if result.returncode or result.stderr: raise RuntimeError(result.stderr or 'Decode failed')
    partial.replace(target)
    report={'duration':DURATION,'width':w,'height':h,'fps':fps,'frames':round(DURATION*fps),
            'decodeErrors':0,'bytes':target.stat().st_size,'chapters':CHAPTERS}
    (OUT/f'{name}-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(f'Verified video: {target}',flush=True)

def main():
    global SCALE
    p=argparse.ArgumentParser()
    p.add_argument('--preview',action='store_true')
    p.add_argument('--width',type=int,default=1920)
    p.add_argument('--fps',type=int,default=60)
    p.add_argument('--name',default='omnium-v2')
    a=p.parse_args()
    if a.width<320 or a.width%32 or not 1<=a.fps<=60:
        p.error('Width must be a multiple of 32 >=320; fps must be 1–60.')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',a.name): p.error('Name may contain letters, numbers, underscores and hyphens.')
    SCALE=a.width/1920
    review_images(a.name)
    if not a.preview: render(a.name,a.fps)

if __name__=='__main__': main()
